const Podio = require("../../../podio");
const { messages } = require("elasticio-node");
const _ = require("lodash");
const helper = require("../../../helpers/itemHelper");
const { safeStringify } = require("../../../helpers/redact");
const outScheme = helper.outScheme();

/**
 * Parse category field error from Podio API response
 * Returns { fieldExternalId, missingValue } if category error detected, null otherwise
 */
function parseCategoryError(error) {
  try {
    // Podio returns errors like: "Field 'field_name' does not have option 'value'"
    // or error.error_parameters may contain field info
    const errorMsg = error.message || error.error_description || '';

    // Pattern: Field with external_id 'xxx' does not have option 'yyy'
    const pattern1 = /field.*?['"]([^'"]+)['"].*?does not have option.*?['"]([^'"]+)['"]/i;
    // Pattern: Invalid value for category field
    const pattern2 = /invalid.*?value.*?['"]([^'"]+)['"].*?field.*?['"]([^'"]+)['"]/i;

    let match = errorMsg.match(pattern1);
    if (match) {
      return { fieldExternalId: match[1], missingValue: match[2] };
    }

    match = errorMsg.match(pattern2);
    if (match) {
      return { fieldExternalId: match[2], missingValue: match[1] };
    }

    // Check error_parameters if available
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
 * @param {Podio} podio - Podio API client
 * @param {string} appId - Application ID
 * @param {string} fieldExternalId - Field external ID or field ID
 * @param {string} missingValue - The category value to add
 * @param {object} logger - Logger instance
 */
async function addMissingCategoryOption(podio, appId, fieldExternalId, missingValue, logger) {
  try {
    // Get the app to find the field configuration
    const app = await podio.get(`/app/${appId}`);

    // Find the field by external_id or field_id
    const field = app.fields.find(f =>
      f.external_id === fieldExternalId ||
      String(f.field_id) === String(fieldExternalId) ||
      f.label.toLowerCase() === fieldExternalId.toLowerCase()
    );

    if (!field) {
      logger.info(`Field '${fieldExternalId}' not found in app ${appId}`);
      return false;
    }

    if (field.type !== 'category') {
      logger.info(`Field '${fieldExternalId}' is not a category field (type: ${field.type})`);
      return false;
    }

    // Get current options
    const currentOptions = field.config.settings.options || [];

    // Check if option already exists (case-insensitive)
    const optionExists = currentOptions.some(opt =>
      opt.text.toLowerCase() === missingValue.toLowerCase()
    );

    if (optionExists) {
      logger.info(`Option '${missingValue}' already exists in field '${fieldExternalId}'`);
      return true;
    }

    // Add the new option
    const newOptions = [...currentOptions, { text: missingValue, color: 'DCEBD8' }];

    // Update the field configuration
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
    logger.info(`Successfully added category option '${missingValue}' to field '${fieldExternalId}'`);

    return true;
  } catch (e) {
    logger.info(`Failed to add category option: ${e.message}`);
    return false;
  }
}

/**
 * Attempt to detect and fix category errors from input data
 * This scans the input for category fields and tries to add any missing options
 */
async function autoAddCategoryOptionsFromInput(podio, appId, inputData, logger) {
  try {
    const app = await podio.get(`/app/${appId}`);
    const categoryFields = app.fields.filter(f => f.type === 'category');

    for (const field of categoryFields) {
      const fieldKey = field.external_id || String(field.field_id);
      const inputValue = inputData[fieldKey] || inputData[field.field_id];

      if (!inputValue) continue;

      // Handle both single values and arrays
      const values = Array.isArray(inputValue) ? inputValue : [inputValue];
      const currentOptions = field.config.settings.options || [];

      for (const val of values) {
        // Extract text value if it's an object
        const textValue = typeof val === 'object' ? (val.text || val.value) : val;
        if (!textValue || typeof textValue !== 'string') continue;

        // Check if option exists
        const optionExists = currentOptions.some(opt =>
          opt.text.toLowerCase() === textValue.toLowerCase()
        );

        if (!optionExists) {
          logger.info(`Auto-adding missing category option '${textValue}' to field '${field.label}'`);
          await addMissingCategoryOption(podio, appId, fieldKey, textValue, logger);
          // Refresh the options list
          currentOptions.push({ text: textValue });
        }
      }
    }

    return true;
  } catch (e) {
    logger.info(`Auto-add category options scan failed: ${e.message}`);
    return false;
  }
}

exports.process = async function createItem(msg, cfg) {
  const that = this;
  try {
    let item = msg.body;

    this.logger.info('"Create Item" action started...');
    this.logger.info(JSON.stringify(item));

    const podio = new Podio(cfg);

    // If autoAddCategoryOptions is enabled, scan and add missing options before attempting create
    if (cfg.autoAddCategoryOptions) {
      this.logger.info('Auto-add category options enabled, scanning input...');
      await autoAddCategoryOptionsFromInput(podio, cfg.appId, item, this.logger);
    }

    var item_remodified = await reformData(item, podio);

    const splittableFields = await helper.getSplittableFieldIds(podio, cfg.appId);
    const data = helper.fieldTransform(item_remodified, false, splittableFields);

    // Normalize every field for Podio: omit unchanged values, turn clear
    // sentinels ("", "[]", []) into [], pass real values through. Centralized in
    // helper.normalizeFieldValue so create & update stay in lockstep and no field
    // type ships a value Podio rejects.
    for (const key of Object.keys(data)) {
      const norm = helper.normalizeFieldValue(data[key]);
      if (norm === undefined) { delete data[key]; continue; }
      data[key] = norm;
    }

    this.logger.info("Formatted item data");
    // Redact sensitive fields before logging — item fields may include PII
    // (emails, phone numbers, free-text) and we don't want them in the
    // executions UI verbatim. See helpers/redact.js for the masked keys.
    this.logger.info(safeStringify(data));

    //check for the field with type Link
    const fields = {};
    fields.fields = data;

    // Pass external_id through if the upstream record carries one. Setting
    // external_id on the Podio item enables later reconciliation via
    // GET /item/app/{app_id}/external_id/{external_id} — see the
    // `reconcileBatch` action and the README's reliable-batch pattern.
    const incomingExternalId = msg.body && msg.body.external_id;
    if (incomingExternalId !== undefined && incomingExternalId !== null && incomingExternalId !== '') {
      fields.external_id = String(incomingExternalId);
    }

    var url = `/item/app/${cfg.appId}?silent=${cfg.silent ? 1 : 0}&hook=${
      cfg.hook ? 1 : 0
    }`;

    let items;
    let retryAttempted = false;

    try {
      items = await podio.post(url, fields);
    } catch (createError) {
      // If autoAddCategoryOptions is enabled and we get a category error, try to fix and retry
      if (cfg.autoAddCategoryOptions && !retryAttempted) {
        const categoryError = parseCategoryError(createError);
        if (categoryError && categoryError.fieldExternalId && categoryError.missingValue) {
          this.logger.info(`Category error detected: field='${categoryError.fieldExternalId}', missing='${categoryError.missingValue}'`);

          const added = await addMissingCategoryOption(
            podio,
            cfg.appId,
            categoryError.fieldExternalId,
            categoryError.missingValue,
            this.logger
          );

          if (added) {
            this.logger.info('Retrying item creation after adding missing category option...');
            retryAttempted = true;
            items = await podio.post(url, fields);
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      } else {
        throw createError;
      }
    }

    await that.emit("data", messages.newMessageWithBody(items));
    this.logger.info('"Create Item" action complete...');
  } catch (error) {
      this.logger.info("Create Item Error");
      this.logger.info(error);
      this.logger.info(JSON.stringify(error.stack));
    await that.emit("error", error);
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
      const resolvedUrl = await podio.post("/embed/", { url: embed.trim() });
      value.embed = resolvedUrl.embed_id;
    }
  }
  return item;
};

exports.getMetaModel = function getMetaModel(cfg, cb) {
  const podio = new Podio(cfg, this);
  podio
    .get("/app/" + cfg.appId)
    .then(getSchema)
    .fail(cb)
    .done();

  function getSchema(app) {
    let itemProperties = {
      external_id: {
        type: "string",
        required: false,
        title: "External ID",
      },
    };
    return helper.proccessAll(app, helper, itemProperties, cb, outScheme);
  }
};
