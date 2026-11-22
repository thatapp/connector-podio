const Podio = require('../../../podio');
const space = require("../../../helpers/spaceHelper");
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');


exports.process =  async function updateAppField(msg, cfg) {
    var that = this;
    var podio = new Podio(cfg);
    var data = msg.body;

    try {
        const { toPodioId } = require('../../../helpers/coerce');
        const app = toPodioId(data.app_id, 'app_id');
        const field = toPodioId(data.field_id, 'field_id');
        const path = '/app/' + app + '/field/' + field;
        if (data.config !== undefined && (!data.config || typeof data.config !== 'object' || Array.isArray(data.config))) {
            throw new Error('config must be a field configuration object.');
        }
        const update = {};
        for (const key of ['label', 'description', 'delta', 'required', 'hidden_create_view_edit', 'settings', 'mapping']) {
            if (data[key] !== undefined) update[key] = data[key];
        }
        Object.assign(update, data.config);
        if (!Object.keys(update).length) throw new Error('Choose field settings to update.');
        const prior = await podio.get(path);
        if (!prior.config || Number(prior.field_id) !== field) throw new Error('Could not confirm the selected field.');
        const config = { ...prior.config, ...update };
        if (update.settings) config.settings = { ...prior.config.settings, ...update.settings };
        await podio.put(path, config);
        await helper.emitData(cfg, await podio.get(path), that);
    } catch (err) {
        await that.emit('error', err);
    }
};

exports.getMetaModel = function getMetaModel(cfg, cb) {
    return space.getCSPaceModel(cfg, cb);
};