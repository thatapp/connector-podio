'use strict';

const Podio = require('../../../podio');
const { toPodioId } = require('../../../helpers/coerce');
const { emitData } = require('../../../helpers/itemHelper');
const { autoAddCategoryOptionsFromInput } = require('../../../helpers/categoryOptions');

exports.process = async function createItemDynamic(msg, cfg) {
    try {
        const input = msg.body;
        const appId = toPodioId(input.app_id, 'app_id');
        if (!input.fields || Array.isArray(input.fields) || typeof input.fields !== 'object') {
            throw new Error('fields must be a Podio fields object.');
        }

        const podio = new Podio(cfg, this);
        if (cfg.autoAddCategoryOptions === true || cfg.autoAddCategoryOptions === 'true') {
            await autoAddCategoryOptionsFromInput(podio, appId, input.fields, this.logger);
        }

        const payload = { fields: input.fields };
        for (const key of ['external_id', 'file_ids', 'tags', 'reminder', 'recurrence', 'linked_account_id', 'ref']) {
            if (input[key] !== undefined) payload[key] = input[key];
        }
        const hook = cfg.hook === false || cfg.hook === 'false' ? 0 : 1;
        const silent = cfg.silent === true || cfg.silent === 'true' ? 1 : 0;
        const item = await podio.post('/item/app/' + appId + '/?hook=' + hook + '&silent=' + silent, payload);
        await emitData(cfg, item, this);
    } catch (error) {
        await this.emit('error', error);
    }
};
