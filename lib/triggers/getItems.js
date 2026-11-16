var Podio = require('../../podio');
const { messages } = require('../../helpers/messages');

// Item: Poll for Changes. docs.thatapp.io/components/podio/#item-poll-for-changes: "Polls Podio for
// new or updated items in an application", input item_id, "Returns item data when changes are
// detected."
//
// STRUCTURAL FIX (2026-11-15). This trigger read msg.body.item_id only. A polling trigger is a
// flow's first step and is handed an empty body, so every poll called GET /item/undefined. It now
// reads what it polls from the message first, then the step configuration (as getApplications
// does), and polls one of two things:
//
//   · item_id (the documented input) -> GET /item/{item_id}; the item is emitted when it changed
//     since the last poll (its last_event_on differs from the snapshot's).
//   · otherwise app_id (or appId)    -> POST /item/app/{app_id}/filter/, newest edit first; every
//     item edited after the snapshot's last_event_on is emitted, one message per item. The first
//     poll of an app (no snapshot for that app) emits the page it read.
//
// The snapshot is { app_id, last_event_on } or { item_id, last_event_on }; a snapshot for another
// app or item is not applied. The first value PRESENT is the one used: an invalid id in the message
// is refused, never silently replaced by the configuration's. Ids go into a URL path, so anything
// but a positive whole number is refused before any request. Read only: nothing is written to Podio.

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 500;
const present = (v) => v !== undefined && v !== null && v !== '';

function idOf(raw, name) {
    const text = (typeof raw === 'number' || typeof raw === 'string') ? String(raw).trim() : '';
    if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text))) {
        throw new Error(name + ' must be a positive whole number; got ' + JSON.stringify(raw));
    }
    return text;
}

function target(msg, cfg) {
    const body = (msg && msg.body && typeof msg.body === 'object') ? msg.body : {};
    const conf = (cfg && typeof cfg === 'object') ? cfg : {};
    const item = [body.item_id, conf.item_id].find(present);
    if (present(item)) return { item_id: idOf(item, 'item_id') };
    const app = [body.app_id, conf.app_id, conf.appId].find(present);
    if (present(app)) return { app_id: idOf(app, 'app_id') };
    throw new Error('Item: Poll for Changes needs the app whose items are polled (app_id) or the item to poll (item_id), in the message or the step configuration');
}

function limitOf(cfg) {
    const n = Number(cfg && cfg.limit);
    return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_LIMIT) : DEFAULT_LIMIT;
}

const stamp = (item) => (item && typeof item.last_event_on === 'string') ? item.last_event_on : '';

exports.process = async function getItems(msg, cfg, snapshot) {
    var that = this;
    try {
        const t = target(msg, cfg);
        const podio = new Podio(cfg, this);
        const prev = (snapshot && typeof snapshot === 'object') ? snapshot : {};

        if (t.item_id) {
            const item = await podio.get('/item/' + t.item_id);
            const same = String(prev.item_id) === t.item_id && present(prev.last_event_on) && prev.last_event_on === stamp(item);
            if (!same) await that.emit('data', messages.newMessageWithBody(item));
            await messages.emitSnapshot.call(that, { item_id: t.item_id, last_event_on: stamp(item) || prev.last_event_on || null });
            return;
        }

        const since = String(prev.app_id) === t.app_id && present(prev.last_event_on) ? prev.last_event_on : null;
        const res = await podio.post('/item/app/' + t.app_id + '/filter/', { sort_by: 'last_edit_on', sort_desc: true, limit: limitOf(cfg), offset: 0 });
        const list = res && Array.isArray(res.items) ? res.items : null;
        if (!list) throw new Error('Unable to retrieve items: POST /item/app/' + t.app_id + '/filter/ did not return a list');
        // Podio's timestamps are "YYYY-MM-DD HH:MM:SS" (UTC), so text order is time order.
        const changed = since ? list.filter((i) => stamp(i) > since) : list;
        for (const item of changed) await that.emit('data', messages.newMessageWithBody(item));
        const newest = list.map(stamp).reduce((a, b) => (b > a ? b : a), since || '');
        await messages.emitSnapshot.call(that, { app_id: t.app_id, last_event_on: newest || null });
    } catch (err) {
        // 'error', never 'end': a polling trigger that ends on a failure reports a clean cycle.
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../helpers/hookVerify').guard(exports.process);
