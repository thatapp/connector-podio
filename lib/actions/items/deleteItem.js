var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
var _ = require('lodash');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {
    var that = this;
    var podio = new Podio(cfg);
    const { item_id } =  msg.body;

    if (!item_id) {
        throw new Error('item_id field is required');
      }

    try {
        await podio.delete('/item/' + item_id);
        helper.emitData(cfg, { message: "Item Deleted Successfully" }, that);
    } catch (err) {
        that.emit('error', err);
    }
}


