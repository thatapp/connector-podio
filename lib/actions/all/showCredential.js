const Podio = require('../../../podio');
const org = require("../../../helpers/orgHelper");
const space = require("../../../helpers/spaceHelper");
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');

exports.process =  async function showCredential(msg, cfg) {
    var that = this;

    var json_data = {
        response: cfg.oauth
    }
    helper.emitData(cfg,json_data,that);
}
