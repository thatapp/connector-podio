var Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = async function getView(msg, cfg) {
    var that = this;
    var item = msg.body;
    var podio = new Podio(cfg);
    try {
        const items = await podio.get('/view/app/' + item.app_id + '/' + item.view_id_or_name);
        helper.emitData(cfg, items, that);
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
