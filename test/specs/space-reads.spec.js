'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const helper = require('../../helpers/itemHelper');
const getSpaces = require('../../lib/triggers/getSpaces').process;
const getAppBySpace = require('../../lib/actions/spaces/getAppBySpace').process;

describe('Space reads call the paths Podio has (found by the live certification run, 2026-11-12)', function () {
    let sandbox, get, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get').resolves([]);
        sandbox.stub(helper, 'emitData').resolves();
        context = { emit: sandbox.stub().resolves(), logger: { info() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    it('getSpaces lists an organisation\'s spaces at /org/{id}/space (/space/top/{id} does not exist)', async function () {
        await getSpaces.call(context, { body: { org_id: 10685 } }, {});
        assert.strictEqual(get.firstCall.args[0], '/org/10685/space');
    });

    it('getAppBySpace reads the space from its declared field spaceId', async function () {
        await getAppBySpace.call(context, { body: {} }, { spaceId: '2977909' });
        assert.strictEqual(get.firstCall.args[0], '/app/space/2977909');
    });
});
