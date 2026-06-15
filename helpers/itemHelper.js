const _ = require('lodash');

exports.outScheme = () => {
  return {
      ref_id : {
          type: 'number',
          required: false,
          title: 'Ref ID'
      }
  };
};

// Does this field value carry real content? Unlike lodash's _.isEmpty (which
// reports numbers and booleans as "empty"), this keeps 0/false and only treats
// null/undefined, blank strings, and empty arrays as contentless. Using this
// stopped money/location fields from losing their currency/coords when `value`
// was numeric.
function hasContent(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    return true;
}

// Which fields are category fields changes rarely, so cache the lookup per app
// for the process lifetime. (Caches the SET of category field ids, not their
// option values — so option changes don't make this stale.)
const _categoryFieldCache = {};

/**
 * Set of identifiers (external_id AND field_id as a string) for every category
 * field in the app. Used to gate the legacy "split a ';'-delimited string into
 * multiple values" behavior so it ONLY applies to category (multi-select)
 * fields. A text field containing "&nbsp;" (or any ';') must NOT be split —
 * doing so produced Podio "Multiple is not allowed for field ..." errors.
 * On any failure returns an empty Set (safer to not split than to over-split).
 */
exports.getCategoryFieldIds = async (podio, appId) => {
    if (!appId) return new Set();
    if (_categoryFieldCache[appId]) return _categoryFieldCache[appId];
    try {
        const app = await podio.get('/app/' + appId);
        const set = new Set();
        for (const f of (app.fields || [])) {
            if (f.type === 'category') {
                if (f.external_id) set.add(f.external_id);
                if (f.field_id !== undefined && f.field_id !== null) set.add(String(f.field_id));
            }
        }
        _categoryFieldCache[appId] = set;
        return set;
    } catch (e) {
        return new Set();
    }
};

exports.fieldTransform = (item, update = false, categoryFields = null) => {
    const data = {};
    for (const key in item) {
        if (item[key] === null || item[key] === undefined) {
            // skip null/undefined values
        } else if (typeof item[key] === 'object') {
            const v = item[key].value;
            if (hasContent(v) && _.isUndefined(item[key].type) && _.isUndefined(item[key].currency) && _.isUndefined(item[key].city))
            {
                data[key.toString()] = v;
            }else if (hasContent(v)) {
                data[key.toString()] = item[key];
            }else if(_.isUndefined(v)){
                data[key.toString()] = item[key];
            }else{
                data[key.toString()] = v;
            }
        } else {
            var result = (item[key]).toString();
            if(!_.isEmpty(result)){
                // ";" splits a value into MULTIPLE only for category fields.
                // For every other field type a ";" (e.g. inside "&nbsp;" or
                // ordinary text) is literal and must be left intact.
                if (result.includes(";") && categoryFields && categoryFields.has(key)) {
                    data[key.toString()] = result.split(";")
                } else {
                    data[key.toString()] = item[key];
                }
            }
        }
    }
    return data;
};

// A value the caller meant to leave UNCHANGED (omit from the payload).
function isOmitValue(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') {
        const t = v.trim();
        return t === '' || t === 'null';
    }
    return false;
}

// A value the caller meant to CLEAR (Podio empties a field given []).
// Mappings commonly use `source ? source : "[]"`, so the string "[]" and an
// empty array both mean "clear this field".
function isClearValue(v) {
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'string') return v.trim() === '[]';
    return false;
}

/**
 * Normalize a single Podio field value for create/update payloads.
 *
 * Podio rejects non-Podio-shaped values (e.g. "Invalid value ...: Must be a
 * valid url/number"), and clears a field when it receives an empty list [].
 * This centralizes empty/clear-sentinel handling so EVERY field type behaves
 * the same — "", "[]", [], null, { value }, { embed }, and date objects.
 *
 * @returns `undefined` to OMIT the field (leave it unchanged in Podio),
 *          `[]` to CLEAR it, or the value to send as-is.
 */
exports.normalizeFieldValue = (value) => {
    if (isOmitValue(value)) return undefined;
    if (isClearValue(value)) return [];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Date: { start_date | start | end, ... }
        if ('start_date' in value || 'start' in value || 'end' in value) {
            const anchor = value.start_date != null ? value.start_date
                         : value.start != null ? value.start
                         : value.end;
            return (isOmitValue(anchor) || isClearValue(anchor)) ? [] : value;
        }
        // Embed/link: { embed } — URL already resolved to an id by reformData
        if ('embed' in value) {
            return (isOmitValue(value.embed) || isClearValue(value.embed)) ? [] : value;
        }
        // Value-bearing objects: money / email / phone / reference / location
        if ('value' in value) {
            if (isOmitValue(value.value)) return undefined;
            if (isClearValue(value.value)) return [];
            return value;
        }
        return value;
    }
    return value;
};

