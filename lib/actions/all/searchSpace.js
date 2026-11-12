'use strict';

const Podio = require('../../../podio');
const org = require('../../../helpers/orgHelper');
const space = require('../../../helpers/spaceHelper');
const helper = require('../../../helpers/itemHelper');

/**
 * Space-scoped search — v1.
 *
 * Live-verified 2026-05-29 (Podio audit Part 2.2 + B.1 re-probe):
 *   - POST /search/space/{id}/v2 → route-404 (dead; was previously used here)
 *   - POST /search/space/{id}/   → live; returns a BARE ARRAY of result rows
 *
 * Compare to `searchSpaceV2` which returns the `{counts, results}` envelope
 * and supports `counts=true` for per-ref_type aggregate counts. Use this
 * action when you want a compact payload and don't need facet counts.
 *
 * Result-row schema (13 keys, identical across v1 and v2):
 *   app, created_by, created_on, highlight, id, item, link, org, rank,
 *   search_id, space, title, type
 */
exports.process = async function searchSpace(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const item = msg.body;

    const fields = {};
    fields.space_id = parseInt(cfg.spaceId, 10);
    if (item.highlights) fields.highlights = (item.highlights === true || item.highlights === 'true');
    if (item.limit) fields.limit = item.limit;
    if (item.offset) fields.offset = item.offset;
    if (item.query) fields.query = item.query;
    if (item.ref_type) fields.ref_type = item.ref_type;
    if (item.search_fields) fields.search_fields = item.search_fields;

    try {
        const spaces = await podio.post('/search/space/' + cfg.spaceId + '/', fields);
        helper.emitData(cfg, spaces, that);
    } catch (err) {
        that.emit('error', err);
    }
};

exports.organisations = async function getOrganisations(cfg, cb) {
    return org.getOrganisations(cfg, cb);
};

exports.spaces = async function getSpaces(cfg, msg) {
    return space.getSpaces(cfg, msg);
};

exports.getMetaModel = function getMetaModel(cfg, cb) {
    return space.getCSPaceModel(cfg, cb);
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
