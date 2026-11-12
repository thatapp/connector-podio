const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function getAppsBySpace(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { space_id, include_inactive } = msg.body;

    if (!space_id) {
        throw new Error('Space_id field is required');
    }
    if (!include_inactive) {
        throw new Error('Include_inactive field is required');
    }
    try {
        const app = await podio.get(`/app/space/${space_id}/`);
        helper.emitData(cfg, app, that);
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
