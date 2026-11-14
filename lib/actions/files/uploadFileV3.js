var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const { postToFileProxy } = require('./fileProxy');

exports.process = processTrigger;

async function processTrigger(msg, cfg) {
    let that = this;
    try {
        const { source, filename } = msg.body;

        var payload = {
            source, filename,
            refresh_token: cfg.oauth.refresh_token
        }

        const file = await postToFileProxy('file', payload);
        await that.emit('data', messages.newMessageWithBody(file.data));
    } catch (error) {
        // Surface errors through the platform's error channel. The previous
        // pattern (emit('data', error)) counted failed uploads as successful
        // messages in the iPaaS execution view — the silent-loss pattern.
        // Also removed console.log(payload) which included the OAuth
        // refresh_token (credential leak — B.6 will eradicate remaining ones).
        await that.emit('error', error);
    }
}



