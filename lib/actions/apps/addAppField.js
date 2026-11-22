'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Add New App Field
 * https://developers.podio.com/doc/applications/add-new-app-field-22354
 * POST /app/{app_id}/field/
 *
 * Adds a new field to an existing app.
 */
exports.process = async function addAppField(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const input = msg.body;

    const appId = input.app_id;

    if (!appId) {
        throw new Error('app_id is required');
    }
    if (!input.type) {
        throw new Error('type is required (field type: text, number, category, date, etc.)');
    }
    if (!(input.config?.label ?? input.label)) {
        throw new Error('label is required (the field label users will see)');
    }

    try {
        // Build field payload
        const payload = {
            type: input.type,
            config: {
                label: input.label
            }
        };

        // Optional config settings
        if (input.description) {
            payload.config.description = input.description;
        }
        if (input.delta !== undefined) {
            payload.config.delta = input.delta; // Field order position
        }
        if (input.required !== undefined) {
            payload.config.required = input.required;
        }
        if (input.mapping) {
            payload.config.mapping = input.mapping; // meeting_time, meeting_participants, etc.
        }

        // Field-type-specific settings
        if (input.settings) {
            payload.config.settings = input.settings;
        }

        if (input.config !== undefined) {
            if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) {
                throw new Error('config must be a field configuration object.');
            }
            Object.assign(payload.config, input.config);
        }
        const url = `/app/${appId}/field/`;
        console.log(`Adding field "${input.label}" (${input.type}) to app ${appId}`);

        const field = await podio.post(url, payload);

        helper.emitData(cfg, field, that);
    } catch (error) {
        console.error('addAppField failed:', error.message || error);
        await that.emit('error', error);
    }
};
