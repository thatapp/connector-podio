const endpoint = require("../../../helpers/podioEndpont");
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');

exports.process = async function deleteHooks(msg, cfg) {
    const that = this;
    const data = msg.body;

    try {
        // BUG FIX: previous code chained .fail().done() on a non-awaited Q
        // promise, then immediately emitted `data` as success — the DELETE
        // hadn't yet completed (or might fail), and the caller saw success
        // either way. Now properly awaited.
        await endpoint.podioDelete(cfg, data.hook_id);
        await helper.emitData(cfg, { message: 'Hook deleted', hook_id: data.hook_id }, that);
    } catch (err) {
        that.emit('error', err);
    }
};