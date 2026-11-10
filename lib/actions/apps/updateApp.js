var Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = async function updateApp(msg, cfg) {
    var that = this;
    var item = msg.body;
    var podio = new Podio(cfg);

    var fields = {};
    fields.silent = item.silent;

    try {
        const items = await podio.put(`/app/${item.app_id}`, fields);
        helper.emitData(cfg, items, that);
    } catch (err) {
        that.emit('error', err);
    }
};

