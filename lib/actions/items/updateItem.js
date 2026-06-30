const Podio = require('../../../podio');
const { messages } = require('elasticio-node');
const helper = require('../../../helpers/itemHelper');
const outScheme = helper.outScheme();

/**
 * Parse category field error from Podio API response
 * Returns { fieldExternalId, missingValue } if category error detected, null otherwise
 */
function parseCategoryError(error) {
    try {
        const errorMsg = error.message || error.error_description || '';
        const pattern1 = /field.*?['"]([^'"]+)['"].*?does not have option.*?['"]([^'"]+)['"]/i;
        const pattern2 = /invalid.*?value.*?['"]([^'"]+)['"].*?field.*?['"]([^'"]+)['"]/i;

        let match = errorMsg.match(pattern1);
        if (match) {
            return { fieldExternalId: match[1], missingValue: match[2] };
        }

        match = errorMsg.match(pattern2);
        if (match) {
            return { fieldExternalId: match[2], missingValue: match[1] };
        }

        if (error.error_parameters && error.error_parameters.field_external_id) {
            return {
                fieldExternalId: error.error_parameters.field_external_id,
                missingValue: error.error_parameters.value || error.error_parameters.option
            };
        }

        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Add missing category option to app field
 */
async function addMissingCategoryOption(podio, appId, fieldExternalId, missingValue, logger) {
    try {
        const app = await podio.get(`/app/${appId}`);
        const field = app.fields.find(f =>
            f.external_id === fieldExternalId ||
            String(f.field_id) === String(fieldExternalId) ||
            f.label.toLowerCase() === fieldExternalId.toLowerCase()
        );

        if (!field || field.type !== 'category') {
            if (logger) logger.info(`Field '${fieldExternalId}' not found or not a category field`);
            return false;
        }

        const currentOptions = field.config.settings.options || [];
        const optionExists = currentOptions.some(opt =>
            opt.text.toLowerCase() === missingValue.toLowerCase()
        );

        if (optionExists) {
            return true;
        }

        const newOptions = [...currentOptions, { text: missingValue, color: 'DCEBD8' }];
        const updatePayload = {
            config: {
                ...field.config,
                settings: {
                    ...field.config.settings,
                    options: newOptions
                }
            }
        };

        await podio.put(`/app/${appId}/field/${field.field_id}`, updatePayload);
        if (logger) logger.info(`Added category option '${missingValue}' to field '${fieldExternalId}'`);
        return true;
    } catch (e) {
        if (logger) logger.info(`Failed to add category option: ${e.message}`);
        return false;
    }
}

/**
 * Scan input fields and auto-add any missing category options
 */
async function autoAddCategoryOptionsFromInput(podio, appId, inputData, logger) {
    try {
        const app = await podio.get(`/app/${appId}`);
        const categoryFields = app.fields.filter(f => f.type === 'category');

        for (const field of categoryFields) {
            const fieldKey = field.external_id || String(field.field_id);
            const inputValue = inputData[fieldKey] || inputData[field.field_id];

            if (!inputValue) continue;

            const values = Array.isArray(inputValue) ? inputValue : [inputValue];
            const currentOptions = field.config.settings.options || [];

            for (const val of values) {
                const textValue = typeof val === 'object' ? (val.text || val.value) : val;
                if (!textValue || typeof textValue !== 'string') continue;

                const optionExists = currentOptions.some(opt =>
                    opt.text.toLowerCase() === textValue.toLowerCase()
                );

                if (!optionExists) {
                    if (logger) logger.info(`Auto-adding missing category option '${textValue}' to field '${field.label}'`);
                    await addMissingCategoryOption(podio, appId, fieldKey, textValue, logger);
                    currentOptions.push({ text: textValue });
                }
            }
        }
        return true;
    } catch (e) {
        if (logger) logger.info(`Auto-add category options scan failed: ${e.message}`);
        return false;
    }
}

exports.process = async function updateItem(msg, cfg) {
    const that = this;
    try {
        const item = msg.body;
        // Search results use 'id'; direct item references use 'item_id'
        const item_id = item.item_id || item.id;
        console.log(`updateItem: item_id=${item_id}, item.item_id=${item.item_id}, item.id=${item.id}, keys=${Object.keys(item||{}).join(',')}`);
        if (!item_id) {
            throw new Error('Item_id field is required');
        }

        // Resolve the target app dynamically: an `app_id` on the incoming message
        // overrides the statically configured `cfg.appId`, so the same Update
        // action can be pointed at a different app per item (leave the config
        // field blank to drive it entirely from the data). Falls back to config.
        const appId = item.app_id || cfg.appId;
        if (!appId) {
            throw new Error('app_id is required (set "Podio Application" in the action config or pass app_id on the incoming message)');
        }

        // Pass `this` as context so a mid-run token refresh persists the rotated
        // refresh_token via the platform `updateKeys` event (see podio.js notes).
        const podio = new Podio(cfg, this);

        // If autoAddCategoryOptions is enabled, scan and add missing options before attempting update
        if (cfg.autoAddCategoryOptions) {
            this.logger.info('Auto-add category options enabled, scanning input...');
            await autoAddCategoryOptionsFromInput(podio, appId, item, this.logger);
        }

        // Strip Podio metadata fields that are not editable app fields.
        // These arrive when a searchApp or filterItemsByView result is piped directly
        // into updateItem without the platform mapper stripping them first.
        const PODIO_METADATA_FIELDS = new Set([
            'id', 'item_id', 'app', 'created_by', 'created_on', 'last_event_on',
            'last_viewed_on', 'highlight', 'item', 'link', 'org', 'rank',
            'search_id', 'space', 'title', 'type', 'revision', 'current_revision',
            'initial_revision', 'external_id', 'app_item_id', 'app_item_id_formatted',
            'subscribed', 'subscribed_count', 'like_count', 'liked_by_me',
            'ref', 'refs', 'pinned', 'is_liked', 'push', 'comment_count',
            'comments_allowed', 'file_count', 'rights', 'priority', 'ratings',
            'created_via', 'sharefile_vault_folder_id', 'sharefile_vault_url',
            'fields', 'tags',
            // app selectors — consumed to target the update, never sent as fields
            'app_id', 'appId',
            '_searchApp_no_match', '_counts'
        ]);
        const itemFields = {};
        for (const key of Object.keys(item)) {
            if (!PODIO_METADATA_FIELDS.has(key)) {
                itemFields[key] = item[key];
            }
        }
        console.log(`updateItem: stripping metadata, remaining keys=${Object.keys(itemFields).join(',')}`);

        var item_remodified = await reformData(itemFields, podio);

        const splittableFields = await helper.getSplittableFieldIds(podio, appId);
        let data = helper.fieldTransform(item_remodified, true, splittableFields);

        delete data["item_id"];

        const fields = {};

        // Normalize every field for Podio: omit unchanged values, turn clear
        // sentinels ("", "[]", []) into [], pass real values through. Centralized
        // in helper.normalizeFieldValue so create & update stay in lockstep and
        // no field type ships a value Podio rejects.
        for (const property of Object.keys(data)) {
            const norm = helper.normalizeFieldValue(data[property]);
            if (norm === undefined) { delete data[property]; continue; }
            data[property] = norm;
        }

        delete data["appId"];

        // Image fields: a single file_id APPENDS to the images already on the
        // item; an array of file_ids REPLACES them (empty array clears). Podio's
        // PUT otherwise replaces the whole list, silently dropping existing
        // images when only one new file_id is supplied. See helper for details.
        try {
            data = await helper.mergeImageFieldValues(podio, appId, item_id, data);
        } catch (mergeError) {
            console.error('updateItem: image field merge skipped:', mergeError.message || mergeError);
        }

        fields.fields = data;
        var url = `/item/${item_id}?silent=${cfg.silent ? 1 : 0}&hook=${cfg.hook ? 1 : 0}`;

        let data_;
        let retryAttempted = false;

        try {
            data_ = await podio.put(url, fields);
        } catch (updateError) {
            // If autoAddCategoryOptions is enabled and we get a category error, try to fix and retry
            if (cfg.autoAddCategoryOptions && !retryAttempted) {
                const categoryError = parseCategoryError(updateError);
                if (categoryError && categoryError.fieldExternalId && categoryError.missingValue) {
                    this.logger.info(`Category error detected: field='${categoryError.fieldExternalId}', missing='${categoryError.missingValue}'`);

                    const added = await addMissingCategoryOption(
                        podio,
                        appId,
                        categoryError.fieldExternalId,
                        categoryError.missingValue,
                        this.logger
                    );

                    if (added) {
                        this.logger.info('Retrying item update after adding missing category option...');
                        retryAttempted = true;
                        data_ = await podio.put(url, fields);
                    } else {
                        throw updateError;
                    }
                } else {
                    throw updateError;
                }
            } else {
                throw updateError;
            }
        }

        var result = { response: data_ };
        await that.emit('data', messages.newMessageWithBody(result));
    } catch (error) {
        console.error('updateItem failed:', error.message || error);
        await that.emit('error', error);
    }

};


reformData = async function (item, podio) {
    for (const key of Object.keys(item)) {
        const value = item[key];
        if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
        if (!Object.prototype.hasOwnProperty.call(value, "embed")) continue;
        const embed = value.embed;
        // Empty/clear sentinels — "", "[]", [], null — clear the field instead of
        // POSTing a non-URL to /embed/, which Podio rejects ("Must be a valid url").
        const isClear =
            embed === null ||
            (typeof embed === "string" && (embed.trim() === "" || embed.trim() === "[]")) ||
            (Array.isArray(embed) && embed.length === 0);
        if (isClear) {
            item[key] = [];
            continue;
        }
        if (typeof embed === "string") {
            const resolvedUrl = await podio.post('/embed/', { url: embed.trim() });
            value.embed = resolvedUrl.embed_id;
        }
    }
    return item;
}


exports.getMetaModel = function getMetaModel(cfg, cb) {
    // Base inputs present regardless of whether an app is configured. `app_id`
    // lets the caller pick the target app dynamically per message; when set it
    // overrides the configured app (see process()).
    const baseProperties = {
        item_id: {
            type: 'string',
            required: true,
            title: 'Item ID'
        },
        app_id: {
            type: 'string',
            required: false,
            title: 'App ID (optional — overrides the configured app for this item)'
        }
    };

    // No app configured → fully dynamic. We can't introspect the app's fields,
    // so expose just item_id + app_id; the caller maps the remaining fields by
    // their Podio external_id.
    if (!cfg.appId) {
        const outProperties = Object.assign({}, outScheme, baseProperties);
        return cb(null, {
            in: { type: 'object', properties: baseProperties },
            out: { type: 'object', properties: outProperties }
        });
    }

    const podio = new Podio(cfg, this);
    podio.get('/app/' + cfg.appId)
        .then(getSchema)
        .fail(cb)
        .done();

    function getSchema(app) {
        return helper.proccessAll(app, helper, baseProperties, cb, outScheme);
    }
};
