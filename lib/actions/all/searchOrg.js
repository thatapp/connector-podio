'use strict';

const Podio = require('../../../podio');
const space = require('../../../helpers/spaceHelper');
const helper = require('../../../helpers/itemHelper');

/**
 * Org-scoped search — v1.
 *
 * Live-verified 2026-05-29 (Podio audit Part 2.2 + B.1 re-probe):
 *   - POST /search/org/{id}/v2 → route-404 (dead; was previously used here)
 *   - POST /search/org/{id}/   → live; returns a BARE ARRAY of result rows
 *
 * Compare to `searchOrgV2` which returns the `{counts, results}` envelope
 * and supports `counts=true` for per-ref_type aggregate counts. Use this
 * action when you want a compact payload and don't need facet counts.
 *
 * Result-row schema (13 keys, identical across v1 and v2):
 *   app, created_by, created_on, highlight, id, item, link, org, rank,
 *   search_id, space, title, type
 */
exports.process = async function searchOrg(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const item = msg.body;

    const fields = {};
    fields.org_id = parseInt(cfg.orgId, 10);
    if (item.highlights) fields.highlights = (item.highlights === true || item.highlights === 'true');
    if (item.limit) fields.limit = item.limit;
    if (item.offset) fields.offset = item.offset;
    if (item.query) fields.query = item.query;
    if (item.ref_type) fields.ref_type = item.ref_type;
    if (item.search_fields) fields.search_fields = item.search_fields;

    try {
        const orgs = await podio.post('/search/org/' + cfg.orgId + '/', fields);
        helper.emitData(cfg, orgs, that);
    } catch (err) {
        that.emit('error', err);
    }
};

exports.getMetaModel = function getMetaModel(cfg, cb) {
    return space.getCSPaceModel(cfg, cb);
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
