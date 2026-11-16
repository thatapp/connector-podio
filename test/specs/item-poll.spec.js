'use strict';

// Item: Poll for Changes (getItems). docs.thatapp.io/components/podio/#item-poll-for-changes:
// "Polls Podio for new or updated items in an application", input item_id, "Returns item data when
// changes are detected."
//
// Before this fix the trigger read msg.body.item_id only. A poll is a flow's first step and is handed
// an empty body, so every poll called GET /item/undefined (live, 2026-11-15). Seeded red: this file
// was run against the pre-fix trigger first.

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const component = require('../../component.json');
const getItems = require('../../lib/triggers/getItems').process;

const items = [
    { item_id: 3, app_item_id: 3, title: 'c', last_event_on: '2026-11-15 10:00:00' },
    { item_id: 2, app_item_id: 2, title: 'b', last_event_on: '2026-11-14 10:00:00' },
    { item_id: 1, app_item_id: 1, title: 'a', last_event_on: '2026-11-13 10:00:00' },
];

describe('Item: Poll for Changes polls the configured app (a poll has no incoming item)', function () {
    let sandbox, get, post, context, emitted;
    const data = () => emitted.filter((e) => e[0] === 'data').map((e) => e[1].body);
    const snap = () => { const s = emitted.filter((e) => e[0] === 'snapshot'); return s.length ? s[s.length - 1][1] : undefined; };
    const errors = () => emitted.filter((e) => e[0] === 'error').map((e) => e[1]);
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        emitted = [];
        get = sandbox.stub(Podio.prototype, 'get').resolves(items[0]);
        post = sandbox.stub(Podio.prototype, 'post').resolves({ items, total: 3, filtered: 3 });
        context = { emit: async (...a) => { emitted.push(a); }, logger: { info() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    it('a poll with an empty body and the app configured never calls /item/undefined', async function () {
        await getItems.call(context, { body: {} }, { app_id: '30880168' }, {});
        const paths = [...get.args, ...post.args].map((a) => a[0]);
        assert.ok(!paths.some((p) => /undefined/.test(p)), JSON.stringify(paths));
        assert.deepStrictEqual(errors(), []);
    });

    it('the first poll of an app reads its items, newest edit first, and emits each one', async function () {
        await getItems.call(context, { body: {} }, { app_id: '30880168' }, {});
        assert.strictEqual(post.callCount, 1);
        assert.match(post.firstCall.args[0], /^\/item\/app\/30880168\/filter\//);
        assert.strictEqual(post.firstCall.args[1].sort_by, 'last_edit_on');
        assert.strictEqual(post.firstCall.args[1].sort_desc, true);
        assert.deepStrictEqual(data().map((b) => b.item_id), [3, 2, 1]);
        assert.deepStrictEqual(snap(), { app_id: '30880168', last_event_on: '2026-11-15 10:00:00' });
    });

    it('a later poll emits only the items changed since the snapshot', async function () {
        await getItems.call(context, { body: {} }, { app_id: '30880168' }, { app_id: '30880168', last_event_on: '2026-11-14 10:00:00' });
        assert.deepStrictEqual(data().map((b) => b.item_id), [3]);
        assert.strictEqual(snap().last_event_on, '2026-11-15 10:00:00');
    });

    it('a poll with no change emits no item and keeps the snapshot', async function () {
        await getItems.call(context, { body: {} }, { app_id: '30880168' }, { app_id: '30880168', last_event_on: '2026-11-15 10:00:00' });
        assert.deepStrictEqual(data(), []);
        assert.strictEqual(snap().last_event_on, '2026-11-15 10:00:00');
    });

    it('a snapshot of another app is not applied to this one', async function () {
        await getItems.call(context, { body: {} }, { app_id: '30880168' }, { app_id: '1', last_event_on: '2099-01-01 00:00:00' });
        assert.strictEqual(data().length, 3);
    });

    it('the documented item_id still polls that one item (from the configuration or the message)', async function () {
        await getItems.call(context, { body: {} }, { item_id: '3' }, {});
        assert.strictEqual(get.firstCall.args[0], '/item/3');
        assert.deepStrictEqual(data().map((b) => b.item_id), [3]);
        const after = snap();
        assert.deepStrictEqual(after, { item_id: '3', last_event_on: '2026-11-15 10:00:00' });
        emitted = [];
        await getItems.call(context, { body: {} }, { item_id: '3' }, after);
        assert.deepStrictEqual(data(), [], 'an unchanged item is not emitted again');
        emitted = [];
        await getItems.call(context, { body: { item_id: 3 } }, {}, {});
        assert.strictEqual(get.lastCall.args[0], '/item/3');
    });

    it('with neither app nor item, or a bad id, it errors before any request', async function () {
        await getItems.call(context, { body: {} }, {}, {});
        await getItems.call(context, { body: {} }, { app_id: 'abc' }, {});
        await getItems.call(context, { body: {} }, { item_id: '1/../2' }, {});
        assert.strictEqual(get.callCount + post.callCount, 0);
        assert.strictEqual(errors().length, 3);
    });

    it('the trigger declares its own input: item_id as documented, and app_id', function () {
        const ref = component.triggers.getItems.metadata.in;
        assert.notStrictEqual(ref, './lib/schemas/getItem.in.json', 'shares the Get Item action schema, whose item_id is required');
        const props = require('../../' + ref.replace(/^\.\//, '')).properties;
        assert.ok(props.item_id && props.app_id);
    });
});
