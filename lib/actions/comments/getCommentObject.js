var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
var _ = require('lodash');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {
    var that = this;
    var podio = new Podio(cfg);
    const { type, id } =  msg.body;

    try {
        const comments = await podio.get(`/comment/${type}/${id}/`);
        helper.emitData(cfg, comments, that);
    } catch (err) {
        that.emit('error', err);
    }
}

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
