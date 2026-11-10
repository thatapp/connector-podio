const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function updateSpaceMembership(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const data = msg.body;

    let fields = {};
    fields.space_id = data.space_t_id;
    fields.user_id = data.user_t_id;
    fields.role = data.role_t;

    try {
        const spaceMember = await podio.put("/space/" + fields.space_id + "/member/" + fields.user_id, fields);
        const response = {
            message: "Space Updated Successfully",
            role: data.role_t,
            data: spaceMember,
        };
        helper.emitData(cfg, response, that);
    } catch (err) {
        that.emit('error', err);
    }
};
