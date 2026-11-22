'use strict';
var API_URL = 'https://api.podio.com';
var request = require('request');
var Q = require('q');
var _ = require('lodash');
var util = require('util');
var oauthUtils = require('./helpers/oauth-utils.js');
var errors = require('./helpers/errors.js');
const axios = require('axios');
var handlebars = require('handlebars');

const { createHash } = require('crypto');
const refreshes = new Map();

function refreshKey(cfg) {
    // A legacy caller without a stored credential ID can share only its own configuration object.
    if (!cfg._account || !cfg.oauth?.refresh_token) return cfg;
    return JSON.stringify([String(cfg._account), createHash('sha256').update(cfg.oauth.refresh_token).digest('hex')]);
}

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
    const { withPodioRetries } = require('./helpers/request-retries');
    return Q(withPodioRetries(this.cfg, String(method).toUpperCase(),
        () => this.requestOnce(method, path, params, formData, headers)));
};

Podio.prototype.requestOnce = function (method, path, params, formData, headers) {
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

    // Podio's numeric raw-file route returns bytes, including for text attachments.
    const rawFile = method === 'GET' && /^\/file\/[1-9]\d*\/raw$/.test(path);
    if (rawFile) {
        requestParams.json = false;
        requestParams.encoding = null;
    }
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
        if (rawFile && response && Buffer.isBuffer(body)) {
            if (response.statusCode >= 200 && response.statusCode < 300) {
                body = body.toString('base64');
            } else {
                try { body = JSON.parse(body.toString('utf8')); } catch (_) { body = {}; }
            }
        }
        if (err) {
            // The request policy decides whether another attempt is safe for this method.
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

            const key = refreshKey(that.cfg);
            let refresh = refreshes.get(key);
            if (!refresh) {
                // Register the promise before calling the adapter, even when it responds synchronously.
                refresh = Promise.resolve().then(() => new Promise((resolve, reject) => {
                    const pending = oauthUtils.refreshAppToken('podio', that.cfg, result => {
                        if (result instanceof Error) return reject(classifyRefreshError(result));
                        if (!result?.oauth?.access_token) return reject(new Error('Podio did not return a refreshed access token.'));
                        resolve(result);
                    });
                    Promise.resolve(pending).catch(reject);
                })).then(async cfg => {
                    await updateToken(cfg);
                    return cfg.oauth;
                }).finally(() => refreshes.delete(key));
                refreshes.set(key, refresh);
            }
            refresh.then(oauth => {
                that.cfg = { ...that.cfg, oauth };
                requestParams.headers.Authorization = 'OAuth2 ' + oauth.access_token;
                request(requestParams, responseHandler);
            }).catch(error => defered.reject(error));
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


        try {
            if (cfg._account) {
                const email = getValueFromEnv(oauth2.email);
                const apiKey = getValueFromEnv(oauth2.apiKey);
                const authorization = Buffer.from(email + ':' + apiKey, 'utf8').toString('base64');
                await axios.patch('https://api.thatapp.io/v2/credentials/' + encodeURIComponent(cfg._account), data, {
                    headers: { Authorization: 'Basic ' + authorization },
                });
            }
        } catch (error) {
            const logger = that.context?.logger || console;
            logger.warn('Could not update the stored Podio credential over HTTP' +
                (error.response?.status ? ' (HTTP ' + error.response.status + ')' : '') + '.');
        }

        // Emit updateKeys event per thatapp.io docs to persist refreshed tokens
        if (that.context && that.context.emit) {
            await that.context.emit('updateKeys', { oauth: cfg.oauth });
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
