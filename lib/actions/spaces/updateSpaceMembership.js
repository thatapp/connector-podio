const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');

exports.process =  async function updateSpaceMembership(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const data = msg.body;

    try {
        const { toPodioId } = require('../../../helpers/coerce');
        const space = toPodioId(data.space_id, 'space_id');
        const user = toPodioId(data.user_id ?? data.user_ids, 'user_id');
        if (!data.role) throw new Error('role is required.');
        const spaceMember = await podio.put('/space/' + space + '/member/' + user, { role: data.role });
        helper.emitData(cfg, spaceMember, that);
    } catch (err) {
        that.emit('error', err);
    }
};
