const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function getAppSpaceByUrlLabel(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { space_id, app_slug = msg.body.url_label } = msg.body;
    const url_label = app_slug && encodeURIComponent(app_slug);

    if (!space_id) {
        throw new Error('Space_id field is required');
    }
    if (!url_label) {
        throw new Error('Url_label field is required');
    }
    try {
        const app = await podio.get(`/app/space/${space_id}/${url_label}`);
        helper.emitData(cfg, app, that);
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
