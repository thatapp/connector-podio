'use strict';

// The native host accepts the documented message envelope and emit methods.
// No separate worker runtime or HTTP client is needed to construct a message.
const { randomUUID } = require('crypto');

function newEmptyMessage() {
    return { id: randomUUID(), attachments: {}, body: {}, headers: {}, metadata: {} };
}

function newMessageWithBody(body) {
    return { ...newEmptyMessage(), body };
}

exports.messages = {
    newEmptyMessage,
    newMessageWithBody,
    emitData(body) { return this.emit('data', newMessageWithBody(body)); },
    emitError(error) { return this.emit('error', error); },
    emitEnd() { return this.emit('end'); },
    emitSnapshot(snapshot) { return this.emit('snapshot', snapshot); }
};
