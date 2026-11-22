'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const manifest = require('../../component.json');

describe('Documented comment, task, search and membership inputs', function () {
    let sandbox, context, post, put;
    const run = (key, body, config = {}) =>
        require('../../' + manifest.actions[key].main).process.call(context, { body }, config);

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        post = sandbox.stub(Podio.prototype, 'post').resolves({});
        put = sandbox.stub(Podio.prototype, 'put').resolves({});
        context = { emit: sandbox.stub().resolves() };
    });
    afterEach(function () { sandbox.restore(); });

    it('adds a comment retaining file, embed and external references', async function () {
        const fields = { value: 'Comment', file_ids: [11], embed_url: 'https://example.test/', external_id: 'receipt' };
        await run('addComment', { type: 'item', id: 10, ...fields }, { silent: 'true' });
        assert.deepStrictEqual(post.firstCall.args, ['/comment/item/10?silent=1', fields]);
    });

    it('supports nested comment input and explicit updates that clear fields', async function () {
        await run('addComment', { type: 'item', id: 10, data: { value: 'Before' } });
        await run('updateComment', { comment_id: 12, data: { external_id: 'prior', file_ids: [11] }, value: '', file_ids: [] });
        assert.deepStrictEqual(post.firstCall.args, ['/comment/item/10', { value: 'Before' }]);
        assert.deepStrictEqual(put.firstCall.args, ['/comment/12', { external_id: 'prior', value: '', file_ids: [] }]);
    });

    it('creates both referenced and standalone tasks with explicit notification settings', async function () {
        await run('createTask', { text: 'Receipt', ref_type: 'item', ref_id: '11', private: true }, { hook: 'false', silent: 'true' });
        await run('createTask', { text: 'Standalone' });
        assert.deepStrictEqual(post.firstCall.args, ['/task/item/11/?hook=0&silent=1', { text: 'Receipt', private: true }]);
        assert.deepStrictEqual(post.secondCall.args, ['/task/?hook=1&silent=0', { text: 'Standalone' }]);
    });

    it('rejects incomplete task references before submitting anything', async function () {
        await run('createTask', { text: 'Receipt', ref_type: 'item' });
        await run('createTask', { text: 'Receipt', ref_id: 11 });
        assert.strictEqual(post.callCount, 0);
        assert.strictEqual(context.emit.withArgs('error').callCount, 2);
    });

    it('updates task recurrence and external ID with explicit flags', async function () {
        const body = { recurrence: null, external_id: 'new' };
        await run('updateTask', { task_id: 14, ...body }, { hook: false, silent: 'true' });
        assert.deepStrictEqual(put.firstCall.args, ['/task/14?hook=0&silent=1', body]);
    });

    it('keeps zero pagination bounds and false counts when searching', async function () {
        post.resolves([]);
        await run('searchApp', { app_id: 11, query: 'term', offset: 0, limit: 0, counts: false });
        assert.deepStrictEqual(post.firstCall.args, ['/search/app/11/', { app_id: 11, query: 'term', offset: 0, limit: 0, counts: false }]);
        assert.strictEqual(context.emit.firstCall.args[1].body._searchApp_no_match, true);
    });

    it('accepts documented and legacy workspace member mappings', async function () {
        await run('updateSpaceMembershipV2', { space_id: 11, user_id: 12, role: 'light' });
        await run('updateSpaceMembershipV2', { space_t_id: '11', user_t_id: '12', role_t: 'light' });
        assert.deepStrictEqual(put.firstCall.args, ['/space/11/member/12', { role: 'light' }]);
        assert.deepStrictEqual(put.secondCall.args, put.firstCall.args);
    });
});
