'use strict';

const Podio = require('../../../podio');
const space = require('../../../helpers/spaceHelper');
const helper = require('../../../helpers/itemHelper');

/**
 * Org-scoped search — v2.
 *
 * Live-verified 2026-05-29 (Podio audit Part 2.2 + B.1 re-probe):
 *   - GET /search/org/{id}/v2/  → live; returns `{counts, results}` envelope
 *
 * Compare to `searchOrg` which returns a bare array (v1 POST). Use this
 * action when you want per-ref_type aggregate counts (pass `counts=true`)
 * for faceted UIs or "how many results of each type?" reporting.
 *
 * Result-row schema (13 keys, identical to v1):
 *   app, created_by, created_on, highlight, id, item, link, org, rank,
 *   search_id, space, title, type
 *
 * v2 adds the outer envelope:
 *   { counts: <object|null>, results: [<row>, ...] }
 */
exports.process = async function searchOrgV2(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const item = msg.body;

    const fields = {};
    if (item.counts) fields.counts = (item.counts === true || item.counts === 'true');
    if (item.highlights) fields.highlights = (item.highlights === true || item.highlights === 'true');
    if (item.limit) fields.limit = item.limit;
    if (item.offset) fields.offset = item.offset;
    if (item.query) fields.query = item.query;
    if (item.ref_type) fields.ref_type = item.ref_type;
    if (item.search_fields) fields.search_fields = item.search_fields;

    try {
        const result = await podio.get('/search/org/' + cfg.orgId + '/v2/', fields);
        helper.emitData(cfg, result, that);
    } catch (err) {
        that.emit('error', err);
    }
};

exports.getMetaModel = function getMetaModel(cfg, cb) {
    return space.getCSPaceModel(cfg, cb);
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
