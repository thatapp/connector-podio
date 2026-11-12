const Podio = require('../../../podio');
const _ = require('lodash');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');
const { messages } = require('../../../helpers/messages');

exports.process = async function getItem(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const { item_id } = msg.body;

    if (!item_id) {
        throw new Error('Item_id field is required');
    }

    try {
        const items = await podio.get('/item/' + msg.body.item_id);
        helper.emitData(cfg, items, that);
    } catch (err) {
        // Surface errors through the platform's error channel. The previous
        // pattern (emit('data', ...) on failure + fall-through to emitData
        // with undefined) caused failed items to be COUNTED AS PROCESSED by
        // the iPaaS — the root cause of "platform shows 1000 done, Podio is
        // missing some" silent-loss reports.
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
