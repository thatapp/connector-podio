'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const picker = require('../../lib/actions/items/findReferencesItems');

describe('Referenceable item ordering and offsets', function () {
    let sandbox, get, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get');
        context = { emit: sandbox.stub().resolves() };
    });
    afterEach(function () { sandbox.restore(); });

    it('exposes the documented fields and sorts across provider pages before applying offsets', async function () {
        picker.getMetaModel({}, (err, model) => {
            assert.ifError(err);
            assert.strictEqual(model.in.properties.offset.type, 'number');
            assert.strictEqual(model.in.properties.sort.type, 'string');
        });
        const rows = Array.from({ length: 52 }, (_, i) => ({ item_id: i + 1, title: String(100 - i) }));
        get.callsFake(async (url, query) => {
            assert.strictEqual(url, '/item/field/23/find');
            assert.strictEqual(query.offset, undefined);
            assert.strictEqual(query.sort, undefined);
            const excluded = new Set(String(query.not_item_id || '').split(',').map(Number));
            return rows.filter(x => !excluded.has(x.item_id)).slice(0, query.limit);
        });
        await picker.process.call(context, { body: { field_id: 23, sort: '-item_id', offset: 1, limit: 2, not_item_id: 51 } }, {});
        assert.deepStrictEqual(context.emit.getCalls().map(c => c.args[1].body.item_id), [50,49]);
        assert.strictEqual(get.callCount, 2);
    });

    it('performs no request for a zero limit and stops on unsupported sort or a repeated page', async function () {
        const run = inputs => picker.process.call(context, { body: { field_id: 23, ...inputs } }, {});
        await run({ limit: 0 });
        await run({ sort: 'unknown' });
        assert.strictEqual(get.callCount, 0);
        get.resolves([{ item_id: 3 }]);
        await run({ not_item_id: 3 });
        assert.strictEqual(context.emit.withArgs('error').callCount, 2);
        assert.strictEqual(context.emit.withArgs('data').callCount, 0);
    });
});
