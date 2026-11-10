const Podio = require('../../../podio');
const space = require("../../../helpers/spaceHelper");
const helper = require('../../../helpers/itemHelper');
const {messages} = require('../../../helpers/messages');


exports.process =  async function updateAppField(msg, cfg) {
    var that = this;
    var podio = new Podio(cfg);
    var data = msg.body;

    var fields = {};
    fields.app_id = parseInt(data.app_id);
    fields.field_id = parseInt(data.field_id);

    try {
        // BUG FIX: previous code was `var app_field = podio.put(...).fail(...)`
        // — NO await. So `app_field` was a Promise (not the response), and the
        // function returned before the PUT actually completed. Now properly
        // awaited; result is the actual response body.
        const app_field = await podio.put('/app/' + data.app_id + "/field/" + data.field_id, fields);
        helper.emitData(cfg, app_field, that);
    } catch (err) {
        that.emit('error', err);
    }
};

exports.getMetaModel = function getMetaModel(cfg, cb) {
    return space.getCSPaceModel(cfg, cb);
};