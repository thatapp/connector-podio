var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const commentPayload = require('../../../helpers/commentPayload');
const helper = require('../../../helpers/itemHelper');

exports.process = processTrigger;

async function processTrigger(msg, cfg, next, snapshot) {
    var that = this;
    var podio = new Podio(cfg);
    const { comment_id } = msg.body;
    const data = commentPayload(msg.body);

    if (!comment_id) {
        throw new Error('Comment_id field is required');
      }

    try {
        const silent = cfg.silent === true || cfg.silent === 'true';
        const comments = await podio.put('/comment/' + comment_id + (silent ? '?silent=1' : ''), data);
        helper.emitData(cfg, comments, that);
    } catch (err) {
        that.emit('error', err);
    }
}


