'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Find Referenceable Items
 * https://developers.podio.com/doc/items/find-referenceable-items-22485
 * GET /item/field/{field_id}/find
 *
 * Returns items that are valid references to the given field.
 * Used for app reference fields to find items that can be linked.
 */
exports.process = async function findReferenceableItems(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);

    const fieldId = msg.body.field_id;

    if (!fieldId) {
        throw new Error('field_id is required');
    }

    try {
        const url = `/item/field/${fieldId}/find`;

        // Build query parameters
        const params = {};

        if (msg.body.limit) {
            params.limit = msg.body.limit;
        }
        if (msg.body.not_item_id || msg.body.not_item_ids) {
            // Can be a single ID or array of IDs to exclude
            params.not_item_id = msg.body.not_item_id || msg.body.not_item_ids;
        }
        if (msg.body.text) {
            params.text = msg.body.text;
        }

        console.log(`Finding referenceable items: ${url}`, params);

        const response = await podio.get(url, params);

        // Podio returns either a bare array or { items: [...] }. Normalize to the
        // array so emitData splits each referenceable item into its own message —
        // a raw array body would leave the next step with no mappable fields.
        const items = Array.isArray(response)
            ? response
            : (response && Array.isArray(response.items) ? response.items : response);

        await helper.emitData(cfg, items, that);
    } catch (error) {
        console.error('findReferenceableItems failed:', error.message || error);
        await that.emit('error', error);
    }
};

// Declare the output schema so the found items' fields are mappable in the next
// step (the platform shows nothing downstream without this — see searchApp).
exports.getMetaModel = function getMetaModel(cfg, cb) {
    const schema = {
        in: {
            type: 'object',
            properties: {
                field_id:    { type: 'number', required: true,  title: 'Field ID', description: 'The reference field to search from' },
                limit:       { type: 'number', required: false, title: 'Limit' },
                not_item_id: { type: 'number', required: false, title: 'Exclude Item ID' },
                text:        { type: 'string', required: false, title: 'Search Text' },
            }
        },
        out: {
            type: 'object',
            properties: {
                item_id: { type: 'number', required: false, title: 'Item ID' },
                title:   { type: 'string', required: false, title: 'Title' },
                link:    { type: 'string', required: false, title: 'Link' },
                app:     { type: 'object', required: false, title: 'App' },
            }
        }
    };
    return cb(null, schema);
};
