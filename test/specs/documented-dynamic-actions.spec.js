'use strict';

const assert = require('assert');
const sinon = require('sinon');
const manifest = require('../../component.json');
const Podio = require('../../podio');
const action = key => require('../../' + manifest.actions[key].main).process;
const schema = key => require('../../' + manifest.actions[key].metadata.in).properties;

describe('Documented dynamic item and inverse app dependency actions', function () {
    let sandbox, get, post, put, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get');
        post = sandbox.stub(Podio.prototype, 'post');
        put = sandbox.stub(Podio.prototype, 'put');
        context = { emit: sandbox.stub().resolves(), logger: { info() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    it('emits the actual inbound links and preserves an empty dependency list', async function () {
        for (const rows of [[], [{ app_id: 12, field_id: 34 }]]) {
            get.resolves({ dependent_apps: rows });
            await action('getAppInverseDependencies').call(context, { body: { app_id: '15' } }, {});
            assert.deepStrictEqual(get.lastCall.args, ['/app/15/inverse_dependencies/']);
            assert.deepStrictEqual(context.emit.lastCall.args[1].body, { dependent_apps: rows });
        }
    });

    it('sends every mapped field through exactly one create, with no implicit schema request', async function () {
        const payload = { fields: { number: 0, note: 'QA' }, tags: ['synthetic'], file_ids: [3],
            reminder: { remind_delta: 5 }, recurrence: { step: 1 }, linked_account_id: 2, ref: { type: 'item', id: 8 } };
        const input = { app_id: '15', ...payload };
        post.resolves({ item_id: 19, revision: 0 });
        for (const key of Object.keys(input)) assert(schema('createItemDynamic')[key], key + ' is discoverable');
        await action('createItemDynamic').call(context, { body: input }, { autoAddCategoryOptions: 'false', silent: 'false' });
        assert.deepStrictEqual(post.firstCall.args, ['/item/app/15/?hook=1&silent=0', payload]);
        assert.strictEqual(post.callCount, 1);
        assert.strictEqual(get.callCount + put.callCount, 0);
        assert.strictEqual(context.emit.firstCall.args[1].body.item_id, 19);
    });

    it('honors a checked category option before the one requested silent write', async function () {
        get.resolves({ fields: [{ field_id: 85, external_id: 'stage', type: 'category',
            config: { label: 'Stage', settings: { options: [{ id: 3, text: 'First', color: 'DCEBD8' }] } } }] });
        put.resolves({});post.resolves({ item_id: 19 });
        await action('createItemDynamic').call(context, { body: { app_id: 15, fields: { stage: 'New' } } },
            { autoAddCategoryOptions: true, silent: 'true', hook: 'false' });
        assert.strictEqual(put.callCount, 1);
        assert.deepStrictEqual(put.firstCall.args[1].config.settings.options.map(x => x.text), ['First', 'New']);
        assert.strictEqual(post.firstCall.args[0], '/item/app/15/?hook=0&silent=1');
    });

    it('refuses an invalid app or malformed fields before making a provider request', async function () {
        await action('getAppInverseDependencies').call(context, { body: { app_id: 'bad' } }, {});
        await action('createItemDynamic').call(context, { body: { app_id: 15, fields: [] } }, {});
        assert.deepStrictEqual(context.emit.getCalls().map(call => call.args[0]), ['error', 'error']);
        assert.strictEqual(get.callCount + post.callCount + put.callCount, 0);
    });
});