exports.emitData = async (cfg,result,that,end = null) => {
    const {messages} = require('elasticio-node');

    if (cfg.splitResult && Array.isArray(result)) {
        for (const i_item of result) {
            const output = messages.newMessageWithBody(i_item);
            await that.emit('data', output);
        }
    } else {
        that.emit('data', messages.newMessageWithBody(result));
    }
};

/**
 * https://developers.podio.com/doc/items
 * @param field Podio field config
 * @returns {title: *, required: boolean} properties
 */
exports.getFieldProperties = (field) => {
        const props = {
            required: false,
            title: field.label
        };

        function getConf(type, title, required) {
            return {
                type: type,
                required: _.isBoolean(required) ? required : props.required,
                title: field.label + ' ' + title
            };
        }

        const getStrConf = getConf.bind(null, 'string');
        const getNumConf = getConf.bind(null, 'number');

        switch (field.type.toLowerCase()) {
            case 'number':
            case 'member':
            case 'contact':
            case 'progress':
            case 'video':
            case 'duration':
            case 'question':
                props.type = 'number';
                break;
            case 'category':
                if(field.config.settings.multiple){
                    props.type = 'string';
                }else {
                    props.type = 'string';
                }
                break;
            case 'text':
                props.type = 'string';
                break;

            case 'state':
            case 'image':
            case 'tel':
                props.type = 'string';
                break;
            case 'date':
                props.type = 'object';
                props.properties = {
                    start_date: {
                        type: 'string',
                        required: false,
                        title: field.label + ' (Start Date)',
                        description: 'Date in YYYY-MM-DD format (e.g., 2024-03-15)'
                    },
                    start_time: {
                        type: 'string',
                        required: false,
                        title: field.label + ' (Start Time)',
                        description: 'Time in HH:MM format (e.g., 14:30). Only use if field includes time.'
                    },
                    end_date: {
                        type: 'string',
                        required: false,
                        title: field.label + ' (End Date)',
                        description: 'Date in YYYY-MM-DD format (e.g., 2024-03-16). Only use for date ranges.'
                    },
                    end_time: {
                        type: 'string',
                        required: false,
                        title: field.label + ' (End Time)',
                        description: 'Time in HH:MM format (e.g., 17:00). Only use for date ranges with time.'
                    }
                };
                break;
            case 'location':
                props.type = 'object';
                props.properties = {
                    city: getStrConf('(City)'),
                    map_in_sync: getStrConf('(Map in Sync)'),
                    country: getStrConf('(Country)'),
                    formatted: getStrConf('(Formatted)'),
                    value: getStrConf('(Value)'),
                    state: getStrConf('(State)'),
                    postal_code: getStrConf('(Postal Code)'),
                    lat: getNumConf('(Latitude)'),
                    lng: getNumConf('(Longitude)'),
                    street_address: getStrConf('(Street Address)')
                };
                break;
            case 'tag':
                props.type = 'string';
                break;
            case 'money':
                props.type = 'object';
                props.properties = {
                    currency: getStrConf('(Currency)'),
                    value: getNumConf('(Value)')
                };
                break;
            case 'embed':
                props.type = 'object';
                props.properties = {
                    embed: getStrConf('(Resolved URL)')
                };
                break;
            case 'email':
                props.type = 'object';
                props.properties = {
                    type: getStrConf('(other|home|work)'),
                    value: getStrConf('(Email)')
                };
                break;

            case 'phone':
                props.type = 'object';
                props.properties = {
                    type: getStrConf('(mobile|work|home|main|work_fax|private|fax|other)'),
                    value: getStrConf('(Phone No)')
                };
                break;
            case 'app':
                props.type = 'object';
                if(field.config.settings.multiple){
                    props.properties = {
                        value: getStrConf('Item_id')
                    };
                }else {
                    props.properties = {
                        value: getNumConf('Item_id')
                    };
                }
                break;
            default:
                return undefined;
        }
        return props;
};

exports.getProperties = (fields, helper) => {
    function format(result, field) {
        const properties = helper.getFieldProperties(field,helper);
        if (properties) {
            if(field.status === "active") {
                result[field.external_id] = properties;
            }
        }
    }
    return _(fields).transform(format, {}).value();
};

exports.proccessAll = (app, helper, itemProperties, cb, outScheme) => {
    let schema;
    let outProperties;
    if (!_.isArray(app.fields)) return cb(new Error('No fields found'));

    itemProperties = _.extend(itemProperties, this.getProperties(app.fields,helper));
    console.log(JSON.stringify(itemProperties));
    outProperties = _.extend(outScheme, itemProperties);

    schema = {
        'in': {
            type: 'object',
            properties: itemProperties
        },
        'out': {
            type: 'object',
            properties: outProperties
        }
    };

    return cb(null, schema);
};
