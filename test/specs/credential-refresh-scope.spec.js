'use strict';

const assert = require('assert');
const nock = require('nock').default;
const sinon = require('sinon');
const Podio = require('../../podio');
const oauth = require('../../helpers/oauth-utils');

describe('Podio refresh bookkeeping', function () {
    let sandbox, refresh;
    beforeEach(function () {
        sandbox = sinon.createSandbox();
        refresh = sandbox.stub(oauth, 'refreshAppToken');
        nock.disableNetConnect();
    });
    afterEach(function () {
        sandbox.restore();
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('coalesces reads for each connection and retains each step configuration', async function () {
        const endpoint = nock('https://api.podio.com');
        const configs = [
            { _account: 'first', step: 1, oauth: { access_token: 'old-a', refresh_token: 'fixture-a' } },
            { _account: 'first', step: 2, oauth: { access_token: 'old-a', refresh_token: 'fixture-a' } },
            { _account: 'second', step: 3, oauth: { access_token: 'old-b', refresh_token: 'fixture-b' } }
        ];
        const callbacks = [];
        refresh.callsFake((provider, cfg, callback) => {
            callbacks.push(() => callback({ ...cfg, oauth: { ...cfg.oauth, access_token: 'renewed-' + cfg._account } }));
            if (callbacks.length === 2) setImmediate(() => callbacks.forEach(done => done()));
        });
        const clients = configs.map(cfg => new Podio(cfg, { emit: sandbox.stub(), logger: { warn() {} } }));
        for (const cfg of configs) {
            const path = '/item/' + cfg.step;
            endpoint.get(path).reply(401, {});
            endpoint.get(path).matchHeader('authorization', 'OAuth2 renewed-' + cfg._account).reply(200, { item_id: cfg.step });
        }
        const results = await Promise.all(clients.map((client, i) => client.get('/item/' + (i + 1))));
        assert.deepStrictEqual(results.map(r => r.item_id), [1, 2, 3]);
        assert.deepStrictEqual(clients.map(c => c.cfg.step), [1, 2, 3]);
        assert.strictEqual(refresh.callCount, 2);
        assert.strictEqual(clients.reduce((n,c) => n + c.context.emit.withArgs('updateKeys').callCount, 0), 2);
        assert.ok(endpoint.isDone());
    });

    it('settles adapter errors and permits the next request to refresh', async function () {
        const client = new Podio({ oauth: { access_token: 'fixture', refresh_token: 'fixture' } }, { emit() {} });
        const endpoint = nock('https://api.podio.com');
        endpoint.get('/item/7').twice().reply(401, {});
        endpoint.get('/item/7').reply(200, { item_id: 7 });
        refresh.onFirstCall().rejects(new Error('adapter unavailable'));
        refresh.onSecondCall().callsFake((provider, cfg, callback) => callback({ ...cfg, oauth: { access_token: 'reconnected' } }));
        await assert.rejects(client.get('/item/7'), /adapter unavailable/);
        assert.strictEqual((await client.get('/item/7')).item_id, 7);
        assert.strictEqual(refresh.callCount, 2);
    });
});
