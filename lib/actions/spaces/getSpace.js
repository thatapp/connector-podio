const Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {
    var that = this;
    var podio = new Podio(cfg);
    const {space_id} = msg.body;

    if (!space_id) {
        throw new Error('Space Id field is required');
    }
    try {
        const space = await podio.get('/space/' + space_id);
        helper.emitData(cfg, space, that);
    } catch (err) {
        that.emit('error', err);
    }
}


