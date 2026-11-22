'use strict';

const assert = require('assert');
const sinon = require('sinon');
const manifest = require('../../component');
const Podio = require('../../podio');

describe('Documented single-object Podio polling and normal webhook deliveries', function () {
    let sandbox, get, post, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get');
        post = sandbox.stub(Podio.prototype, 'post');
        context = { emit: sandbox.stub().resolves(), logger: { info() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    for (const name of ['App', 'Org', 'Space']) {
        const kind = name.toLowerCase(), key = kind + '_id';
        const entry = manifest.triggers['poll' + name];
        const run = (body, config = {}, snapshot) =>
            require('../../' + entry.main).process.call(context, { body }, config, snapshot);

        it(name + ' emits the full object once per changed result and resource', async function () {
            assert.strictEqual(entry.title, name + ': Poll for Changes');
            const data = { [key]: 43, name: 'first', fields: [{ label: 'example' }], rights: ['read', 'update'], app_token: 'test-secret' };
            get.resolves(data);
            await run({ [key]: '43' });
            assert.deepStrictEqual(get.firstCall.args, ['/' + kind + '/43']);
            assert.strictEqual(context.emit.firstCall.args[1].body.name, 'first');
            assert.strictEqual(context.emit.firstCall.args[1].body.app_token, undefined);
            const snapshot = context.emit.lastCall.args[1];
            assert.deepStrictEqual(Object.keys(snapshot).sort(), [key, 'digest'].sort());
            context.emit.resetHistory();
            get.resolves({ fields: data.fields, name: 'first', rights: ['update', 'read'], [key]: 43 });
            await run({}, { [key]: 43 }, snapshot);
            assert.strictEqual(context.emit.withArgs('data').callCount, 0);
            get.resolves({ ...data, name: 'changed' });
            await run({ [key]: 43 }, {}, snapshot);
            assert.strictEqual(context.emit.withArgs('data').callCount, 1);
            await run({ [key]: 43 }, {}, { ...snapshot, [key]: 42 });
            assert.strictEqual(context.emit.withArgs('data').callCount, 2);
        });

        it(name + ' rejects bad IDs and a mismatched provider object', async function () {
            await run({ [key]: 'invalid' });
            assert.strictEqual(get.callCount, 0);
            get.resolves({ [key]: 44 });
            await run({ [key]: 43 });
            assert.strictEqual(context.emit.withArgs('error').callCount, 2);
            assert.strictEqual(context.emit.withArgs('data').callCount, 0);
        });
    }

    it('forwards a real event shape without making a challenge request or forwarding request headers', async function () {
        const event = { type: 'item.create', hook_id: '11', item_id: '12' };
        await require('../../lib/triggers/verifyHooks').process.call(context, { body: { ...event, _headers: { example: 'private' } } }, {});
        assert.strictEqual(post.callCount, 0);
        assert.deepStrictEqual(context.emit.firstCall.args[1].body, event);
        assert.deepStrictEqual(context.emit.lastCall.args, ['end']);
    });

    it('refuses an incomplete challenge before contacting the provider', async function () {
        await require('../../lib/triggers/verifyHooks').process.call(context, { body: { type: 'hook.verify', hook_id: 11 } }, {});
        assert.strictEqual(post.callCount, 0);
        assert.strictEqual(context.emit.withArgs('error').callCount, 1);
    });
});
