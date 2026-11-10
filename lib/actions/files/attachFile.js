var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');

exports.process = processTrigger;

async function processTrigger(msg, cfg) {
    var that = this;
    try {
        var podio = new Podio(cfg);
        const { ref_id, file_id } = msg.body;
        const payload = {
            ref_id,
            ref_type: cfg.ref_type
        };


        let url = `/file/${file_id}/attach`;

        const file = await podio.post(url, payload);

        await that.emit('data', messages.newMessageWithBody({
            "status" : "success",
            "message": "File has been attached successfully"
        }));
    } catch (error) {
        console.error('attachFile failed:', error.message || error);
        await that.emit('error', error);
    }
}


