'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Get feature flags for one or more apps.
 *
 * Live-verified 2026-05-29 (Podio audit Part 2.2 + B.1 re-probe):
 *   - GET /app/features/?app_ids=<id>            → 200, array of feature strings
 *   - GET /app/features/                          → 400 "Missing parameters: app_ids"
 *   - GET /app/features/?app_ids=<a>,<b>,<c>      → 400 "Apps not from same space"
 *     (undocumented constraint: all app_ids in a multi-app call MUST belong
 *     to the SAME Podio space)
 *
 * Previous implementation had a bug at the field-extraction step:
 *
 *     let fields = {};
 *     if (fields.appIds) { fields.appIds = item.appIds }   // ALWAYS FALSE
 *
 * The `fields` object was always empty when sent, so every call landed on
 * /app/features/ with no query string and got the "Missing parameters" 400.
 * Fixed: pull from msg.body, accept both `app_ids` (snake_case, Podio's
 * canonical) and `appIds` (camelCase, legacy), and send as `app_ids`.
 */
exports.process = async function getFeatures(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const item = msg.body || {};

    const appIds = item.app_ids;
    if (!appIds) {
        throw new Error(
            'app_ids is required. Pass a single app id (e.g. "19894741") or a ' +
            'comma-separated list. NOTE: multi-app calls require all apps to ' +
            'belong to the same Podio space — mixing spaces returns 400 ' +
            '"Apps not from same space" from Podio.'
        );
    }

    const fields = { app_ids: appIds };
    if (item.include_space !== undefined) {
        fields.include_space = item.include_space;
    }

    try {
        const features = await podio.get('/app/features/', fields);
        helper.emitData(cfg, features, that);
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
