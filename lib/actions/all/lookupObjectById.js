'use strict';

const Podio = require('../../../podio');
const { guard } = require('../../../helpers/hookVerify');
const { toPodioId } = require('../../../helpers/coerce');
const { messages } = require('../../../helpers/messages');
const { model } = require('../../../component.json').actions.lookupObjectById.fields.objectType;

exports.process = guard(async function lookupObjectById(msg, cfg) {
    try {
        const type = cfg.objectType;
        if (!Object.hasOwn(model, type)) throw new Error('Select a supported object type.');
        const id = toPodioId(msg?.body?.id, 'ID Value');
        const value = await new Podio(cfg, this).get('/' + type + '/' + id);
        await this.emit('data', messages.newMessageWithBody(value));
    } catch (error) {
        await this.emit('error', error);
    }
});
