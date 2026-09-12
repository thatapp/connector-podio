const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');
const {messages} = require('elasticio-node');

exports.process =  async function getHooks(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const data = msg.body;
    try {
        const hooks = await podio.get('/hook/' + data.ref_type + "/" + data.ref_id);
        await helper.emitData(cfg, hooks, that);
    } catch (err) {
        that.emit('error', err);
    }
};