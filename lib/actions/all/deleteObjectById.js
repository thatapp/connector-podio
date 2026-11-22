'use strict';

const Podio = require('../../../podio');
const { toPodioId } = require('../../../helpers/coerce');
const { messages } = require('../../../helpers/messages');
const { model } = require('../../../component.json').actions.deleteObjectById.fields.objectType;

exports.process = async function deleteObjectById(msg, cfg) {
    try {
        const type = cfg.objectType;
        if (!Object.hasOwn(model, type)) throw new Error('Select a supported object type.');
        const id = toPodioId(msg?.body?.id, 'ID Value');
        await new Podio(cfg, this).delete('/' + type + '/' + id);
        await this.emit('data', messages.newMessageWithBody({ id }));
    } catch (error) {
        await this.emit('error', error);
    }
};
