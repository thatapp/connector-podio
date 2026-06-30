'use strict';
var API_URL = 'https://api.podio.com';
var request = require('request');
var Q = require('q');
var _ = require('lodash');
var util = require('util');
var oauthUtils = require('./helpers/oauth-utils.js');
var errors = require('./helpers/errors.js');
const axios = require('axios');
var handlebars = require('hbs').handlebars;

// In-process lock around OAuth token refresh. When multiple actions race to
// refresh (typically during a large batch that crosses the 8h token boundary),
// only ONE refresh proceeds; the rest wait for it and reuse the fresh cfg.
// Without this, concurrent 401s caused multiple parallel refreshes + a race
// on the credential-store PATCH, and the losers kept using stale tokens —
// resulting in records dropping silently mid-batch.
let podioRefreshLock = null;

function Podio(cfg, context) {
    this.cfg = cfg;
    this.context = context;
}

// A single request may legitimately refresh once (token expired mid-flight).
// More than this means the freshly-refreshed token is STILL being rejected —
// keep going and the 401 -> refresh -> 401 cycle never settles, so the action
// "spins" forever with no error. Cap it and surface a clear failure instead.
var MAX_REFRESH_ATTEMPTS = 2;

Podio.prototype.request = function (method, path, params, formData, headers) {
    var defered = Q.defer();
    var that = this;
    var refreshAttempts = 0;
    if (!headers) {
        headers = {
            Authorization: 'OAuth2 ' + this.cfg.oauth.access_token
        };
    }
    var requestParams = {
        method: method,
        baseUrl: API_URL,
        url: path,
        headers: headers,
        json: true
    };

    if (formData) {
        requestParams.formData = formData;
    }

    if (params) {
        if (method.toUpperCase() === 'GET') {
            requestParams.qs = params;
        } else {
            requestParams.body = params;
        }
    }

    request(requestParams, responseHandler);

    async function responseHandler(err, response, body) {
        if (err) {
            // Transport-level error (network, DNS, timeout). Mark retryable so
            // the iPaaS sailor auto-retries per its 10-retry exponential-backoff
            // policy. See docs.elastic.io/developers/error-retry.html.
            err.retry = true;
            return defered.reject(err);
        }

        // Rate-limit headroom early-warning. If Podio's remaining-budget header
        // drops below threshold, surface it via Bunyan logger (B.6 will unify
        // logging; for now fall back to console.warn when no platform context).
        try {
            const rawRemaining = response.headers && response.headers['x-rate-limit-remaining'];
            const remaining = parseInt(rawRemaining, 10);
            if (Number.isFinite(remaining) && remaining < 500) {
                const logger = (that.context && that.context.logger) || console;
                logger.warn(`Podio rate-limit remaining: ${remaining} (partner ceiling 75000/hr)`);
            }
        } catch (e) { /* noop */ }

        if (401 === response.statusCode) {
            // Bail out of an unbounded 401 -> refresh -> 401 loop. Without this
            // cap a token that refreshes successfully but is still rejected by
            // Podio spins forever and never rejects the deferred.
            if (refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
                var loopErr = new Error(
                    'Podio kept returning 401 (unauthorized) after refreshing the access token ' +
                    refreshAttempts + ' time(s). Aborting to avoid an endless refresh loop — the ' +
                    'token may lack access to this resource, or the credential needs to be reconnected.'
                );
                loopErr.statusCode = 401;
                loopErr.kind = 'UNAUTHORIZED';
                return defered.reject(loopErr);
            }
            refreshAttempts++;

            // Concurrent-refresh guard. If another action is already refreshing,
            // wait for the in-flight refresh to complete; then update OUR cfg
            // and retry the original request with the fresh access_token.
            if (podioRefreshLock) {
                return podioRefreshLock
                    .then((freshCfg) => {
                        that.cfg = freshCfg;
                        requestParams.headers.Authorization = 'OAuth2 ' + freshCfg.oauth.access_token;
                        request(requestParams, responseHandler);
                    })
                    .catch((refreshErr) => {
                        refreshErr.retry = true;
                        defered.reject(refreshErr);
                    });
            }

            // First 401 of the race — initiate the refresh. The original
            // `onTokenRefresh` callback handled success but unconditionally
            // assigned the callback arg to `that.cfg` — including when the
            // arg was an Error (refresh failure), which then threw TypeError
            // on `cfg.oauth.access_token`. Properly distinguish here:
            podioRefreshLock = new Promise((resolveLock, rejectLock) => {
                oauthUtils.refreshAppToken('podio', that.cfg, function (newCfgOrErr) {
                    if (newCfgOrErr instanceof Error) {
                        podioRefreshLock = null;
                        // A failed refresh is usually a transient blip (network /
                        // 5xx on the token endpoint) and is safe to retry. But
                        // invalid_grant / oauth.grant.expired means Podio has
                        // permanently invalidated the refresh_token — it rotates on
                        // every use and expires after prolonged inactivity. Retrying
                        // re-sends the same dead token and burns all 10 backoff
                        // attempts, surfacing a confusing raw 400 body. Classify it
                        // as a clear, NON-retryable "reconnect the account" error.
                        const refreshErr = classifyRefreshError(newCfgOrErr);
                        rejectLock(refreshErr);
                        return defered.reject(refreshErr);
                    }
                    // Happy path: existing logic assigns cfg, PATCHes the
                    // credential store, re-runs THIS request via onTokenRefresh.
                    onTokenRefresh(newCfgOrErr);
                    // Release lock so concurrent waiters can use the fresh cfg.
                    podioRefreshLock = null;
                    resolveLock(newCfgOrErr);
                });
            });
            return;
        }

        if (response.statusCode >= 400) {
            // Normalize ALL non-success responses through the central classifier.
            // Callers and the platform retry loop get:
            //   - err.retry = true for 420 (rate_limit) and 5xx (server errors),
            //     enabling the sailor's auto-retry. This is the headline fix for
            //     "iPaaS shows N processed but Podio has fewer" reports.
            //   - err.errorParameters surfacing Podio's "Must be one of {…}"
            //     allowed-value set when present.
            //   - err.kind diagnostic class (ROUTE_GONE / RESOURCE_MISSING /
            //     FORBIDDEN / INVALID_REFERENCE / RATE_LIMIT / PROVIDER_ERROR /
            //     UNAUTHORIZED / SERVER_ERROR / OTHER) — see helpers/errors.js.
            const normalized = errors.normalizePodioError(
                response.statusCode,
                (typeof body === 'object' && body !== null) ? body : {}
            );
            return defered.reject(normalized);
        }

        // Success path
        if (body !== undefined && body !== null) {
            // Previously the code did `body.headers = response.headers` directly.
            // For ARRAY responses (most list endpoints — `/app/`, `/bulletin/`,
            // `/contact/`, `/tag/app/{id}/`, etc.) that adds an enumerable
            // non-index property to an Array, which downstream serializers
            // handle inconsistently (JSON.stringify drops it; Object.keys
            // includes it). Attach as a non-enumerable property on objects
            // only; leave arrays untouched.
            if (!Array.isArray(body) && typeof body === 'object' && response.headers) {
                try {
                    Object.defineProperty(body, 'headers', {
                        value: response.headers,
                        enumerable: false,
                        writable: false,
                        configurable: true,
                    });
                } catch (e) { /* noop — body may be frozen */ }
            }
        }
        return defered.resolve(body);
    }

    function onTokenRefresh(cfg) {
        that.cfg = cfg;
        updateToken(cfg);
        requestParams.headers.Authorization = 'OAuth2 ' + cfg.oauth.access_token;

        request(requestParams, responseHandler);
    }

    async function updateToken(cfg) {
        console.log('Updating component credentials with new access token');
        var data = {
            data: {
                id: cfg._account,
                type: "credential",
                attributes: {
                    keys: {
                        oauth: cfg.oauth,
                    }
                },
            }
        };

        var appDef = require('./component.json');
        var credentials = appDef.credentials || {};
        var oauth2 = credentials["oauth2"];


        var email = getValueFromEnv(oauth2['email']);
        var avaApi = getValueFromEnv(oauth2['apiKey']);

        const token = Buffer.from(`${email}:${avaApi}`, 'utf8').toString('base64')
        await axios.patch(`https://api.thatapp.io/v2/credentials/${cfg._account}`, data,
            {
                headers: {
                    'Authorization': `Basic ${token}`
                },
            }
        ).catch((errr) => {
            console.log(errr);
        });

        // Emit updateKeys event per thatapp.io docs to persist refreshed tokens
        if (that.context && that.context.emit) {
            that.context.emit('updateKeys', { oauth: cfg.oauth });
        }
    }

    return defered.promise;
};

