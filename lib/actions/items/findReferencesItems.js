'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const { toPodioId } = require('../../../helpers/coerce');

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
        const url = '/item/field/' + toPodioId(fieldId, 'field_id') + '/find';
        const { limit = 13, offset = 0, sort, text } = msg.body;
        const count = Number(limit), start = Number(offset);
        if (![count, start, count + start].every(n => Number.isSafeInteger(n) && n >= 0)) {
            throw new Error('Limit and offset must be nonnegative whole numbers.');
        }
        const options = { title: ['title', 1], asc: ['title', 1], desc: ['title', -1],
            '-title': ['title', -1], item_id: ['item_id', 1], '-item_id': ['item_id', -1] };
        if (sort && !Object.hasOwn(options, sort)) throw new Error('Sort by title or item_id. Prefix the field with - for descending order.');
        const excluded = msg.body.not_item_id ?? msg.body.not_item_ids;
        const values = excluded == null ? [] : Array.isArray(excluded) ? excluded : String(excluded).split(',');
        const seen = new Set(values.map(value => toPodioId(value, 'not_item_id')));
        const matches = [];
        // The provider supports limit and a comma-separated list of excluded IDs.
        // Offset and sorting are connector inputs; the provider ignores both.
        while (count && (sort || matches.length < start + count)) {
            const size = sort ? 50 : Math.min(50, start + count - matches.length);
            const query = { limit: size };
            if (text) query.text = text;
            if (seen.size) query.not_item_id = [...seen].join(',');
            const response = await podio.get(url, query);
            const page = Array.isArray(response) ? response : response?.items;
            if (!Array.isArray(page)) throw new Error('Podio did not return a list of referenceable items.');
            for (const row of page) {
                const id = toPodioId(row.item_id, 'item_id');
                if (seen.has(id)) throw new Error('Podio returned an already excluded referenceable item.');
                seen.add(id);
                matches.push(row);
            }
            if (page.length < size) break;
        }
        if (sort) {
            const [key, direction] = options[sort];
            matches.sort((a, b) => {
                const order = key === 'item_id' ? Number(a.item_id) - Number(b.item_id) :
                    String(a.title ?? '').localeCompare(String(b.title ?? ''));
                return direction * order || Number(a.item_id) - Number(b.item_id);
            });
        }
        const items = matches.slice(start, start + count);
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
                offset:      { type: 'number', required: false, title: 'Starting Offset' },
                sort:        { type: 'string', required: false, title: 'Sort by title or item_id; prefix - for descending' },
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

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
