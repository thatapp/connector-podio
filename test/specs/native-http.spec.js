'use strict';

const assert = require('assert');
const nock = require('nock').default;
const Podio = require('../../podio');

describe('Native HTTP dependency compatibility (no network)', function () {
    before(function () { nock.disableNetConnect(); });
    afterEach(function () {
        const pending = nock.pendingMocks();
        nock.cleanAll();
        assert.deepStrictEqual(pending, [], 'every exact mocked request was consumed');
    });
    after(function () {
        nock.enableNetConnect();
        nock.restore();
    });

    const client = () => new Podio({ oauth: { access_token: 'owned-native-test-marker' } });

    it('keeps query parameters and OAuth headers on JSON reads', async function () {
        nock('https://api.podio.com', { reqheaders: { Authorization: 'OAuth2 owned-native-test-marker' } })
            .get('/item/123').query({ fields: 'title' }).reply(200, { item_id: 123, title: 'owned' });
        assert.deepStrictEqual(await client().get('/item/123', { fields: 'title' }), { item_id: 123, title: 'owned' });
    });

    it('preserves JSON bodies on writes', async function () {
        const body = { fields: { title: 'owned test value' } };
        nock('https://api.podio.com').post('/item/42', body).reply(200, { item_id: 123 });
        assert.strictEqual((await client().post('/item/42', body)).item_id, 123);
    });

    it('preserves multipart file content without a filesystem or provider call', async function () {
        nock('https://api.podio.com')
            .post('/file/', body => String(body).includes('owned-file-content') && String(body).includes('qa.txt'))
            .matchHeader('content-type', /multipart\/form-data; boundary=/)
            .reply(200, { file_id: 123 });
        const form = { source: { value: Buffer.from('owned-file-content'), options: { filename: 'qa.txt', contentType: 'text/plain' } } };
        assert.strictEqual((await client().post('/file/', null, form)).file_id, 123);
    });

    it('preserves provider error classification after the dependency update', async function () {
        nock('https://api.podio.com').get('/item/123').reply(503, { error: 'temporary_error' });
        await assert.rejects(client().get('/item/123'), error => error.statusCode === 503 && error.retry === true);
    });
});
