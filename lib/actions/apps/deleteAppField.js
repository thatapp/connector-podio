const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function deleteAppField(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { app_id, field_id } = msg.body;

    if (!app_id) {
        throw new Error('App_id field is required');
    }
    if (!field_id) {
        throw new Error('Field_id is required');
    }
    try {
        const app = await podio.delete(`/app/${app_id}/field/${field_id}`);
        helper.emitData(cfg, app, that);
    } catch (err) {
        that.emit('error', err);
    }
};