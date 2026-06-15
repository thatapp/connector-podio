var Podio = require('../../../podio');
const { messages } = require('elasticio-node');
const axios = require('axios');

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

        var uploadurl = 'https://thatapp-api.thatapp.io/api/v2/proxy/url';
        const file = await axios.post(uploadurl, payload);
        await that.emit('data', messages.newMessageWithBody(file.data));
    } catch (error) {
        console.error('uploadFileV2 failed:', error.message || error);
        await that.emit('error', error);
    }
}



