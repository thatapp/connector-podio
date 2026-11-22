const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function updateSpaceMembership(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const data = msg.body;

    try {
        const { toPodioId } = require('../../../helpers/coerce');
        const space = toPodioId(data.space_id ?? data.space_t_id, 'space_id');
        const user = toPodioId(data.user_id ?? data.user_t_id, 'user_id');
        const role = data.role ?? data.role_t;
        if (!role) throw new Error('role is required.');
        const spaceMember = await podio.put('/space/' + space + '/member/' + user, { role });
        const response = {
            message: "Space Updated Successfully",
            role,
            data: spaceMember,
        };
        await helper.emitData(cfg, response, that);
    } catch (err) {
        await that.emit('error', err);
    }
};
