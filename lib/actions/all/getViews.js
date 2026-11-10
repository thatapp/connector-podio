var Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = async function getViews(msg, cfg) {
    var that = this;
    var item = msg.body;
    var podio = new Podio(cfg);
    try {
        const items = await podio.get('/view/app/' + item.app_id);
        helper.emitData(cfg, items, that);
    } catch (err) {
        that.emit('error', err);
    }
};

