'use strict';

const assert = require('assert');
const { messages } = require('../../../helpers/messages');

describe('Native message contract', function () {
    it('preserves every body value and gives each message independent fields', function () {
        const ids = new Set();
        for (const body of [null, false, 0, '', [], { item_id: 123 }]) {
            const message = messages.newMessageWithBody(body);
            assert.strictEqual(message.body, body);
            assert.match(message.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            assert.deepStrictEqual(Object.keys(message).sort(), ['attachments', 'body', 'headers', 'id', 'metadata']);
            assert.deepStrictEqual(message.attachments, {});
            assert.deepStrictEqual(message.headers, {});
            assert.deepStrictEqual(message.metadata, {});
            ids.add(message.id);
        }
        assert.strictEqual(ids.size, 6);
        const first = messages.newEmptyMessage(), second = messages.newEmptyMessage();
        first.attachments.foo = 'owned';
        first.headers.bar = 'owned';
        first.metadata.baz = 'owned';
        first.body.field = 'owned';
        assert.deepStrictEqual(second, { id: second.id, attachments: {}, headers: {}, metadata: {}, body: {} });
    });

    it('uses the current host context and preserves asynchronous event completion', async function () {
        const calls = [], result = Promise.resolve('accepted');
        const context = { emit(...args) { calls.push(args); return result; } };
        const snapshot = { next: 27 }, error = new Error('owned fixture');
        assert.strictEqual(messages.emitSnapshot.call(context, snapshot), result);
        assert.deepStrictEqual(calls.pop(), ['snapshot', snapshot]);
        assert.strictEqual(messages.emitError.call(context, error), result);
        assert.deepStrictEqual(calls.pop(), ['error', error]);
        assert.strictEqual(messages.emitEnd.call(context), result);
        assert.deepStrictEqual(calls.pop(), ['end']);
        assert.strictEqual(messages.emitData.call(context, false), result);
        assert.strictEqual(calls[0][0], 'data');
        assert.strictEqual(calls[0][1].body, false);
        assert.strictEqual(await result, 'accepted');
    });
});
