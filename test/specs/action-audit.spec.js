'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const helper = require('../../helpers/itemHelper');
const clone = require('../../lib/actions/items/cloneItem').process;
const revision = require('../../lib/actions/items/getItemRevisionDifference').process;
const lookupCreate = require('../../lib/actions/items/createItemIdempotent').process;
const create = require('../../lib/actions/items/createItem').process;
const fieldValue = require('../../lib/actions/items/getItemFieldValueV2').process;

describe('Component audit action regressions (no network)', function () {
    let sandbox, get, post, output, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get').rejects(new Error('Unexpected GET'));
        post = sandbox.stub(Podio.prototype, 'post').rejects(new Error('Unexpected POST'));
        output = sandbox.stub(helper, 'emitData').resolves();
        context = { emit: sandbox.stub().resolves(), logger: { info() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    it('creates a clone with POST and waits for output delivery', async function () {
        post.resolves({ item_id: 456 });
        let release, finished = false;
        output.returns(new Promise(resolve => { release = resolve; }));
        const pending = clone.call(context, { body: { item_id: 123 } }, {}).then(() => { finished = true; });
        await new Promise(resolve => setImmediate(resolve));
        assert.strictEqual(finished, false);
        assert.deepStrictEqual(post.firstCall.args, ['/item/123/clone', {}]);
        assert.strictEqual(get.callCount, 0);
        release();
        await pending;
        assert.strictEqual(finished, true);
    });

    it('reports rejected output instead of completing silently', async function () {
        post.resolves({ item_id: 456 });
        const failure = new Error('Output rejected');
        output.rejects(failure);
        await clone.call(context, { body: { item_id: 123 } }, {});
        assert.deepStrictEqual(context.emit.firstCall.args, ['error', failure]);
    });

    it('refuses missing and invalid revisions before any request', async function () {
        for (const body of [undefined, {}, { item_id: 1, revision_from: 0 },
            { item_id: 1, revision_from: -1, revision_to: 2 },
            { item_id: 1, revision_from: 0, revision_to: '2' },
            { item_id: 0, revision_from: 0, revision_to: 2 }]) {
            await revision.call(context, { body }, {});
        }
        assert.strictEqual(context.emit.callCount, 6);
        assert.strictEqual(get.callCount, 0);
        assert.strictEqual(output.callCount, 0);
    });

    it('accepts revision zero and returns the API difference', async function () {
        const difference = [{ field_id: 42, from: [], to: [{ value: 'new' }] }];
        get.resolves(difference);
        await revision.call(context, { body: { item_id: 1, revision_from: 0, revision_to: 2 } }, {});
        assert.strictEqual(get.firstCall.args[0], '/item/1/revision/0/2');
        assert.strictEqual(output.firstCall.args[1], difference);
    });

    it('reuses an existing item without POST', async function () {
        get.resolves({ item_id: 99 });
        await lookupCreate.call(context, { body: { external_id: 'source/a' } }, { appId: 1 });
        assert.strictEqual(get.firstCall.args[0], '/item/app/1/external_id/source%2Fa');
        assert.strictEqual(post.callCount, 0);
        assert.strictEqual(output.firstCall.args[1]._idempotent_status, 'existing');
    });

    it('does not create after malformed or forbidden lookup responses', async function () {
        for (const response of [null, {}, { item_id: -1 }]) {
            get.resolves(response);
            await lookupCreate.call(context, { body: { external_id: 'x' } }, { appId: 1 });
        }
        get.rejects(Object.assign(new Error('Forbidden'), { statusCode: 403 }));
        await lookupCreate.call(context, { body: { external_id: 'x' } }, { appId: 1 });
        assert.strictEqual(post.callCount, 0);
        assert.strictEqual(output.callCount, 0);
        assert.strictEqual(context.emit.callCount, 4);
    });

    it('reports an uncertain create response without claiming success', async function () {
        get.rejects(Object.assign(new Error('Missing'), { statusCode: 404 }));
        post.resolves({});
        await lookupCreate.call(context, { body: { external_id: 'x' } }, { appId: 1 });
        assert.strictEqual(post.callCount, 1);
        assert.strictEqual(output.callCount, 0);
        assert.strictEqual(context.emit.firstCall.args[1].creation_outcome, 'unverified');
        assert.strictEqual(context.emit.firstCall.args[1].retry, false);
    });

    it('sends external_id only as item identity, preserving ordinary fields', async function () {
        sandbox.stub(helper, 'getSplittableFieldIds').resolves(new Set());
        post.resolves({ item_id: 99 });
        await create.call(context, { body: { external_id: 'source-7', title: 'Synthetic title' } }, { appId: 1 });
        assert.strictEqual(post.callCount, 1);
        const payload = post.firstCall.args[1];
        assert.strictEqual(payload.external_id, 'source-7');
        assert.strictEqual(Object.prototype.hasOwnProperty.call(payload.fields, 'external_id'), false);
        assert.ok(payload.fields.title);
    });

    it('encodes external field IDs as one URL segment', async function () {
        get.resolves([]);
        await fieldValue.call(context, { body: { item_id: 1, field_id: 'field/a?b' } }, {});
        assert.strictEqual(get.firstCall.args[0], '/item/1/value/field%2Fa%3Fb/v2');
    });

    it('exposes lookup-only hook inputs and required revisions', function () {
        const component = require('../../component.json');
        const hook = require('../../' + component.actions.getHooks.metadata.in);
        assert.strictEqual(hook.properties.url, undefined);
        assert.strictEqual(hook.properties.ref_id.required, true);
        const schema = require('../../lib/schemas/getItemRevisionDifference.in.json');
        assert.strictEqual(schema.properties.revision_from.required, true);
        assert.strictEqual(schema.properties.revision_to.required, true);
    });
});
