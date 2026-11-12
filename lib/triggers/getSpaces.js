var Podio = require('../../podio');
const { messages } = require('../../helpers/messages');
var _ = require('lodash');

exports.process = async function getSpaces(msg, cfg) {
    var fields = msg.body;
    var that = this;
    var podio = new Podio(cfg, this);

    function transform(result, space){
        result[space.space_id] = space.name;
    }

    try {
        let spaces = await podio.get('/space/top/' + fields.org_id, { limit: 100 });
        if (!_.isArray(spaces)) {
            // Previous code called `cb(new Error(...))` — cb is undefined.
            throw new Error('Unable to retrieve spaces');
        }
        spaces = _(spaces).transform(transform, {}).value();
        messages.emitSnapshot.call(that, spaces);
        await that.emit('data', messages.newMessageWithBody(spaces));
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../helpers/hookVerify').guard(exports.process);
