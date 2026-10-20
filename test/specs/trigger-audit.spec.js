'use strict';

// Polling triggers: the two that read a SINGLE-OBJECT endpoint and then required
// an array (getApplications: GET /app/{app_id}; getOrganisations: GET /org/{org_id})
// could never emit against Podio's real shape — their own source said "needs a
// structural review". These tests pin the structural fix: each polls the LIST
// endpoint the component already uses elsewhere (helpers/orgHelper.js GET /org/;
// helpers/spaceHelper.js and actions/apps/getAppsBySpace.js GET /app/space/{id}/),
// emits the same {id: name} map its siblings do, and refuses bad input BEFORE any
// request. Same style as action-audit.spec.js: sinon stubs on Podio.prototype.get,
// a fake context, no network.
//
// Seeded red: this file was written first and run against the pre-fix triggers
// (28b4b74; the transcript is in the commit message) — the endpoint, input and
// declaration assertions failed there and pass after the fix. A spec that was
// never seen red proves nothing about the defect it exists to catch.
//
// WHICH TWO RULES THE RED DISTINGUISHES. A stub that answers every path with the
// same list cannot tell "read the single-object endpoint" from "read the list
// endpoint" — the old trigger transforms that list just as happily as the new one.
// The "Podio's real response shapes" cases answer BY PATH, the way Podio does:
// a list at the list endpoints, one object at the single-object ones. There the
// old rule emits an error and no data, and the new rule emits the map — the defect
// itself, stated end to end. The shapes are the ones the component's own readers
// already assume (helpers/orgHelper.js iterates GET /org/; actions/organisations/
// getOrg.js emits GET /org/{id} as one object; helpers/spaceHelper.js iterates
// GET /app/space/{id}; actions/apps/getApp.js reads GET /app/{id} as one app), not
// a live Podio call.

const assert = require('assert');
const sinon = require('sinon');
const Podio = require('../../podio');
const getOrganisations = require('../../lib/triggers/getOrganisations').process;
const getApplications = require('../../lib/triggers/getApplications').process;

