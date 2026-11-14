var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const { postToFileProxy } = require('./fileProxy');

exports.process = processTrigger;

async function processTrigger(msg, cfg) {
    let that = this;
    try {

        const { url, filename, mimetype, description } = msg.body;
        var payload = {
            url,
            filename,
            mimetype,
            description,
            refresh_token: cfg.oauth.refresh_token
        };
        // NOTE: do not log `payload` — it carries the OAuth refresh_token.

        const file = await postToFileProxy('url', payload);
        await that.emit('data', messages.newMessageWithBody(file.data));
    } catch (error) {
        console.error('uploadFileV2 failed:', error.message || error);
        await that.emit('error', error);
    }
}



