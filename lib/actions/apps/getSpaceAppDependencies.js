const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function getSpaceAppDependencies(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { space_id } = msg.body;

    try {
        const app = await podio.get(`/space/${space_id}/dependencies/`);
        helper.emitData(cfg, app, that);
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
