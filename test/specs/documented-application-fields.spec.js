'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const manifest = require('../../component.json');
const action = key => require('../../' + manifest.actions[key].main).process;

describe('Documented application, field, item and view inputs', function () {
    let sandbox, get, put, post, del, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get').resolves({});
        put = sandbox.stub(Podio.prototype, 'put').resolves({});
        post = sandbox.stub(Podio.prototype, 'post').resolves({});
        del = sandbox.stub(Podio.prototype, 'delete').resolves({});
        context = { emit: sandbox.stub().resolves(), logger: { info() {} } };
    });
    afterEach(function () { sandbox.restore(); });
    it('creates an app and field using the complete nested configuration', async function () {
        const config = { name: 'Receipt', item_name: 'Entry', icon_color: 'blue' };
        await action('createApp').call(context, { body: { space_id: 10, config, fields: [] } }, { silent: 'true' });
        assert.deepStrictEqual(post.firstCall.args, ['/app/?silent=1', { space_id: 10, config: { type: 'standard', ...config }, fields: [] }]);
        const field = { label: 'Due', settings: { time: 'enabled' }, required: false };
        await action('addAppField').call(context, { body: { app_id: 11, type: 'date', config: field } }, {});
        assert.deepStrictEqual(post.secondCall.args, ['/app/11/field/', { type: 'date', config: field }]);
    });
    it('updates only the requested application configuration with the provider v2 contract', async function () {
        await action('updateApp').call(context, { body: { app_id: '11', config: { description: '' }, silent: true } }, {});
        assert.deepStrictEqual(put.firstCall.args, ['/app/11/v2?silent=1', { config: { description: '' } }]);
    });
    it('retains prior sibling field settings, issues one update and re-reads the actual field', async function () {
        const original = { field_id: 12, config: { label: 'Field', delta: 3, settings: { time: 'enabled', end: 'disabled' } } };
        const changed = { field_id: 12, config: { label: 'Field', delta: 0, settings: { time: 'enabled', end: 'enabled' } } };
        get.onFirstCall().resolves(original);
        get.onSecondCall().resolves(changed);
        await action('updateAppField').call(context, { body: { app_id: 11, field_id: 12, config: { delta: 0, settings: { end: 'enabled' } } } }, {});
        assert.deepStrictEqual(put.firstCall.args, ['/app/11/field/12', changed.config]);
        assert.deepStrictEqual(context.emit.lastCall.args[1].body, changed);
    });
    it('resolves both documented numeric view IDs and prior app/name mappings', async function () {
        await action('getView').call(context, { body: { view_id: 12 } }, {});
        assert.deepStrictEqual(get.firstCall.args, ['/view/12']);
        await action('getView').call(context, { body: { app_id: 11, view_id_or_name: 'Stage' } }, {});
        assert.deepStrictEqual(get.secondCall.args, ['/view/app/11/Stage']);
    });
    it('retains each documented lookup slug, including a slug with special characters', async function () {
        await action('getAppByLabel').call(context, { body: { org_slug: 'org', space_slug: 'space', app_slug: 'a b' } }, {});
        assert.deepStrictEqual(get.firstCall.args, ['/app/org/org/space/space/a%20b']);
        await action('getAppSpaceByUrlLabel').call(context, { body: { space_id: 12, app_slug: 'a b' } }, {});
        assert.deepStrictEqual(get.secondCall.args, ['/app/space/12/a%20b']);
        await action('getFeatures').call(context, { body: { app_id: 13 } }, {});
        assert.deepStrictEqual(get.thirdCall.args, ['/app/features/', { app_ids: 13 }]);
    });
    it('passes explicit silent and hook flags to Podio on clone and deletion', async function () {
        await action('cloneItem').call(context, { body: { item_id: 42, silent: true } }, {});
        await action('deleteItem').call(context, { body: { item_id: 43, silent: 'true', hook: false } }, {});
        assert.deepStrictEqual(post.firstCall.args, ['/item/42/clone?silent=1', {}]);
        assert.deepStrictEqual(del.firstCall.args, ['/item/43?hook=0&silent=1']);
    });
});
