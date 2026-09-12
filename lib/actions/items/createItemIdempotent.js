'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Lookup-before-create; concurrent misses can create duplicate items.
 *
 * Pre-checks Podio for an existing item with the given `external_id`. If it
 * already lands (e.g. a prior call's HTTP 5xx came back AFTER Podio had
 * persisted the item, then the sailor retried), this returns the existing
 * item instead of creating a duplicate. If nothing exists yet, creates a
 * new item with the same `external_id` so later serialized calls can find it.
 * Podio does not enforce external_id uniqueness; a separate durable coordinator
 * is required before claiming concurrency-safe idempotency.
 *
 * This action provides a lookup-before-create convenience for Podio:
 *
 *   For each upstream record:
 *     1. Pass the upstream system's stable row id as `external_id`.
 *     2. createItemIdempotent looks it up by external_id first.
 *     3. Found → emit existing item, no POST.
 *     4. Missing → POST /item/app/{id} with {fields, external_id}; emit.
 *
 * After the batch, pair with `reconcileBatch` to confirm Podio actually has
 * everything you sent — that closes the loop on "iPaaS shows N processed
 * but Podio is missing some" reports.
 *
 * Output adds a synthetic `_idempotent_status` field ('existing' | 'created')
 * so downstream steps can branch on whether the call actually wrote.
 *
 * Trade-off vs. `createItem`: this action does NOT carry the category-option
 * auto-add behaviour. If you need both auto-add AND idempotency, use
 * caller-side coordination is still required; reconcileBatch is not a lock.
 */
exports.process = async function createItemIdempotent(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const item = msg.body || {};

    const appId = cfg.appId || item.app_id;
    const externalId = item.external_id;
    const fieldsPayload = item.fields || {};
    const hookFlag = cfg.hook === false || cfg.hook === 'false' ? 0 : 1;
    const silentFlag = cfg.silent === true || cfg.silent === 'true' ? 1 : 0;

    if (!appId) {
        throw new Error('app_id is required (set in action config or pass via msg.body.app_id)');
    }
    if (!externalId) {
        throw new Error(
            'external_id is required — this is the upstream record id used for lookup. ' +
            'Without it, this action cannot tell whether a Podio item already exists for this record.'
        );
    }

    try {
        // Step 1: look up by external_id
        try {
            const existing = await podio.get(`/item/app/${appId}/external_id/${encodeURIComponent(externalId)}`);
            if (!existing || !Number.isSafeInteger(existing.item_id) || existing.item_id <= 0) {
                const error = new Error('Lookup returned no valid item_id; resolve inventory before retrying.');
                error.retry = false;
                throw error;
            }
            const result = Object.assign({ _idempotent_status: 'existing' }, existing);
            await helper.emitData(cfg, result, that);
            return;
        } catch (lookupErr) {
            // 404 RESOURCE_MISSING is the expected "doesn't exist yet" signal.
            // Anything else (forbidden, server error, rate limit) propagates so
            // the sailor's retry logic can kick in via err.retry on 420/5xx.
            if (lookupErr.kind !== 'RESOURCE_MISSING' && lookupErr.statusCode !== 404) {
                throw lookupErr;
            }
        }

        // Step 2: create. Embed external_id in the payload so future lookups
        // by external_id resolve to THIS item.
        const url = `/item/app/${appId}?silent=${silentFlag}&hook=${hookFlag}`;
        const payload = {
            external_id: String(externalId),
            fields: fieldsPayload,
        };

        const created = await podio.post(url, payload);
        if (!created || !Number.isSafeInteger(created.item_id) || created.item_id <= 0) {
            const error = new Error('Create response has no valid item_id; creation outcome unverified. Resolve by external_id before retrying.');
            error.retry = false;
            error.creation_outcome = 'unverified';
            throw error;
        }
        const result = Object.assign({ _idempotent_status: 'created' }, created);
        await helper.emitData(cfg, result, that);
    } catch (err) {
        that.emit('error', err);
    }
};
