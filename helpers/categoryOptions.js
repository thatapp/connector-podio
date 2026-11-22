'use strict';

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

module.exports = { addMissingCategoryOption, autoAddCategoryOptionsFromInput };