describe('Polling trigger regressions: list endpoints, not single objects (no network)', function () {
    let sandbox, get, context;
    const emitted = (kind) => context.emit.getCalls().filter((c) => c.args[0] === kind).map((c) => c.args[1]);

    // Podio's response shapes by path family: a LIST at GET /org/ and
    // GET /app/space/{id}/, ONE OBJECT at GET /org/{id} and GET /app/{id}.
    function podioShapes(path) {
        let m;
        if (path === '/org/') return [{ org_id: 3, name: 'Org' }, { org_id: 4, name: 'Other Org' }];
        if ((m = /^\/org\/(\d+)\/?$/.exec(path))) return { org_id: Number(m[1]), name: 'Org' };
        if ((m = /^\/app\/space\/(\d+)\/?$/.exec(path))) return [{ app_id: 42, space_id: Number(m[1]), status: 'active', config: { name: 'Projects' } }];
        if ((m = /^\/app\/(\d+)\/?$/.exec(path))) return { app_id: Number(m[1]), status: 'active', config: { name: 'Projects' } };
        return Promise.reject(Object.assign(new Error('no such path in the stand-in: ' + path), { statusCode: 404 }));
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox();
        get = sandbox.stub(Podio.prototype, 'get').rejects(new Error('Unexpected GET'));
        sandbox.stub(Podio.prototype, 'post').rejects(new Error('Unexpected POST'));
        context = { emit: sandbox.stub().resolves(), logger: { info() {}, warn() {}, error() {} } };
    });
    afterEach(function () { sandbox.restore(); });

    describe('getOrganisations', function () {
        it('polls GET /org/ — the list of organisations — with no id and no query', async function () {
            get.resolves([{ org_id: 1, name: 'Alpha' }, { org_id: 2, name: 'Beta' }]);
            await getOrganisations.call(context, { body: {} }, {});
            assert.strictEqual(get.callCount, 1);
            assert.deepStrictEqual(get.firstCall.args, ['/org/']);
        });

        it('emits one snapshot and one data message, both carrying the {org_id: name} map', async function () {
            get.resolves([{ org_id: 1, name: 'Alpha' }, { org_id: 2, name: 'Beta' }]);
            await getOrganisations.call(context, { body: {} }, {});
            assert.deepStrictEqual(emitted('snapshot'), [{ 1: 'Alpha', 2: 'Beta' }]);
            assert.strictEqual(emitted('data').length, 1);
            assert.deepStrictEqual(emitted('data')[0].body, { 1: 'Alpha', 2: 'Beta' });
            assert.strictEqual(emitted('error').length, 0);
            assert.strictEqual(emitted('end').length, 0);
        });

        it('still polls the list when a message carries a stale org_id (the old single-object input)', async function () {
            get.resolves([{ org_id: 7, name: 'Gamma' }]);
            await getOrganisations.call(context, { body: { org_id: 7 } }, {});
            assert.deepStrictEqual(get.firstCall.args, ['/org/']);
            assert.deepStrictEqual(emitted('data')[0].body, { 7: 'Gamma' });
        });

        it("against Podio's real shapes, emits the {org_id: name} map where the single-object read could only fail", async function () {
            get.callsFake(async (path) => podioShapes(path));
            await getOrganisations.call(context, { body: { org_id: 3 } }, {});
            assert.deepStrictEqual(emitted('error'), []);
            assert.deepStrictEqual(emitted('data').map((m) => m.body), [{ 3: 'Org', 4: 'Other Org' }]);
            assert.deepStrictEqual(emitted('snapshot'), [{ 3: 'Org', 4: 'Other Org' }]);
        });

        it('reports a non-list response through the error channel and emits no data', async function () {
            get.resolves({ org_id: 1, name: 'Alpha' });
            await getOrganisations.call(context, { body: {} }, {});
            assert.strictEqual(emitted('data').length, 0);
            assert.strictEqual(emitted('error').length, 1);
            assert.ok(/organisations/.test(emitted('error')[0].message));
        });

        it('reports a transport error through the error channel, never as end', async function () {
            const failure = Object.assign(new Error('Service unavailable'), { statusCode: 503, retry: true });
            get.rejects(failure);
            await getOrganisations.call(context, { body: {} }, {});
            assert.deepStrictEqual(emitted('error'), [failure]);
            assert.strictEqual(emitted('end').length, 0);
            assert.strictEqual(emitted('data').length, 0);
        });
    });

    describe('getApplications', function () {
        const threeApps = [
            { app_id: 10, status: 'active', config: { name: 'Projects' } },
            { app_id: 11, status: 'inactive', config: { name: 'Old Leads' } },
            { app_id: 12, status: 'active', config: { name: 'Contacts' } },
        ];

        it('polls GET /app/space/{space_id}/ for the space named in the message', async function () {
            get.resolves(threeApps);
            await getApplications.call(context, { body: { space_id: 555 } }, {});
            assert.strictEqual(get.callCount, 1);
            assert.deepStrictEqual(get.firstCall.args, ['/app/space/555/']);
        });

        it('takes space_id from the step configuration when the message carries none', async function () {
            get.resolves(threeApps);
            await getApplications.call(context, { body: {} }, { space_id: '556' });
            assert.deepStrictEqual(get.firstCall.args, ['/app/space/556/']);
        });

        it("takes spaceId — the key the component's own space pickers use — from the configuration", async function () {
            get.resolves(threeApps);
            await getApplications.call(context, { body: {} }, { spaceId: 557 });
            assert.deepStrictEqual(get.firstCall.args, ['/app/space/557/']);
        });

        it('prefers the message over the configuration when both name a space', async function () {
            get.resolves(threeApps);
            await getApplications.call(context, { body: { space_id: 1 } }, { space_id: 2 });
            assert.deepStrictEqual(get.firstCall.args, ['/app/space/1/']);
        });

        it('refuses a missing space_id before any request', async function () {
            for (const [msg, cfg] of [[{ body: {} }, {}], [{}, {}], [{ body: { app_id: 10 } }, {}]]) {
                await getApplications.call(context, msg, cfg);
            }
            assert.strictEqual(get.callCount, 0);
            assert.strictEqual(emitted('data').length, 0);
            assert.strictEqual(emitted('error').length, 3);
            assert.ok(emitted('error').every((e) => /space_id/.test(e.message)));
        });

        it('refuses a space_id that is not a positive whole number, before any request (it is placed in a URL path)', async function () {
            const bad = ['abc', '5/../../org', 0, -3, 1.5, ' ', '12a', {}, true];
            for (const space_id of bad) await getApplications.call(context, { body: { space_id } }, {});
            assert.strictEqual(get.callCount, 0);
            assert.strictEqual(emitted('error').length, bad.length);
            assert.ok(emitted('error').every((e) => /space_id/.test(e.message)));
        });

        it("an invalid space_id in the message is refused, never silently replaced by the configuration's", async function () {
            await getApplications.call(context, { body: { space_id: 'abc' } }, { space_id: 5, spaceId: 5 });
            assert.strictEqual(get.callCount, 0);
            assert.strictEqual(emitted('error').length, 1);
        });

        it('accepts a space_id written as a string of digits', async function () {
            get.resolves(threeApps);
            await getApplications.call(context, { body: { space_id: '558' } }, {});
            assert.deepStrictEqual(get.firstCall.args, ['/app/space/558/']);
        });

        it("against Podio's real shapes, emits the {app_id: name} map where the single-app read could only fail", async function () {
            get.callsFake(async (path) => podioShapes(path));
            await getApplications.call(context, { body: { app_id: 42, space_id: 5 } }, {});
            assert.deepStrictEqual(emitted('error'), []);
            assert.deepStrictEqual(emitted('data').map((m) => m.body), [{ 42: 'Projects' }]);
        });

        it('keeps only active apps and emits the {app_id: name} map as snapshot and data', async function () {
            get.resolves(threeApps);
            await getApplications.call(context, { body: { space_id: 555 } }, {});
            assert.deepStrictEqual(emitted('snapshot'), [{ 10: 'Projects', 12: 'Contacts' }]);
            assert.deepStrictEqual(emitted('data')[0].body, { 10: 'Projects', 12: 'Contacts' });
            assert.strictEqual(emitted('error').length, 0);
        });

        it('reports a non-list response (the single-app shape) through the error channel and emits no data', async function () {
            get.resolves({ app_id: 10, status: 'active', config: { name: 'Projects' } });
            await getApplications.call(context, { body: { space_id: 555 } }, {});
            assert.strictEqual(emitted('data').length, 0);
            assert.strictEqual(emitted('error').length, 1);
            assert.ok(/apps/.test(emitted('error')[0].message));
        });

        it('reports a transport error through the error channel, never as end', async function () {
            const failure = Object.assign(new Error('Forbidden'), { statusCode: 403 });
            get.rejects(failure);
            await getApplications.call(context, { body: { space_id: 555 } }, {});
            assert.deepStrictEqual(emitted('error'), [failure]);
            assert.strictEqual(emitted('end').length, 0);
        });
    });

    describe('declaration (component.json and the schema files it names)', function () {
        const component = require('../../component.json');

        it('getApplications declares a required space_id input and no app_id', function () {
            const ref = component.triggers.getApplications.metadata.in;
            assert.notStrictEqual(ref, './lib/schemas/getApp.in.json', "still shares the App: Get action's single-app schema");
            const schema = require('../../' + ref);
            assert.strictEqual(schema.properties.space_id.required, true);
            assert.strictEqual(schema.properties.app_id, undefined);
        });

        it('getOrganisations declares no input: the list needs no id', function () {
            const t = component.triggers.getOrganisations;
            assert.strictEqual(t.metadata, undefined);
        });

        it('CONTROL — the App: Get and Org: Get All Spaces actions keep their single-object schemas', function () {
            assert.strictEqual(component.actions.getApp.metadata.in, './lib/schemas/getApp.in.json');
            assert.strictEqual(require('../../lib/schemas/getApp.in.json').properties.app_id.required, true);
            assert.strictEqual(component.actions.getAllSpacesOrg.metadata.in, './lib/schemas/getOrg.in.json');
            assert.strictEqual(require('../../lib/schemas/getOrg.in.json').properties.org_id.required, true);
        });
    });
});
