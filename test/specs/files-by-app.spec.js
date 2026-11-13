'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const helper = require('../../helpers/itemHelper');
const getFilesbyApp = require('../../lib/actions/files/getFilesbyApp').process;

describe('getFilesbyApp sends the file type under the key Podio accepts (found by the live certification run, 2026-11-13)', function () {
    let sandbox, get, context;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get').resolves([]);
        sandbox.stub(helper, 'emitData').resolves();
        context = { emit: sandbox.stub().resolves(), logger: { info() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    it('the declared field file_type reaches Podio as filetype (Podio answers 400 "Invalid filter key file_type")', async function () {
        await getFilesbyApp.call(context, { body: { app_id: 19199367, limit: 5, file_type: 'image' } }, {});
        const query = get.firstCall.args[1];
        assert.strictEqual(get.firstCall.args[0], '/file/app/19199367');
        assert.strictEqual(query.filetype, 'image');
        assert.strictEqual('file_type' in query, false);
    });

    it('the same holds on the unlimited, paged path', async function () {
        await getFilesbyApp.call(context, { body: { app_id: 19199367, file_type: 'video' } }, {});
        const query = get.firstCall.args[1];
        assert.strictEqual(query.filetype, 'video');
        assert.strictEqual('file_type' in query, false);
    });
});
