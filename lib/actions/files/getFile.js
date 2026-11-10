var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {
    var that = this;
    var podio = new Podio(cfg);
    const { file_id } =  msg.body;

    if (!file_id) {
        throw new Error('File_id field is required');
      }

    try {
        const files = await podio.get('/file/' + file_id);
        helper.emitData(cfg, files, that);
    } catch (err) {
        that.emit('error', err);
    }
}


