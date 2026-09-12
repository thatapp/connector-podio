'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Get Item Values V2
 * https://developers.podio.com/doc/items/get-item-values-v2-144280791
 * GET /item/{item_id}/value/v2
 */
exports.process = async function getItemValuesV2(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);

    const itemId = msg.body.item_id;

    if (!itemId) {
        throw new Error('item_id is required');
    }

    try {
        const url = `/item/${itemId}/value/v2`;
        console.log(`Fetching item values: ${url}`);

        const itemValues = await podio.get(url);

        await helper.emitData(cfg, itemValues, that);
    } catch (error) {
        console.error('getItemValuesV2 failed:', error.message || error);
        await that.emit('error', error);
    }
};
