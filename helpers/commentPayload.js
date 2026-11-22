'use strict';

module.exports = function commentPayload(input) {
    const fields = ['value', 'file_ids', 'embed_url', 'external_id'];
    const selected = fields.filter(key => input[key] !== undefined);
    if (!selected.length) return input.data;
    const body = { ...input.data };
    for (const name of selected) body[name] = input[name];
    return body;
};
