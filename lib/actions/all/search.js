'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Global unscoped search across every accessible org.
 *
 * Live-verified 2026-05-29 (Podio audit Part 2.2 + B.1 re-probe):
 *   - POST /search/v2  → route-404 (dead; was previously used here)
 *   - GET  /search/v2/ → live; returns { counts, results } envelope
 *
 * There is no v1 unscoped equivalent — Podio's global search is v2-only.
 * For scoped (org/space) searches both v1 and v2 are live; see searchOrg /
 * searchOrgV2 and searchSpace / searchSpaceV2 for the bare-array vs
 * envelope variants.
 */
exports.process = async function search(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);

    const fields = {};
    if (cfg.counts) fields.counts = (cfg.counts === true || cfg.counts === 'true');
    if (cfg.highlights) fields.highlights = (cfg.highlights === true || cfg.highlights === 'true');
    if (cfg.limit) fields.limit = cfg.limit;
    if (cfg.offset) fields.offset = cfg.offset;
    if (cfg.query) fields.query = cfg.query;
    if (cfg.ref_type) fields.ref_type = cfg.ref_type;
    if (cfg.search_fields) fields.search_fields = cfg.search_fields;

    try {
        const items = await podio.get('/search/v2/', fields);
        helper.emitData(cfg, items, that);
    } catch (err) {
        // Use error channel so failed searches don't get counted as
        // successful messages by the iPaaS execution view.
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
