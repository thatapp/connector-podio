var Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

exports.process = async function updateApp(msg, cfg) {
    var that = this;
    var item = msg.body;
    var podio = new Podio(cfg);

    const { toPodioId } = require('../../../helpers/coerce');
    const appId = toPodioId(item.app_id, 'app_id');

    try {
        if (!item.config || typeof item.config !== 'object' || Array.isArray(item.config) || !Object.keys(item.config).length) {
            throw new Error('config must contain the application settings to update.');
        }
        const silent = item.silent === true || item.silent === 'true';
        const items = await podio.put('/app/' + appId + '/v2?silent=' + Number(silent), { config: item.config });
        helper.emitData(cfg, items, that);
    } catch (err) {
        that.emit('error', err);
    }
};

