'use strict';

// GitLab #476 (owner directive 2026-11-12): every read (GET) operation of the Podio component
// must answer a Podio hook validation itself. Podio verifies a hook by POSTing
// type=hook.verify, hook_id and code to the hook's URL; the first step of a flow behind that
// address receives them as its message body. The step calls POST /hook/{hook_id}/verify/validate
// with {code}, using its own Podio sign-in, and ends WITHOUT emitting data. A normal delivery
// is processed exactly as before.
//
// The operations covered are derived from component.json, not hand-listed: every action whose
// key starts get / search / filter / find, and every trigger except verifyHook (the dedicated
// receiver, which already answers the validation). A new read operation added later without
// the guard fails the "every read operation" cases here.
//
// Seeded red: this file was run against a54ad83 (before the helper existed) and the
// validation cases failed there; see the commit message for the transcript.

const assert = require('assert');
const path = require('path');
const sinon = require('sinon');
const Podio = require('../../podio');
const component = require('../../component.json');

const READ_ACTION = /^(get|search|filter|find)/;
const operations = [
    ...Object.entries(component.actions).filter(([key]) => READ_ACTION.test(key)).map(([key, def]) => ({ kind: 'action', key, main: def.main })),
    ...Object.entries(component.triggers).filter(([key]) => key !== 'verifyHook').map(([key, def]) => ({ kind: 'trigger', key, main: def.main }))
];

const load = (main) => require(path.join(__dirname, '..', '..', main)).process;
const VALIDATION = { type: 'hook.verify', hook_id: '1234567', code: 'a1b2c3d4' };

