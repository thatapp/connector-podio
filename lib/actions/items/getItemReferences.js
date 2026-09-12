const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');
const {messages} = require("elasticio-node");

exports.process = async function getItemReferences(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);

    var url = '/item/' + msg.body.item_id + '/reference/';

    try {
        const items_references = await podio.get(url);
        await helper.emitData(cfg, items_references, that);
    } catch (err) {
        // Previously the .fail() helper emitted 'error' but execution fell
        // through to emitData with undefined — counting failed items as
        // processed in the iPaaS execution view. Try/catch + return-on-error
        // is the correct pattern.
        that.emit('error', err);
    }
};

