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
        const options = new URLSearchParams();
        for (const name of ['hook', 'silent']) {
            const value = msg.body[name] ?? cfg[name];
            if (value !== undefined) options.set(name, Number(value === true || value === 'true'));
        }
        const query = options.toString();
        await podio.delete('/item/' + item_id + (query ? '?' + query : ''));
        helper.emitData(cfg, { message: "Item Deleted Successfully" }, that);
    } catch (err) {
        that.emit('error', err);
    }
}


