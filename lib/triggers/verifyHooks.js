const Podio = require('../../podio');
const _ = require('lodash');
const e = require("../../helpers/elasticoHelper");
const { messages } = require('../../helpers/messages');
const { toPodioId } = require('../../helpers/coerce');

exports.process = async function verifyHooks(msg, cfg) {
    this.logger.info('Received new message');
    const that = this;
    const podio = new Podio(cfg);
    const data = msg.body;

    if (!data) {
        // Nothing to verify; emit end so the polling cycle completes cleanly.
        return that.emit('end');
    }

    try {
        const hookId = toPodioId(data.hook_id, 'hook_id');
        if (data.type && data.type !== 'hook.verify') {
            const reserved = new Set(['_query', '_headers', '_url', '_method', '_additionalUrlPath']);
            const body = Object.fromEntries(Object.entries(data).filter(([key]) => !reserved.has(key)));
            await that.emit('data', messages.newMessageWithBody(body));
            await that.emit('end');
            return;
        }
        if (typeof data.code !== 'string' || !data.code.trim()) throw new Error('A Podio verification code is required.');
        const app = await podio.post('/hook/' + hookId + '/verify/validate', { code: data.code });
        await e.emit(that, app);
        that.emit('end');
    } catch (err) {
        // Previous chain used `.catch(error => console.log(error.message))` which
        // SWALLOWED errors and let the .fail handler still run, causing the
        // platform to receive ambiguous success/error/end signals. Try/catch
        // with a single 'error' emit is the canonical pattern.
        that.emit('error', err);
    }
};
