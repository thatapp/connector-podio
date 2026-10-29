'use strict';

// The docs page is the contract (GO 11 Addendum 14 §6.3, audit gap 22): Execute Hooks is on unless the
// step turns it off, and the tag reads by organisation and by space ask for org_id and space_id.

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const helper = require('../../helpers/itemHelper');
const create = require('../../lib/actions/items/createItem').process;
const update = require('../../lib/actions/items/updateItem').process;

describe('Docs contract: Execute Hooks defaults to on (no network)', function () {
    let sandbox, post, put, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        sandbox.stub(Podio.prototype, 'get').resolves({ fields: [] });
        post = sandbox.stub(Podio.prototype, 'post').resolves({ item_id: 5 });
        put = sandbox.stub(Podio.prototype, 'put').resolves({ revision: 2 });
        sandbox.stub(helper, 'getSplittableFieldIds').resolves([]);
        sandbox.stub(helper, 'emitData').resolves();
        context = { emit: sandbox.stub().resolves(), logger: { info() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    const hookOf = (url) => (String(url).match(/[?&]hook=(\d)/) || [])[1];

    for (const [label, cfg, want] of [
        ['hook not set', { appId: 1 }, '1'],
        ['hook true', { appId: 1, hook: true }, '1'],
        ['hook false', { appId: 1, hook: false }, '0'],
        ['hook "false"', { appId: 1, hook: 'false' }, '0'],
    ]) {
        it(`Item: Create sends hook=${want} when ${label}`, async function () {
            await create.call(context, { body: { title: 'x' } }, cfg);
            assert.strictEqual(post.callCount, 1, 'one POST');
            assert.strictEqual(hookOf(post.firstCall.args[0]), want);
        });
        it(`Item: Update sends hook=${want} when ${label}`, async function () {
            await update.call(context, { body: { item_id: 9, title: 'x' } }, cfg);
            assert.strictEqual(put.callCount, 1, 'one PUT');
            assert.strictEqual(hookOf(put.firstCall.args[0]), want);
        });
    }
});

describe('Docs contract: tag reads by organisation and space ask for their own id', function () {
    const component = require('../../component.json');
    const schemaOf = (key) => require('../../' + component.actions[key].metadata.in);
    for (const [key, id] of [['getOrgTags', 'org_id'], ['getOrgTagsSearch', 'org_id'], ['getSpaceTags', 'space_id'], ['getSpaceTagsSearch', 'space_id']]) {
        it(`${component.actions[key].title} asks for ${id} (required) and not app_id`, function () {
            const props = schemaOf(key).properties;
            assert.ok(props[id], `${id} is in the form`);
            assert.strictEqual(props[id].required, true);
            assert.strictEqual(props.app_id, undefined, 'app_id is not in the form');
        });
    }
});
