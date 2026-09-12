const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');

exports.process = async function verifyHooks(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const data = msg.body;
    let fields = {};
    fields.code = data.code;

    try {
        // BUG FIX: previous code was `var verify = podio.post(...).fail(...)` —
        // NO await. `verify` was a Promise, the function returned before
        // verification actually completed.
        const verify = await podio.post('/hook/' + data.hook_id + '/verify/validate', fields);
        await helper.emitData(cfg, verify, that);
    } catch (err) {
        that.emit('error', err);
    }
};