describe('Hook validation on every read operation (GitLab #476; no network)', function () {
    let sandbox, get, post, context;
    const emitted = (kind) => context.emit.getCalls().filter((c) => c.args[0] === kind).map((c) => c.args[1]);

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get').rejects(new Error('Unexpected GET'));
        post = sandbox.stub(Podio.prototype, 'post').resolves({});
        context = { emit: sandbox.stub().resolves(), logger: { info() {}, warn() {}, error() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    it('covers the read operations the component declares (control: the list is not empty)', function () {
        assert.ok(operations.filter((o) => o.kind === 'action').length >= 50, 'read actions found: ' + operations.length);
        assert.deepStrictEqual(operations.filter((o) => o.kind === 'trigger').map((o) => o.key).sort(),
            ['getApplications', 'getItems', 'getOrganisations', 'getSpaces']);
    });

    describe('a hook validation message', function () {
        operations.forEach(function (op) {
            it(op.kind + ' ' + op.key + ': one validate call with the hook id and code, no data, no read', async function () {
                await load(op.main).call(context, { body: { ...VALIDATION } }, { oauth: { access_token: 't' } });
                assert.strictEqual(post.callCount, 1, 'validate calls');
                assert.deepStrictEqual(post.firstCall.args, ['/hook/1234567/verify/validate', { code: 'a1b2c3d4' }]);
                assert.strictEqual(get.callCount, 0, 'no GET after a validation');
                assert.strictEqual(emitted('data').length, 0, 'no data emitted');
                assert.strictEqual(emitted('error').length, 0, 'no error emitted');
            });
        });

        it('carries the delivery fields the engine adds to the body (query, headers, method) without trouble', async function () {
            const body = { ...VALIDATION, _query: {}, _headers: { 'content-type': 'application/x-www-form-urlencoded' }, _method: 'POST', _url: 'https://in.thatapp.io/hook/flw_x', _additionalUrlPath: '' };
            await load('./lib/actions/items/getItem.js').call(context, { body, headers: {} }, {});
            assert.deepStrictEqual(post.firstCall.args, ['/hook/1234567/verify/validate', { code: 'a1b2c3d4' }]);
            assert.strictEqual(emitted('data').length, 0);
        });

        it('uses the step\'s own Podio sign-in: the Podio client is built with the step configuration', async function () {
            const cfg = { oauth: { access_token: 'step-token' } };
            const seen = [];
            sandbox.restore();
            sandbox = sinon.createSandbox();
            sandbox.stub(Podio.prototype, 'post').callsFake(function () { seen.push(this.cfg); return Promise.resolve({}); });
            context = { emit: sandbox.stub().resolves(), logger: { info() {}, warn() {}, error() {} } };
            await load('./lib/triggers/getSpaces.js').call(context, { body: { ...VALIDATION } }, cfg);
            assert.strictEqual(seen.length, 1);
            assert.strictEqual(seen[0], cfg);
        });

        it('a rejected validation is reported through the error channel, with no data', async function () {
            post.rejects(Object.assign(new Error('Podio refused the code'), { statusCode: 400 }));
            await load('./lib/actions/tasks/getTask.js').call(context, { body: { ...VALIDATION } }, {});
            assert.strictEqual(emitted('error').length, 1);
            assert.strictEqual(emitted('data').length, 0);
            assert.strictEqual(get.callCount, 0);
        });

        ['code', 'hook_id'].forEach(function (missing) {
            operations.forEach(function (op) {
                it(op.kind + ' ' + op.key + ': a validation with no ' + missing + ' never calls Podio and emits no data', async function () {
                    const body = { ...VALIDATION };
                    delete body[missing];
                    await load(op.main).call(context, { body }, {});
                    assert.strictEqual(post.callCount, 0, 'no POST');
                    assert.strictEqual(get.callCount, 0, 'no GET');
                    assert.strictEqual(emitted('data').length, 0);
                });
            });
        });

        it('a hook_id that is not a whole number is refused before any request (it is placed in a URL path)', async function () {
            await load('./lib/actions/items/getItem.js').call(context, { body: { ...VALIDATION, hook_id: '1/../../user' } }, {});
            assert.strictEqual(post.callCount, 0);
            assert.strictEqual(emitted('error').length, 1);
            assert.strictEqual(emitted('data').length, 0);
        });
    });

    describe('a normal delivery is unchanged', function () {
        operations.forEach(function (op) {
            it(op.kind + ' ' + op.key + ': a message that is not a validation never calls the validate endpoint', async function () {
                try { await load(op.main).call(context, { body: { type: 'item.create', hook_id: 1234567, item_id: 99, item_revision_id: 3 } }, {}); } catch (_) { /* the operation's own input rules */ }
                assert.strictEqual(post.getCalls().filter((c) => /verify\/validate/.test(String(c.args[0]))).length, 0);
            });
        });

        it('getItem still reads the item and emits it', async function () {
            get.resolves({ item_id: 99, title: 'T', fields: [] });
            await load('./lib/actions/items/getItem.js').call(context, { body: { item_id: 99 } }, {});
            assert.deepStrictEqual(get.firstCall.args, ['/item/99']);
            assert.strictEqual(emitted('data').length, 1);
            assert.strictEqual(post.callCount, 0);
        });

        it('getOrganisations still polls GET /org/ and emits the map', async function () {
            get.resolves([{ org_id: 1, name: 'Alpha' }]);
            await load('./lib/triggers/getOrganisations.js').call(context, { body: {} }, {});
            assert.deepStrictEqual(get.firstCall.args, ['/org/']);
            assert.deepStrictEqual(emitted('data')[0].body, { 1: 'Alpha' });
            assert.strictEqual(post.callCount, 0);
        });

        it('a message with no body at all is not mistaken for a validation', async function () {
            get.resolves([{ org_id: 1, name: 'Alpha' }]);
            await load('./lib/triggers/getOrganisations.js').call(context, {}, {});
            assert.strictEqual(post.callCount, 0);
            assert.strictEqual(emitted('data').length, 1);
        });
    });

    describe('the dedicated receiver keeps its own behaviour', function () {
        it('verifyHook is not wrapped: it is the receiver, and is listed so a change to that is deliberate', function () {
            assert.ok(component.triggers.verifyHook, 'verifyHook still declared');
        });
    });

    describe('the shared helper', function () {
        it('is ONE module that every read operation uses', function () {
            const fs = require('fs');
            const helperFile = path.join(__dirname, '..', '..', 'helpers', 'hookVerify.js');
            assert.ok(fs.existsSync(helperFile), 'helpers/hookVerify.js exists');
            const offenders = operations.filter((op) => !/helpers\/hookVerify/.test(fs.readFileSync(path.join(__dirname, '..', '..', op.main), 'utf8'))).map((o) => o.key);
            assert.deepStrictEqual(offenders, []);
        });
    });
});