Podio.prototype.get = function (path, params, headers) {
    return this.request('GET', path, params, null, headers);
};

Podio.prototype.post = function (path, params, formData, headers) {
    return this.request('POST', path, params, formData, headers);
};

Podio.prototype.put = function (path, params) {
    return this.request('PUT', path, params);
};

Podio.prototype.delete = function (path, params) {
    return this.request('DELETE', path, params);
};

// Podio.prototype.uploadFileFromStream = function(fileName, source) {
//     var that = this;
//     var deferred = Q.defer();
//
//     source.on('error', deferred.reject);
//     source.pipe(concatStream(gotFile));
//
//     function gotFile(buffer) {
//         var formData = {
//             filename: fileName,
//                 source: {
//                 value:  buffer,
//                     options: {
//                     filename: fileName
//                 }
//             }
//         };
//
//         deferred.resolve(that.post('/file/', null, formData));
//     }
//
//     return deferred.promise;
// };

Podio.prototype.attachFile = function (fileId, refType, refId) {
    var params = {
        ref_type: refType,
        ref_id: refId
    };
    return this.post('/file/' + fileId + '/attach', params);
};

// Distinguish a permanently-expired Podio OAuth grant (re-auth required) from a
// transient refresh failure (retryable). The error from helpers/http-utils.js
// carries the raw token-endpoint body on `.responseBody`.
function classifyRefreshError(err) {
    var body = err && err.responseBody;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = null; }
    }
    var expiredGrant = body && (body.error === 'invalid_grant' ||
        body.error_detail === 'oauth.grant.expired');

    if (expiredGrant) {
        var reauth = new Error(
            'Podio authorization has expired and could not be refreshed. ' +
            'Please reconnect your Podio account (re-run the OAuth authorization) ' +
            'for this credential, then retry. Podio refresh tokens are valid for ' +
            '28 days and rotate on every refresh (each refresh issues a new token ' +
            'and invalidates the old one), so a credential that goes 28 days ' +
            'without a refresh — or whose rotated token was not persisted — ' +
            'requires a fresh authorization.'
        );
        reauth.statusCode = 401;
        reauth.podioError = 'invalid_grant';
        reauth.kind = 'UNAUTHORIZED';
        reauth.retry = false;   // permanent — retrying re-sends the dead token
        return reauth;
    }

    // Network error / 5xx on the token endpoint — plausibly transient.
    err.retry = true;
    return err;
}

function getValueFromEnv(key) {
    var compiled = handlebars.compile(key);
    var value = compiled(process.env);
    if (value) {
        return value;
    }
    throw new Error(util.format("No value is defined for environment variable: '%s'", key));
}

module.exports = Podio;
