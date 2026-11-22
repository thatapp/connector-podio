'use strict';

const assert = require('node:assert/strict');
const nock = require('nock').default;
const sinon = require('sinon');
const Podio = require('../../podio');
const download = require('../../lib/actions/files/getActualFile').process;

describe('File Download with the selected Podio connection', function () {
    const bytes = Buffer.from([0, 255, 13, 10]);
    const metadata = { file_id: 7, hosted_by: 'podio', name: 'receipt.bin', size: 4, mimetype: 'application/octet-stream' };
    const cfg = { oauth: { access_token: 'synthetic-file-grant' } };
    const context = () => ({ emit: sinon.stub(), logger: { info: sinon.stub() } });

    afterEach(function () { sinon.restore(); nock.cleanAll(); });

    it('uses the numeric provider file route and puts the verified bytes in scoped attachment storage', async function () {
        const remote = nock('https://api.podio.com').get('/file/7').reply(200, metadata)
            .get('/file/7/raw').reply(200, bytes, { 'content-type': 'application/octet-stream' });
        const ctx = context();
        ctx.attachments = { write: sinon.stub().resolves({ url: 'https://attachments.example.test/qa' }) };
        await download.call(ctx, { body: { file_id: '7', raw_data: true } }, cfg);
        assert.equal(remote.isDone(), true);
        assert.deepEqual(ctx.attachments.write.firstCall.args[0], { filename: metadata.name, contentType: metadata.mimetype, data: bytes });
        assert.deepEqual(ctx.emit.firstCall.args[1].body, { status: true, file_name: 'receipt.bin',
            download_url: 'https://attachments.example.test/qa', base64: bytes.toString('base64') });
    });

    it('returns the authenticated provider URL without fetching raw bytes when a host has no attachment store', async function () {
        const get = sinon.stub(Podio.prototype, 'get').resolves(metadata);
        const ctx = context();
        await download.call(ctx, { body: { file_id: 7 } }, {});
        assert.equal(get.callCount, 1);
        assert.deepEqual(ctx.emit.firstCall.args[1].body, { status: true, file_name: 'receipt.bin', download_url: 'https://api.podio.com/file/7/raw' });
    });

    it('does not emit a successful download for the wrong file, an external attachment or mismatching bytes', async function () {
        const get = sinon.stub(Podio.prototype, 'get');
        for (const meta of [{ ...metadata, file_id: 9 }, { ...metadata, hosted_by: 'external' }, { ...metadata, size: 8 }]) {
            get.reset();
            get.onFirstCall().resolves(meta);
            get.onSecondCall().resolves(bytes.toString('base64'));
            const ctx = context();
            await assert.rejects(download.call(ctx, { body: { file_id: 7, raw_data: true } }, {}));
            assert.equal(ctx.emit.called, false);
        }
    });
});

