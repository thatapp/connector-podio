'use strict';

const Podio = require('../../../podio');
const { toPodioId } = require('../../../helpers/coerce');
const { emitData } = require('../../../helpers/itemHelper');
const { guard } = require('../../../helpers/hookVerify');

exports.process = guard(async function getAppInverseDependencies(msg, cfg) {
    try {
        const appId = toPodioId(msg.body.app_id, 'app_id');
        const result = await new Podio(cfg, this).get('/app/' + appId + '/inverse_dependencies/');
        if (!Array.isArray(result.dependent_apps)) {
            throw new Error('Podio did not return a dependent_apps list.');
        }
        await emitData(cfg, result, this);
    } catch (error) {
        await this.emit('error', error);
    }
});
