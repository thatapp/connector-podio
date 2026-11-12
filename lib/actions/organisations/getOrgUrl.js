const Podio = require('../../../podio');
const e = require("../../../helpers/elasticoHelper");
const helper = require('../../../helpers/itemHelper');


exports.process = async function getOrgUrl(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const url = msg.body && msg.body.url;

    if (!url) {
        throw new Error('url field is required (pass via msg.body.url)');
    }

    try {
        // BUG FIX: previous code was `var org_url = podio.get(...).fail(...)` —
        // NO await. Also the input was being read as `const url = msg.body`
        // which treats the entire body as the URL string. Now reads the
        // .url property properly.
        const org_url = await podio.get('/org/url', { url });
        helper.emitData(cfg, org_url, that);
    } catch (err) {
        that.emit('error', err);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
