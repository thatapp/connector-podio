const Podio = require('../../../podio');
const org = require("../../../helpers/orgHelper");
const helper = require('../../../helpers/itemHelper');

exports.process = async function getOrg(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { orgId } = cfg;

    if (!orgId) {
        throw new Error('OrgID field is required');
    }

    try {
        const orgData = await podio.get('/org/' + orgId);
        helper.emitData(cfg, orgData, that);
    } catch (error) {
        console.error('getOrg failed:', error.message || error);
        that.emit('error', error);
    }
};

exports.organisations = async function getOrganisations(cfg, cb) {
    return org.getOrganisations(cfg, cb);
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
