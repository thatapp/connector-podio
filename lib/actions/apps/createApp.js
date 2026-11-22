'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Add New App (Create App)
 * https://developers.podio.com/doc/applications/add-new-app-22351
 * POST /app/
 *
 * Creates a new app in the specified space.
 */
exports.process = async function createApp(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const input = msg.body;

    const spaceId = input.space_id;

    if (!spaceId) {
        throw new Error('space_id is required');
    }
    if (!(input.config?.name ?? input.name)) {
        throw new Error('name is required (the app name)');
    }

    try {
        // Build app payload
        const payload = {
            space_id: spaceId,
            config: {
                name: input.name,
                type: input.type || 'standard' // standard, meeting, or contact
            }
        };

        // Optional config settings
        if (input.item_name) {
            payload.config.item_name = input.item_name;
        }
        if (input.description) {
            payload.config.description = input.description;
        }
        if (input.usage) {
            payload.config.usage = input.usage;
        }
        if (input.external_id) {
            payload.config.external_id = input.external_id;
        }
        if (input.icon) {
            payload.config.icon = input.icon;
        }
        if (input.allow_edit !== undefined) {
            payload.config.allow_edit = input.allow_edit;
        }
        if (input.default_view) {
            payload.config.default_view = input.default_view;
        }
        if (input.allow_attachments !== undefined) {
            payload.config.allow_attachments = input.allow_attachments;
        }
        if (input.allow_comments !== undefined) {
            payload.config.allow_comments = input.allow_comments;
        }
        if (input.silent_creates !== undefined) {
            payload.config.silent_creates = input.silent_creates;
        }
        if (input.silent_edits !== undefined) {
            payload.config.silent_edits = input.silent_edits;
        }

        // Rating options
        if (input.fivestar !== undefined) {
            payload.config.fivestar = input.fivestar;
            if (input.fivestar_label) {
                payload.config.fivestar_label = input.fivestar_label;
            }
        }
        if (input.thumbs !== undefined) {
            payload.config.thumbs = input.thumbs;
            if (input.thumbs_label) {
                payload.config.thumbs_label = input.thumbs_label;
            }
        }
        if (input.rsvp !== undefined) {
            payload.config.rsvp = input.rsvp;
            if (input.rsvp_label) {
                payload.config.rsvp_label = input.rsvp_label;
            }
        }
        if (input.yesno !== undefined) {
            payload.config.yesno = input.yesno;
            if (input.yesno_label) {
                payload.config.yesno_label = input.yesno_label;
            }
        }
        if (input.approved !== undefined) {
            payload.config.approved = input.approved;
        }

        if (input.config !== undefined) {
            if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) {
                throw new Error('config must be an application configuration object.');
            }
            Object.assign(payload.config, input.config);
        }

        // Fields array (for creating app with fields)
        if (input.fields && Array.isArray(input.fields)) {
            payload.fields = input.fields;
        }

        // Build URL with query params
        const silent = (cfg.silent === true || cfg.silent === 'true') ? 1 : 0;
        const url = `/app/?silent=${silent}`;

        console.log(`Creating app: ${input.name} in space ${spaceId}`);

        const app = await podio.post(url, payload);

        helper.emitData(cfg, app, that);
    } catch (error) {
        console.error('createApp failed:', error.message || error);
        await that.emit('error', error);
    }
};
