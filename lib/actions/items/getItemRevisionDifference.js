const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

exports.process = async function getItemRevisionDifference(msg, cfg) {
    const that = this;
    try {
        const body = (msg && msg.body) || {};
        for (const name of ['item_id', 'revision_from', 'revision_to']) {
            const value = body[name];
            // Revision zero is valid; an item ID must be positive.
            if (!Number.isSafeInteger(value) || value < (name === 'item_id' ? 1 : 0)) {
                const error = new Error(name + ' must be a ' + (name === 'item_id' ? 'positive' : 'non-negative') + ' safe integer');
                error.retry = false;
                throw error;
            }
        }
        const podio = new Podio(cfg);
        const url = '/item/' + body.item_id + '/revision/' + body.revision_from + '/' + body.revision_to;
        const items_references = await podio.get(url);
        await helper.emitData(cfg, items_references, that);
    } catch (err) {
        await that.emit('error', err);
    }
};

