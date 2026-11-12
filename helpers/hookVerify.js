'use strict';

// Podio hook validation for every read (GET) operation (GitLab #476, owner directive 2026-11-12:
// "if the incoming payload contains a code that means it's a hook validation and it needs to
// respond to the hook using the /hook/verify Podio api endpoint").
//
// Podio verifies a hook by POSTing type=hook.verify, hook_id and code to the hook's address
// (https://developers.podio.com/doc/hooks). A flow whose first step is a read operation gets
// that delivery as its message body, so the operation must answer it: call
// POST /hook/{hook_id}/verify/validate with {code} under the step's own Podio sign-in, then end
// without emitting data. Anything that is not a validation is left to the operation untouched.
//
// What the platform's hook path hands the step (read on the engine, ai-engine/pwa-digest/runtime/
// webhook-trigger.js, prepareFlowHook): msg.body is the parsed delivery, a form or JSON body
// spread flat, with the receiver's own fields added (_query, _headers, _method, _url,
// _additionalUrlPath). So a validation is msg.body.type === 'hook.verify' with msg.body.hook_id
// and msg.body.code.
//
// ONE helper, used by every read operation through guard(): an operation's module ends with
//   exports.process = require('<path>/helpers/hookVerify').guard(exports.process);

const Podio = require('../podio');

const HOOK_VERIFY = 'hook.verify';

/** The delivery fields when the message is a Podio hook validation, else null. */
function validationOf(msg) {
    const body = msg && msg.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body.type === HOOK_VERIFY ? body : null;
}

/**
 * Answer a hook validation. Returns true when the message WAS a validation (handled: the caller
 * must stop, nothing further is processed or emitted as data), false when it is not.
 */
async function handle(context, msg, cfg) {
    const body = validationOf(msg);
    if (!body) return false;

    const hookId = body.hook_id === undefined || body.hook_id === null ? '' : String(body.hook_id).trim();
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    // hook_id is placed in a URL path: only a positive whole number is allowed.
    if (!/^[1-9][0-9]*$/.test(hookId) || !code) {
        context.emit('error', new Error('A Podio hook.verify delivery must carry a numeric hook_id and the code; Podio was not called'));
        return true;
    }

    try {
        await new Podio(cfg, context).post('/hook/' + hookId + '/verify/validate', { code });
        context.emit('end');
    } catch (err) {
        context.emit('error', err);
    }
    return true;
}

/** Wrap an operation's process() so a hook validation is answered before normal processing. */
function guard(processFn) {
    return async function process(msg, cfg) {
        if (await handle(this, msg, cfg)) return undefined;
        return processFn.apply(this, arguments);
    };
}

module.exports = { guard, handle, validationOf, HOOK_VERIFY };
