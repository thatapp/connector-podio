var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const org = require("../../../helpers/orgHelper");
const space = require("../../../helpers/spaceHelper");
const helper = require('../../../helpers/itemHelper');

exports.process = async function searchApp(msg, cfg) {
    var podio = new Podio(cfg);
    var item = msg.body;

    var fields = {};
    fields.app_id = parseInt(item.app_id);
    if (item.counts) {
        fields.counts = item.counts;
    }
    if (item.query) {
        fields.query = Array.isArray(item.query) ? item.query[0] : item.query;
    }
    if (item.search_fields) {
        fields.search_fields = item.search_fields;
    }
    if (item.highlights !== undefined) {
        fields.highlights = item.highlights;
    }
    if (item.limit) {
        fields.limit = item.limit;
    }
    if (item.offset) {
        fields.offset = item.offset;
    }
    if (item.ref_type) {
        fields.ref_type = item.ref_type;
    }

    var apps = await podio.post('/search/app/' + item.app_id + '/', fields);

    // Podio may return {results: [...], counts: {...}} when counts=true, or a plain array
    let counts = null;
    const results = (apps && !Array.isArray(apps) && Array.isArray(apps.results))
        ? (counts = apps.counts || null, apps.results)
        : apps;

    if (Array.isArray(results) && results.length > 0) {
        for (const i_item of results) {
            const output = messages.newMessageWithBody(
                counts ? { ...i_item, _counts: counts } : i_item
            );
            await this.emit('data', output);
        }
    } else if (results && !Array.isArray(results)) {
        await this.emit('data', messages.newMessageWithBody(results));
    } else {
        // Zero results — emit passthrough so the router can discard cleanly
        // instead of silently dropping the message (which causes infinite retry loops)
        const noMatch = {
            _searchApp_no_match: true,
            app_id: item.app_id,
            query: item.query || null,
        };
        await this.emit('data', messages.newMessageWithBody(noMatch));
    }

}

exports.getMetaModel = function getMetaModel(cfg, cb) {
    // Return the output schema for search results so the platform can correctly
    // map fields (especially 'id') to downstream steps like updateItem.
    const schema = {
        in: {
            type: 'object',
            properties: {
                app_id:        { type: 'number',  required: true,  title: 'App ID' },
                query:         { type: 'string',  required: false, title: 'Search Query' },
                ref_type:      { type: 'string',  required: false, title: 'Ref Type (e.g. item)' },
                highlights:    { type: 'boolean', required: false, title: 'Include Highlights' },
                counts:        { type: 'boolean', required: false, title: 'Include Counts' },
                limit:         { type: 'number',  required: false, title: 'Limit' },
                offset:        { type: 'number',  required: false, title: 'Offset' },
                search_fields: { type: 'string',  required: false, title: 'Search Fields' },
            }
        },
        out: {
            type: 'object',
            properties: {
                id:                  { type: 'number',  required: false, title: 'Item ID' },
                title:               { type: 'string',  required: false, title: 'Title' },
                type:                { type: 'string',  required: false, title: 'Type' },
                link:                { type: 'string',  required: false, title: 'Link' },
                created_on:          { type: 'string',  required: false, title: 'Created On' },
                rank:                { type: 'number',  required: false, title: 'Rank' },
                search_id:           { type: 'string',  required: false, title: 'Search ID' },
                highlight:           { type: 'string',  required: false, title: 'Highlight Snippet' },
                _counts:             { type: 'object',  required: false, title: 'Counts (when counts=true)' },
                _searchApp_no_match: { type: 'boolean', required: false, title: 'No Match Found' },
            }
        }
    };
    return cb(null, schema);
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
