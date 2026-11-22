'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const manifest = require('../../component.json');
const execute = key => require('../../' + manifest.actions[key].main).process;
const input = key => require('../../' + manifest.actions[key].metadata.in).properties;

describe('Documented tag inputs and saved text mappings', function () {
    let s, get, post, put, del, context;
    beforeEach(function () {
        s = sinon.createSandbox();
        get = s.stub(Podio.prototype, 'get').resolves([]);
        post = s.stub(Podio.prototype, 'post').resolves({});
        put = s.stub(Podio.prototype, 'put').resolves({});
        del = s.stub(Podio.prototype, 'delete').resolves({});
        context = { emit: s.stub().resolves(), logger: { info() {} } };
    });
    afterEach(function () { s.restore(); });
    for (const key of ['createTags', 'updateTags']) {
        it(key + ' accepts tag strings containing commas and existing comma-separated text mappings', async function () {
            const request = key === 'createTags' ? post : put;
            assert.strictEqual(input(key).tags.type, 'array');
            await execute(key).call(context, { body: { ref_type: 'item', ref_id: 13, tags: ['One, Two', 'Three'] } }, {});
            assert.deepStrictEqual(request.firstCall.args, ['/tag/item/13', ['One, Two', 'Three']]);
            await execute(key).call(context, { body: { ref_type: 'item', ref_id: 13, text: 'Four, Five' } }, {});
            assert.deepStrictEqual(request.secondCall.args[1], ['Four', 'Five']);
        });
    }
    it('escapes the documented tag for the single-tag delete', async function () {
        await execute('removeTags').call(context, { body: { ref_type: 'item', ref_id: 13, tag: 'R&D' } }, {});
        assert.deepStrictEqual(del.firstCall.args, ['/tag/item/13?text=R%26D']);
    });
    for (const [key, ref] of [['getAppTagsSearch', 'app'], ['getOrgTagsSearch', 'org'], ['getSpaceTagsSearch', 'space']]) {
        it(key + ' carries the documented tag and existing text to the provider search', async function () {
            for (const name of ['tag', 'text']) {
                await execute(key).call(context, { body: { [ref + '_id']: 13, [name]: 'R&D' } }, {});
                assert.deepStrictEqual(get.lastCall.args, ['/tag/' + ref + '/13/search/', { text: 'R&D' }]);
            }
        });
    }
    it('checks the selected space before reading full matching items and preserves an existing app-only mapping', async function () {
        get.withArgs('/app/13').resolves({ space_id: 42 });
        await execute('getAppTagsFull').call(context, { body: { app_id: 13, space_id: 42, tag: 'Selected' } }, {});
        assert.deepStrictEqual(get.lastCall.args, ['/tag/app/13/search/full', { text: 'Selected', space_id: 42 }]);
        await execute('getAppTagsFull').call(context, { body: { app_id: 13, space_id: 41, tag: 'Selected' } }, {});
        assert.deepStrictEqual(get.lastCall.args, ['/app/13']);
        assert.strictEqual(context.emit.lastCall.args[0], 'error');
        await execute('getAppTagsFull').call(context, { body: { app_id: 13 } }, {});
        assert.deepStrictEqual(get.lastCall.args, ['/tag/app/13/search/full']);
    });
});
