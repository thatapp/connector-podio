var Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
var _ = require('lodash');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {

    var that = this;
    try {
        var podio = new Podio(cfg);
        const {type, id, data} = msg.body;

        if (!type) {
            throw new Error('type field is required');
        }

        if (!id) {
            throw new Error('Object Id field is required');
        }

        const comments = await podio.post(`/comment/${type}/${id}`, data);
        await that.emit('data', messages.newMessageWithBody(comments));
    } catch (error) {
        console.error('addComment failed:', error.message || error);
        await that.emit('error', error);
    }
}
