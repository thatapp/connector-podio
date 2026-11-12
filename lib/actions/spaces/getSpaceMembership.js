const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');

exports.process =  async function getSpaceMembership(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const data = msg.body;

    let fields = {};
    fields.space_id = data.space_id;
    fields.user_id = data.user_id;

    try {
        const spaceMember = await podio.get('/space/' + data.space_id + '/member/' + data.user_id);
        helper.emitData(cfg, spaceMember, that);
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
