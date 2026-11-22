'use strict';

const { createHash } = require('crypto');
const Podio = require('../podio');
const { toPodioId } = require('./coerce');
const { messages } = require('./messages');

function stableFields(value, field) {
    if (Array.isArray(value)) {
        if (field === 'rights' && value.every(entry => typeof entry === 'string')) return [...value].sort();
        return value.map(entry => stableFields(entry));
    }
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableFields(value[key], key)]));
}

module.exports = function pollPodioResource(resource) {
    const idField = resource + '_id';
    return async function poll(msg, cfg, snapshot) {
        try {
            const id = toPodioId(msg?.body?.[idField] ?? cfg?.[idField], idField);
            const data = await new Podio(cfg, this).get('/' + resource + '/' + id);
            if (Number(data?.[idField]) !== id) throw new Error('Podio returned a different ' + resource + '.');
            const body = { ...data };
            delete body.token;
            delete body.app_token;
            const digest = createHash('sha256').update(JSON.stringify(stableFields(body))).digest('hex');
            if (snapshot?.[idField] !== id || snapshot.digest !== digest) {
                await this.emit('data', messages.newMessageWithBody(body));
            }
            await messages.emitSnapshot.call(this, { [idField]: id, digest });
        } catch (error) {
            await this.emit('error', error);
        }
    };
};
