
const helper = require('../../../helpers/itemHelper');

exports.process = async function getTokens(msg, cfg) {
    var that = this;
    var items = cfg;

    helper.emitData(cfg,items,that);

};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
