var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {
    var that = this;
    var podio = new Podio(cfg);

    try {
        const contact = await podio.get('/contact/');
        helper.emitData(cfg, contact, that);
    } catch (err) {
        that.emit('error', err);
    }
}
