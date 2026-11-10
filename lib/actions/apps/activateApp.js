const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function activateApp(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { app_id } = msg.body;

    if (!app_id) {
        throw new Error('App_id field is required');
    }
    try {
        const app = await podio.post(`/app/${app_id}/activate`);
        helper.emitData(cfg, app, that);
    } catch (err) {
        that.emit('error', err);
    }
};