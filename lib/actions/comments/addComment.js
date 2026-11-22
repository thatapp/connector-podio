var Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
const commentPayload = require('../../../helpers/commentPayload');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {

    var that = this;
    try {
        var podio = new Podio(cfg);
        const {type, id} = msg.body;
        const data = commentPayload(msg.body);

        if (!type) {
            throw new Error('type field is required');
        }

        if (!id) {
            throw new Error('Object Id field is required');
        }

        const silent = cfg.silent === true || cfg.silent === 'true';
        const path = '/comment/' + type + '/' + id + (silent ? '?silent=1' : '');
        const comments = await podio.post(path, data);
        await that.emit('data', messages.newMessageWithBody(comments));
    } catch (error) {
        console.error('addComment failed:', error.message || error);
        await that.emit('error', error);
    }
}
