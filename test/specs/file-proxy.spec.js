'use strict';

const assert = require('assert');
const sinon = require('sinon');
const axios = require('axios');
const uploadFile = require('../../lib/actions/files/uploadFileV2').process;
const publicUrl = require('../../lib/actions/files/uploadFileV3').process;

const BASE = 'https://engine.example.test/api/v2';
const RUN_KEY = 'avr_spec_run_key';
const CFG = { oauth: { refresh_token: 'spec-refresh-token' } };

const STEPS = [
    { name: 'UploadFile', run: uploadFile, path: '/resources/file-proxy/url', body: { url: 'https://files.example.test/a.pdf', filename: 'a.pdf', mimetype: 'application/pdf', description: 'spec' } },
    { name: 'publicUrl', run: publicUrl, path: '/resources/file-proxy/file', body: { source: 'aGVsbG8=', filename: 'a.txt' } }
];

describe('the Podio upload steps reach the file proxy through the platform, with their run key (#462, owner: "Keep the proxy")', function () {
    let sandbox, post, context, saved;
    beforeEach(function () {
        saved = { uri: process.env.THATAPP_API_URI, key: process.env.THATAPP_API_KEY };
        process.env.THATAPP_API_URI = BASE;
        process.env.THATAPP_API_KEY = RUN_KEY;
        sandbox = sinon.createSandbox();
        post = sandbox.stub(axios, 'post').resolves({ data: { file_id: 1 } });
        sandbox.stub(console, 'error');
        context = { emit: sandbox.stub().resolves() };
    });
    afterEach(function () {
        sandbox.restore();
        for (const [name, value] of [['THATAPP_API_URI', saved.uri], ['THATAPP_API_KEY', saved.key]]) {
            if (value === undefined) delete process.env[name]; else process.env[name] = value;
        }
    });

    it('maps documented base64 data to the upload proxy source', async function () {
        await publicUrl.call(context, { body: { data: 'dGVzdA==', filename: 'receipt.txt' } }, CFG);
        assert.strictEqual(post.callCount, 1);
        assert.strictEqual(post.firstCall.args[1].source, 'dGVzdA==');
        assert.strictEqual(context.emit.firstCall.args[1].body.file_id, 1);
    });

    for (const step of STEPS) {
        it(`${step.name} posts to the platform address it was given, never to a fixed host`, async function () {
            await step.run.call(context, { body: step.body }, CFG);
            assert.strictEqual(post.callCount, 1);
            assert.strictEqual(post.firstCall.args[0], BASE + step.path);
            assert.strictEqual(String(post.firstCall.args[0]).includes('thatapp-api.thatapp.io'), false);
        });

        it(`${step.name} signs in with its run key and sends the Podio refresh token in the body`, async function () {
            await step.run.call(context, { body: step.body }, CFG);
            const [, payload, options] = post.firstCall.args;
            assert.strictEqual(options.headers.Authorization, 'Bearer ' + RUN_KEY);
            assert.strictEqual(payload.refresh_token, 'spec-refresh-token');
            assert.strictEqual(payload.filename, step.body.filename);
            assert.deepStrictEqual(context.emit.firstCall.args[0], 'data');
        });

        it(`${step.name} tolerates a trailing slash on the platform address`, async function () {
            process.env.THATAPP_API_URI = BASE + '/';
            await step.run.call(context, { body: step.body }, CFG);
            assert.strictEqual(post.firstCall.args[0], BASE + step.path);
        });

        for (const missing of ['THATAPP_API_URI', 'THATAPP_API_KEY']) {
            it(`${step.name} without ${missing} sends nothing and says so plainly`, async function () {
                delete process.env[missing];
                await step.run.call(context, { body: step.body }, CFG);
                assert.strictEqual(post.callCount, 0);
                assert.strictEqual(context.emit.firstCall.args[0], 'error');
                const message = String(context.emit.firstCall.args[1].message);
                assert.ok(message.includes(missing), message);
                assert.strictEqual(message.includes(RUN_KEY), false);
            });
        }

        it(`${step.name} reports the platform's refusal as an error, not as data`, async function () {
            post.rejects(new Error('Request failed with status code 401'));
            await step.run.call(context, { body: step.body }, CFG);
            assert.strictEqual(context.emit.firstCall.args[0], 'error');
            assert.strictEqual(context.emit.calledWith('data'), false);
        });
    }
});
