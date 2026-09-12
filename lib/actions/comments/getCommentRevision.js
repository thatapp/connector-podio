var Podio = require('../../../podio');
const { messages } = require('elasticio-node');
var _ = require('lodash');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {
    var that = this;
    var podio = new Podio(cfg);
    const { comment_id } =  msg.body;

    if (!comment_id) {
        throw new Error('Comment_id field is required');
    }

    try {
        const comments = await podio.get('/comment/' + comment_id + '/revision');
        await helper.emitData(cfg, comments, that);
    } catch (err) {
        that.emit('error', err);
    }
}


