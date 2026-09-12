'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Create one or more Podio webhooks.
 *
 * IMPORTANT — calculation fields silently never fire (audit Part 5):
 *   When `hookType === 'field'`, registering an `item.update` hook on a
 *   calculation field succeeds (the create returns a hook_id) BUT THE HOOK
 *   NEVER FIRES. This is by Podio design — calculation fields are recomputed
 *   asynchronously and don't emit `item.update` events.
 *
 *   Bridge pattern: use a Podio Workflow Automation flow to write the
 *   calculated value into a regular stored field; subscribe the hook to
 *   THAT field.
 *
 *   This action will pre-flight the field's type IF `appId` is provided
 *   in the action config (optional, for back-compat). When provided and
 *   the field is `type: "calculation"`, the action fails fast with the
 *   bridge guidance instead of creating a dead hook.
 *
 * Allowed event types per scope (audit Part 5, live-verified):
 *   - space:     app.create, contact.*, member.*, status.*, task.create/update
 *   - app:       app.update, app.delete, comment.create/delete, file.change,
 *                form.*, item.create/update/delete, tag.add/delete
 *   - app_field: item.update (THE ONLY VALID TYPE — previously the menu
 *                fell through to the full `app` event list, surfacing
 *                options that always fail at submit time)
 *
 * Partial-failure rollback:
 *   When asked to install multiple types in one call, if any fails after
 *   one or more have succeeded, the successful hook_ids are best-effort
 *   DELETEd before the action emits the error. Avoids orphan hooks the
 *   customer has to clean up by hand.
 */
exports.process = async function createHooks(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { ref_id, url } = msg.body || {};
    const types = cfg.hook_type || [];

    let refType;
    if (cfg.hookType === 'space') refType = 'space';
    else if (cfg.hookType === 'app') refType = 'app';
    else refType = 'app_field';

    if (!ref_id) {
        return that.emit('error', new Error('ref_id is required (space_id, app_id, or field_id depending on scope)'));
    }
    if (!url) {
        return that.emit('error', new Error('url is required — the webhook target URL Podio will POST to'));
    }
    if (!Array.isArray(types) || types.length === 0) {
        return that.emit('error', new Error('hook_type must be a non-empty array of Podio event types'));
    }

    // Optional pre-flight: calc-field guard. Only runs when scope=field AND
    // the customer configured `cfg.appId` so we know the parent app to ask
    // about the field's type. Without appId, we skip silently (preserves
    // back-compat with flows that don't set it).
    if (refType === 'app_field' && cfg.appId) {
        try {
            const field = await podio.get(`/app/${cfg.appId}/field/${ref_id}`);
            if (field && field.type === 'calculation') {
                return that.emit('error', new Error(
                    `Refusing to register a webhook on calculation field "${field.label}" (id ${ref_id}). ` +
                    `Podio does not fire item.update events for calculation recomputes — the hook would ` +
                    `register successfully but never fire. ` +
                    `Bridge pattern: create a Podio Workflow Automation flow that copies the calculated ` +
                    `value into a regular stored field (text/number/date), and subscribe THIS webhook to ` +
                    `that stored field instead. The stored-field write triggers a real item.update event.`
                ));
            }
        } catch (preflightErr) {
            // If the pre-flight itself fails (token, network, wrong app/field id),
            // surface that as the user-facing error rather than blindly creating
            // a hook that may be on the wrong target.
            return that.emit('error', preflightErr);
        }
    }

    const endpoint = '/hook/' + refType + '/' + ref_id;
    const created = [];

    for (const type of types) {
        try {
            const hook = await podio.post(endpoint, { url, type });
            created.push(hook);
        } catch (err) {
            // Partial-failure rollback: best-effort DELETE every hook we've
            // already created in this call, so the customer doesn't have to
            // hand-clean half a batch. Allsettled — even if rollback partially
            // fails, the original error is what the user gets.
            const rollbackResults = await Promise.allSettled(
                created
                    .filter(h => h && h.hook_id)
                    .map(h => podio.delete('/hook/' + h.hook_id))
            );
            const rolledBack = rollbackResults.filter(r => r.status === 'fulfilled').length;
            const rollbackFailed = rollbackResults.length - rolledBack;

            err.partial_failure = {
                attempted_types: types.slice(0, types.indexOf(type) + 1),
                created_hook_ids: created.map(h => h.hook_id).filter(Boolean),
                rollback_succeeded: rolledBack,
                rollback_failed: rollbackFailed,
            };
            return that.emit('error', err);
        }
    }

    await helper.emitData(cfg, created, that);
};

/**
 * Event-type dropdown population (called by the SelectView via `model`).
 *
 * Audit Part 5 finding: previously the `app_field` branch fell through to
 * the `app` menu, advertising types like comment.create / file.change /
 * tag.add that the Podio API REJECTS at submit time for app_field hooks.
 * The customer would pick a type, save the action, then get a "Hook type X
 * is not allowed for this object" error on first run.
 *
 * Now: app_field returns ONLY `item.update` (the sole valid type).
 */
exports.getHooks = function getHooks(cfg, cb) {
    const space = {
        'app.create': 'app.create',
        'contact.create': 'contact.create',
        'contact.delete': 'contact.delete',
        'contact.update': 'contact.update',
        'member.add': 'member.add',
        'member.remove': 'member.remove',
        'status.create': 'status.create',
        'status.update': 'status.update',
        'status.delete': 'status.delete',
        'task.create': 'task.create',
        'task.update': 'task.update',
    };

    const app = {
        'app.delete': 'app.delete',
        'app.update': 'app.update',
        'comment.create': 'comment.create',
        'comment.delete': 'comment.delete',
        'file.change': 'file.change',
        'form.create': 'form.create',
        'form.delete': 'form.delete',
        'form.update': 'form.update',
        'item.create': 'item.create',
        'item.delete': 'item.delete',
        'item.update': 'item.update',
        'tag.add': 'tag.add',
        'tag.delete': 'tag.delete',
    };

    // App_field scope: Podio only accepts item.update on app_field hooks
    // (audit Part 5 — verified live). The previous fall-through to the `app`
    // menu was the dominant source of "I picked a hook type and it doesn't
    // work" support tickets on field-level webhooks.
    const appField = {
        'item.update': 'item.update'
    };

    let hooks;
    if (cfg.hookType === 'space') hooks = space;
    else if (cfg.hookType === 'app') hooks = app;
    else hooks = appField;

    return cb(null, hooks);
};
