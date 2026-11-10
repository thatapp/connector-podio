var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg) {
    const that = this;
    const action = "Copy File";
    this.logger.info(`"${action}" action started...`);

    var podio = new Podio(cfg);
    const { file_id } = msg.body;

    if (!file_id) {
        throw new Error('file_id field is required');
    }

    try {
        const response = await podio.post(`/file/${file_id}/copy`);
        this.logger.info(`"${action}" action completed...`);
        that.emit('data', messages.newMessageWithBody(response));
    } catch (err) {
        this.logger.info(`"${action}" action errored...`);
        that.emit('error', err);
    }
}


