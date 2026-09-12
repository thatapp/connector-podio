'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Get Item Count
 * https://developers.podio.com/doc/items/get-item-count-34819997
 * GET /item/app/{app_id}/count
 *
 * Returns the total number of items in the given app.
 */
exports.process = async function getItemCount(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);

    const appId = msg.body.app_id;

    if (!appId) {
        throw new Error('app_id is required');
    }

    try {
        const url = `/item/app/${appId}/count`;
        console.log(`Getting item count: ${url}`);

        const count = await podio.get(url);

        await helper.emitData(cfg, count, that);
    } catch (error) {
        console.error('getItemCount failed:', error.message || error);
        await that.emit('error', error);
    }
};
