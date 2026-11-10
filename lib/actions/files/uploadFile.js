var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg,) {
    var that = this;
    try {
        var podio = new Podio(cfg);
        const { source, filename } = msg.body;

        var url = '/file';
        var payload = {
            source,
            filename
        }

        const file = await podio.post(url, payload);
        await that.emit('data', messages.newMessageWithBody(file));
    } catch (error) {
        console.error('uploadFile failed:', error.message || error);
        await that.emit('error', error);
    }
}


