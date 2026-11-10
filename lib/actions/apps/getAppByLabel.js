const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function getAppByLabel(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { org_label, space_label, app_label } = msg.body;

    if (!org_label) {
        throw new Error('Org_label field is required');
    }
    if (!space_label) {
        throw new Error('Space_label field is required');
    }
    if (!app_label) {
        throw new Error('App_label field is required');
    }
    try {
        const app = await podio.get(`/app/org/${org_label}/space/${space_label}/${app_label}`);
        helper.emitData(cfg, app, that);
    } catch (err) {
        that.emit('error', err);
    }
};