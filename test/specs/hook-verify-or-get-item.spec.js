'use strict';

// GitLab #497 (owner 2026-11-16): one webhook step that does the verify / pass-through
// conditional every Podio flow did in two or more steps. A hook validation is answered and ends
// with no data; any other delivery that names an item reads the item and emits it, as Item: Get
// does; a delete, or a delivery that names no item, is passed through unchanged. No network:
// the Podio client is stubbed at its own get/post methods.

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const component = require('../../component.json');

const KEY = 'hookVerifyOrGetItem';
const trigger = () => require('../../' + component.triggers[KEY].main.replace(/^\.\//, '')).process;
const ITEM = { item_id: 2468013579, app: { app_id: 30001 }, title: 'Example', fields: [] };

describe('Hook: Verify or Get Item (GitLab #497; no network)', function () {
    let sandbox, get, post, context;
    const emitted = (kind) => context.emit.getCalls().filter((c) => c.args[0] === kind).map((c) => c.args[1]);
    const run = (body, cfg = { oauth: { access_token: 't' } }) => trigger().call(context, { body, headers: {} }, cfg);

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get').resolves(ITEM);
        post = sandbox.stub(Podio.prototype, 'post').resolves({});
        context = { emit: sandbox.stub().resolves(), logger: { info() {}, warn() {}, error() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    describe('the descriptor', function () {
        it('declares the trigger as a webhook receiver (no polling type) with its own input schema', function () {
            const t = component.triggers[KEY];
            assert.ok(t, 'component.json declares ' + KEY);
            assert.strictEqual(t.title, 'Hook: Verify or Get Item');
            assert.strictEqual(t.type, undefined, 'a webhook receiver, like verifyHook, has no polling type');
            const schema = require('../../' + t.metadata.in.replace(/^\.\//, ''));
            assert.deepStrictEqual(Object.keys(schema.properties).sort(), ['code', 'hook_id', 'item_id', 'type']);
            assert.ok(Object.values(schema.properties).every((p) => p.required === false), 'every field depends on the delivery');
        });

        it('CONTROL: the existing Hook: Webhook Receiver is unchanged', function () {
            assert.strictEqual(component.triggers.verifyHook.main, './lib/triggers/verifyHooks.js');
            assert.strictEqual(component.triggers.verifyHook.title, 'Hook: Webhook Receiver');
        });
    });

    describe('a hook validation (hook.verify with a code)', function () {
        it('answers it with one validate call and ends with no data and no item read', async function () {
            await run({ type: 'hook.verify', hook_id: '1234567', code: 'a1b2c3d4', _query: {}, _method: 'POST' });
            assert.deepStrictEqual(post.getCalls().map((c) => c.args), [['/hook/1234567/verify/validate', { code: 'a1b2c3d4' }]]);
            assert.strictEqual(get.callCount, 0);
            assert.strictEqual(emitted('data').length, 0);
            assert.strictEqual(emitted('error').length, 0);
            assert.strictEqual(emitted('end').length, 1);
        });

        it('uses the step\'s own Podio sign-in', async function () {
            const cfg = { oauth: { access_token: 'step-token' } };
            const seen = [];
            post.callsFake(function () { seen.push(this.cfg); return Promise.resolve({}); });
            await run({ type: 'hook.verify', hook_id: 99, code: 'zz' }, cfg);
            assert.deepStrictEqual(seen, [cfg]);
        });

        it('refuses a validation without a code, never calling Podio', async function () {
            await run({ type: 'hook.verify', hook_id: '1234567' });
            assert.strictEqual(post.callCount + get.callCount, 0);
            assert.strictEqual(emitted('error').length, 1);
            assert.strictEqual(emitted('data').length, 0);
        });
    });

    describe('any other delivery: pass through and get the item', function () {
        ['item.create', 'item.update', 'comment.create'].forEach(function (type) {
            it(type + ': reads GET /item/{item_id} once and emits the item, then ends', async function () {
                await run({ type, hook_id: '1234567', item_id: '2468013579', item_revision_id: '3', _query: {} });
                assert.strictEqual(post.callCount, 0, 'no validate call on an ordinary delivery');
                assert.deepStrictEqual(get.getCalls().map((c) => c.args), [['/item/2468013579']]);
                const data = emitted('data');
                assert.strictEqual(data.length, 1);
                assert.deepStrictEqual(data[0].body, ITEM, 'the same body Item: Get emits');
                assert.strictEqual(emitted('error').length, 0);
                assert.strictEqual(emitted('end').length, 1);
            });
        });

        it('accepts an item_id sent as a number', async function () {
            await run({ type: 'item.update', item_id: 2468013579 });
            assert.deepStrictEqual(get.firstCall.args, ['/item/2468013579']);
        });

        it('emits the same output as Item: Get for the same item (the two steps it replaces end the same way)', async function () {
            await run({ type: 'item.update', item_id: '2468013579' });
            const mine = emitted('data').map((m) => m.body);
            context.emit.resetHistory();
            await require('../../lib/actions/items/getItem').process.call(context, { body: { item_id: '2468013579' } }, { oauth: { access_token: 't' } });
            assert.deepStrictEqual(mine, emitted('data').map((m) => m.body));
        });

        it('reports a Podio failure through the error channel and emits no data', async function () {
            get.rejects(Object.assign(new Error('Podio said 404'), { statusCode: 404 }));
            await run({ type: 'item.update', item_id: '2468013579' });
            assert.strictEqual(emitted('data').length, 0);
            assert.strictEqual(emitted('error').length, 1);
            assert.strictEqual(emitted('error')[0].message, 'Podio said 404');
        });

        it('refuses an item_id that is not a whole number before any request (it is placed in a URL path)', async function () {
            await run({ type: 'item.update', item_id: '12/../../org' });
            assert.strictEqual(get.callCount + post.callCount, 0);
            assert.strictEqual(emitted('error').length, 1);
        });
    });

    describe('nothing to read', function () {
        it('item.delete: passes the delivery through and reads nothing (the item is gone at Podio)', async function () {
            const body = { type: 'item.delete', hook_id: '1234567', item_id: '2468013579' };
            await run(body);
            assert.strictEqual(get.callCount + post.callCount, 0);
            assert.deepStrictEqual(emitted('data').map((m) => m.body), [body]);
            assert.strictEqual(emitted('end').length, 1);
        });

        it('a delivery that names no item: passed through unchanged', async function () {
            const body = { type: 'app.update', hook_id: '1234567', app_id: '30001' };
            await run(body);
            assert.strictEqual(get.callCount + post.callCount, 0);
            assert.deepStrictEqual(emitted('data').map((m) => m.body), [body]);
        });
    });
});
