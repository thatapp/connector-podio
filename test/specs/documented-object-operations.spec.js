'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const { actions } = require('../../component.json');
const run = (key, context, id, objectType) => require('../../' + actions[key].main).process.call(context, { body: { id } }, { objectType });

describe('Documented Podio object selection', function () {
    let sandbox, get, remove, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get').resolves({ item_id: 31 });
        remove = sandbox.stub(Podio.prototype, 'delete').resolves();
        context = { emit: sandbox.stub().resolves() };
    });
    afterEach(function () { sandbox.restore(); });

    it('reads one declared type and retains the provider response', async function () {
        await run('lookupObjectById', context, '31', 'item');
        assert.deepStrictEqual(get.firstCall.args, ['/item/31']);
        assert.deepStrictEqual(context.emit.firstCall.args[1].body, { item_id: 31 });
    });

    it('emits the deleted ID only after the provider confirms success', async function () {
        await run('deleteObjectById', context, '31', 'comment');
        assert.deepStrictEqual(remove.firstCall.args, ['/comment/31']);
        assert.deepStrictEqual(context.emit.firstCall.args[1].body, { id: 31 });
        remove.rejects(new Error('provider refused'));
        await run('deleteObjectById', context, '31', 'comment');
        assert.strictEqual(context.emit.withArgs('data').callCount, 1);
        assert.strictEqual(context.emit.withArgs('error').callCount, 1);
    });

    it('refuses unsupported types and invalid IDs before any provider request', async function () {
        await run('deleteObjectById', context, 31, 'unknown');
        await run('lookupObjectById', context, '', 'app');
        assert.strictEqual(get.callCount + remove.callCount, 0);
        assert.strictEqual(context.emit.withArgs('error').callCount, 2);
    });
});
