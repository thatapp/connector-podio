'use strict';

// Hook: Verify or Get Item (GitLab #497, owner 2026-11-16).
//
// One webhook step for what every Podio flow did in two or more: "This covers webhook
// verification if a webhook code exists in the payload. If it doesnt then it proceeds to get
// the podio item. If we can add a new Webhook endpoint to the component that performs the same
// verify / passthrough conditional that would allow us to consolidate the flows steps."
//
//   hook.verify            POST /hook/{hook_id}/verify/validate with {code}, under the step's own
//                          Podio sign-in, then end with no data (helpers/hookVerify.js, the same
//                          answer every read operation gives since #476).
//   item.delete            the item is gone at Podio, so nothing is read: the delivery itself is
//                          passed through as the data, so a delete still reaches the next step.
//   any other delivery     that names an item (item.create, item.update, comment.create, ...):
//                          GET /item/{item_id} and emit the item, the same output as Item: Get.
//   no item named          the delivery is passed through unchanged.
//
// The delivery is msg.body: Podio's form fields (type, hook_id, code, item_id, item_revision_id,
// comment_id, ...) with the platform receiver's own fields beside them (_query, _headers, ...).
// The existing Hook: Webhook Receiver (verifyHook) is unchanged.

const Podio = require('../../podio');
const hookVerify = require('../../helpers/hookVerify');
const helper = require('../../helpers/itemHelper');
const { messages } = require('../../helpers/messages');

const DELETED = 'item.delete';
const WHOLE = /^[1-9][0-9]*$/;

/** The item a delivery names, as a string of digits, or null. */
function itemIdOf(body) {
    const raw = body && body.item_id;
    if (raw === undefined || raw === null || raw === '') return null;
    const id = String(raw).trim();
    return WHOLE.test(id) ? id : undefined;   // undefined: named, but not a whole number
}

exports.process = async function hookVerifyOrGetItem(msg, cfg) {
    // 1. A hook validation is answered and ends the run here.
    if (await hookVerify.handle(this, msg, cfg)) return;

    const body = msg && msg.body && typeof msg.body === 'object' && !Array.isArray(msg.body) ? msg.body : {};
    const itemId = itemIdOf(body);

    // 2. Nothing to read: a delete (the item no longer exists) or a delivery that names no item.
    if (body.type === DELETED || itemId === null) {
        await this.emit('data', messages.newMessageWithBody({ ...body }));
        return this.emit('end');
    }
    if (itemId === undefined) {
        // item_id is placed in a URL path: only a positive whole number is allowed.
        return this.emit('error', new Error('The Podio delivery names an item_id that is not a whole number; Podio was not called'));
    }

    // 3. Pass through: read the item the delivery names and emit it, as Item: Get does.
    try {
        const item = await new Podio(cfg, this).get('/item/' + itemId);
        await helper.emitData(cfg, item, this);
        return this.emit('end');
    } catch (err) {
        return this.emit('error', err);
    }
};

exports.itemIdOf = itemIdOf;
