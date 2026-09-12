'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Get Item Field Values V2
 * https://developers.podio.com/doc/items/get-item-field-values-v2-144279511
 * GET /item/{item_id}/value/{field_id}/v2
 */
exports.process = async function getItemFieldValueV2(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);

    const itemId = msg.body.item_id;
    const fieldId = msg.body.field_id;

    if (!itemId) {
        throw new Error('item_id is required');
    }
    if (!fieldId) {
        throw new Error('field_id is required');
    }

    try {
        const url = `/item/${itemId}/value/${encodeURIComponent(String(fieldId))}/v2`;
        console.log(`Fetching field value: ${url}`);

        const fieldValue = await podio.get(url);

        await helper.emitData(cfg, fieldValue, that);
    } catch (error) {
        console.error('getItemFieldValueV2 failed:', error.message || error);
        await that.emit('error', error);
    }
};
