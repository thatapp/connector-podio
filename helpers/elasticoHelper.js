'use strict';

const { messages } = require('./messages');

exports.emit = async (obj, data) => {
    await messages.emitSnapshot.call(obj, data);
    obj.emit('data', messages.newMessageWithBody(data));
};

// Returns an error handler function for Q promise .fail() chains
exports.handleFailed = (obj) => {
    return function(error) {
        console.error('API call failed:', error.message || error);
        obj.emit('error', error);
    };
};

// Returns an end handler function for Q promise chains
exports.handleDone = (obj) => {
    return function() {
        obj.emit('end');
    };
};
