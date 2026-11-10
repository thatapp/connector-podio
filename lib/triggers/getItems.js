var request = require('request');
var API_URL = 'https://api.podio.com';
var Podio = require('../../podio');
const { messages } = require('../../helpers/messages');
var _ = require('lodash');

exports.process = async function getItem(msg, cfg) {
    var fields = msg.body;
    var that = this;
    var podio = new Podio(cfg, this);

    try {
        const item = await podio.get('/item/' + fields.item_id);
        // Note: /item/{id} returns a single OBJECT, not an array. The previous
        // `_.isArray(item)` check was always false and led to calling an
        // undefined `cb` — the trigger silently never emitted data.
        messages.emitSnapshot.call(that, item);
        await that.emit('data', messages.newMessageWithBody(item));
    } catch (err) {
        // Surface via error channel. Previous .fail()-then-helper pattern
        // emitted both 'error' AND a success message with undefined body —
        // root cause of "platform shows N processed but Podio has fewer."
        that.emit('error', err);
    }
};


