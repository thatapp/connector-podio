'use strict';

const Podio = require('../../../podio');
const { messages } = require('elasticio-node');
const helper = require('../../../helpers/itemHelper');

const DEFAULT_BATCH_SIZE = 15;

exports.process = async function filterItemByView(msg, cfg) {
    const that = this;
    const item = msg.body;
    // Pass `this` as context so a token refresh during this (long-running, paged)
    // action persists the rotated refresh_token via the platform `updateKeys`
    // event. Podio rotates the refresh_token on every refresh and invalidates the
    // old one immediately; without persistence the next run reuses a dead token
    // and fails with oauth.grant.expired. Matches the bulk createItem/updateItem
    // paths (see podio.js refresh-lock notes).
    const podio = new Podio(cfg, this);

    if (!item.app_id) {
        throw new Error('app_id is required');
    }
    if (!item.view_id) {
        throw new Error('view_id is required');
    }

    // Page at Podio's max size when limit is 0 ("retrieve all"); fall back to
    // the default for blank/negative/NaN. A 0-size batch would advance the
    // offset by 0 forever — an infinite loop.
    let batchSize = Number(item.limit);
    if (!Number.isFinite(batchSize) || batchSize < 0) batchSize = DEFAULT_BATCH_SIZE;
    if (batchSize === 0) batchSize = 500;
    let offset = item.offset || 0;
    let hasMore = true;
    let totalFetched = 0;

    // Build clean payload - view endpoint only accepts: limit, offset, sort_by, sort_desc
    // The view itself contains the filters, so do NOT send a filters param
    const filterPayload = {};
    if (item.sort_by) filterPayload.sort_by = item.sort_by;
    if (item.sort_desc !== undefined && item.sort_desc !== '' && item.sort_desc !== null) {
        filterPayload.sort_desc = (item.sort_desc === true || item.sort_desc === 'true');
    }

    console.log(`Starting filter by view ${item.view_id} with batch size: ${batchSize}`);

    try {
        while (hasMore) {
            filterPayload.limit = batchSize;
            filterPayload.offset = offset;

            const url = `/item/app/${item.app_id}/filter/${item.view_id}/`;

            console.log(`Fetching batch at offset ${offset}...`);
            const response = await podio.post(url, filterPayload);

            if (!response || !response.items) {
                console.log('No items in response');
                break;
            }

            const items = response.items;
            // A view IS a filter, so bound on `filtered` (items matching the
            // view), not `total` (every item in the app). Using `total` made
            // this page across the whole app and hang on large apps. Falls back
            // to `total` when `filtered` is absent.
            const matchCount = (response.filtered != null ? response.filtered : response.total) || 0;

            console.log(`Fetched ${items.length} items (matching view: ${matchCount})`);

            // Emit each item individually so downstream steps process one at a time
            for (const itemData of items) {
                await that.emit('data', messages.newMessageWithBody(itemData));
            }

            totalFetched += items.length;

            // Stop on a zero/short page (last page) or once every matching item
            // is emitted. The zero-page guard prevents an infinite loop.
            if (items.length === 0 || items.length < batchSize || totalFetched >= matchCount) {
                hasMore = false;
            } else {
                offset += batchSize;
            }
        }

        console.log(`Total items emitted: ${totalFetched}`);

    } catch (error) {
        console.error('filterItemByView failed:', error.message || error);
        await that.emit('error', error);
    }
};
