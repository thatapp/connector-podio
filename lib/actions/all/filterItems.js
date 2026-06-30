'use strict';

const Podio = require('../../../podio');
const { messages } = require('elasticio-node');
const helper = require('../../../helpers/itemHelper');

// Optimized fields parameter for reduced payload
const FIELDS_PARAM = 'items.view(micro).fields(fields,files,comments,app_item_id_formatted,external_id,created_on,created_by.view(micro),last_event_on)';
const DEFAULT_BATCH_SIZE = 15;

exports.process = async function filterItem(msg, cfg) {
    const that = this;
    const item = msg.body;
    const podio = new Podio(cfg);

    if (!item.app_id) {
        throw new Error('app_id is required');
    }

    // "Set to 0 to retrieve all items" (per schema): page at Podio's max size.
    // Any blank/negative/NaN limit falls back to the default. A 0-size batch
    // would otherwise advance the offset by 0 forever — an infinite loop.
    let batchSize = Number(item.limit);
    if (!Number.isFinite(batchSize) || batchSize < 0) batchSize = DEFAULT_BATCH_SIZE;
    if (batchSize === 0) batchSize = 500;
    const allItems = [];
    let offset = item.offset || 0;
    let hasMore = true;
    let totalFetched = 0;

    // Build clean filter payload with only valid, non-empty API parameters
    const filterPayload = {};
    if (item.sort_by) filterPayload.sort_by = item.sort_by;
    if (item.sort_desc !== undefined && item.sort_desc !== '' && item.sort_desc !== null) {
        filterPayload.sort_desc = (item.sort_desc === true || item.sort_desc === 'true');
    }
    if (item.filters && typeof item.filters === 'object' && Object.keys(item.filters).length > 0) {
        filterPayload.filters = item.filters;
    }

    console.log(`Starting filter with batch size: ${batchSize}`);

    try {
        while (hasMore) {
            // Set pagination for this batch
            filterPayload.limit = batchSize;
            filterPayload.offset = offset;

            const url = `/item/app/${item.app_id}/filter/?fields=${encodeURIComponent(FIELDS_PARAM)}`;

            console.log(`Fetching batch at offset ${offset}...`);
            const response = await podio.post(url, filterPayload);

            if (!response || !response.items) {
                console.log('No items in response');
                break;
            }

            const items = response.items;
            // Podio returns BOTH `filtered` (count matching THIS filter) and
            // `total` (every item in the app). Pagination must bound on
            // `filtered` — using `total` made a filtered query page across the
            // whole app, which on large apps ran for thousands of requests and
            // looked like an endless hang with no error. Fall back to `total`
            // when `filtered` is absent (unfiltered query: the two are equal).
            const matchCount = (response.filtered != null ? response.filtered : response.total) || 0;

            console.log(`Fetched ${items.length} items (matching filter: ${matchCount})`);

            // Add items to collection
            allItems.push(...items);
            totalFetched += items.length;

            // Stop on a zero/short page (last page) or once we've pulled every
            // matching item. The zero-page guard also prevents an infinite loop
            // if Podio ever returns an empty page before the count is reached.
            if (items.length === 0 || items.length < batchSize || totalFetched >= matchCount) {
                hasMore = false;
            } else {
                offset += batchSize;
            }

            // Emit progress for each batch if splitResult is enabled
            if (cfg.splitResult && items.length > 0) {
                for (const itemData of items) {
                    await that.emit('data', messages.newMessageWithBody(itemData));
                }
            }
        }

        console.log(`Total items fetched: ${allItems.length}`);

        // Emit all items at once if not splitting
        if (!cfg.splitResult) {
            helper.emitData(cfg, allItems, that);
        }

    } catch (error) {
        console.error('filterItems failed:', error.message || error);
        await that.emit('error', error);
    }
};
