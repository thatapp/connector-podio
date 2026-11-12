const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');

exports.process = async function getAllSpacesOrg(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { org_id } = msg.body;

    if (!org_id) {
        throw new Error('OrgID field is required');
    }

    try {
        // BUG FIX: previous code was `var org = podio.get(...).fail(...)` —
        // NO await. helper.emitData was emitting a Promise.
        // Endpoint note (B.1 live-verify): /org/{id}/space is LIVE and
        // returns rich 26-key space objects. See README "Search v1 vs v2"
        // for the rich-vs-lightweight distinction.
        const org = await podio.get('/org/' + org_id + '/space');
        helper.emitData(cfg, org, that);
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
