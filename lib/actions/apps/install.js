var Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = async function install(msg, cfg) {
    var that = this;
    var item = msg.body;
    var podio = new Podio(cfg);

    var fields = {};
    fields.space_id = parseInt(item.space_id, 10);

    try {
        const items = await podio.post('/app/' + item.app_id + '/install', fields);
        helper.emitData(cfg, items, that);
    } catch (err) {
        that.emit('error', err);
    }
};

