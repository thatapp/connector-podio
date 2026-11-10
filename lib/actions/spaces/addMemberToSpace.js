const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process = async function addMemberToSpace(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const data = msg.body;

    let fields = {};
    if (cfg.role) {
        fields.role = cfg.role;
    }

    if (data.message) {
        fields.message = data.message;
    }
    if (data.users) {
        fields.users = data.users;
    }
    if (data.profiles) {
        fields.profiles = data.profiles;
    }
    if (data.mails) {
        fields.mails = data.mails;
    }
    if (data.context_ref_type) {
        fields.context_ref_type = data.context_ref_type;
    }
    if (data.context_ref_id) {
        fields.context_ref_id = parseInt(data.context_ref_id);
    }

    try {
        // BUG FIX: previous code was `var addMember = podio.post(...).fail(...)`
        // — NO await. response.data was a Promise (not the resolved response),
        // and the function returned before the POST actually completed.
        const addMember = await podio.post('/space/' + data.space_id + '/member/', fields);
        const response = {
            message: "Member added to Space Successfully",
            data: addMember,
            request: fields,
        };
        helper.emitData(cfg, response, that);
    } catch (err) {
        that.emit('error', err);
    }
};

