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

// Which fields are splittable changes rarely, so cache the lookup per app for
// the process lifetime. (Caches the SET of field ids, not their option/value
// contents — so option changes don't make this stale.)
const _splittableFieldCache = {};

/**
 * Set of identifiers (external_id AND field_id as a string) for every field in
 * the app whose ';'-delimited string value should be split into MULTIPLE values.
 * That is the multi-value field types:
 *   - category  — multi-select option ids/labels
 *   - app       — relationship/reference fields holding multiple item_ids
 *                 (e.g. "123;456"); item ids never contain ';', so single
 *                 references like "123" are unaffected.
 *
 * This gates the legacy "split a ';'-delimited string into multiple values"
 * behavior so it does NOT apply to text-like fields. A text field containing
 * "&nbsp;" (or any ';') must NOT be split — doing so produced Podio "Multiple
 * is not allowed for field ..." errors.
 *
 * On any failure returns an empty Set (safer to not split than to over-split).
 */
exports.getSplittableFieldIds = async (podio, appId) => {
    if (!appId) return new Set();
    if (_splittableFieldCache[appId]) return _splittableFieldCache[appId];
    try {
        const app = await podio.get('/app/' + appId);
        const set = new Set();
        for (const f of (app.fields || [])) {
            if (f.type === 'category' || f.type === 'app') {
                if (f.external_id) set.add(f.external_id);
                if (f.field_id !== undefined && f.field_id !== null) set.add(String(f.field_id));
            }
        }
        _splittableFieldCache[appId] = set;
        return set;
    } catch (e) {
        return new Set();
    }
};

// Image fields, like category fields, change rarely — cache the per-app list
// for the process lifetime. Stores {field_id, external_id} for each image field
// so the update path can match data keyed by either identifier.
const _imageFieldCache = {};

async function getImageFields(podio, appId) {
    if (!appId) return [];
    if (_imageFieldCache[appId]) return _imageFieldCache[appId];
    try {
        const app = await podio.get('/app/' + appId);
        const list = (app.fields || [])
            .filter(f => f.type === 'image')
            .map(f => ({ field_id: f.field_id, external_id: f.external_id }));
        _imageFieldCache[appId] = list;
        return list;
    } catch (e) {
        return [];
    }
}
exports.getImageFields = getImageFields;

// Coerce a provided file_id to the shape Podio expects (numeric where possible,
// matching how GET returns file_ids). Returns null for empty/blank values.
function normalizeFileId(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') {
        // { value: id } or { file_id: id } wrappers
        if ('file_id' in v) return normalizeFileId(v.file_id);
        if ('value' in v) return normalizeFileId(v.value);
        return null;
    }
    if (typeof v === 'string') {
        const t = v.trim();
        if (t === '') return null;
        return /^\d+$/.test(t) ? Number(t) : t;
    }
    return v;
}

// Pull the current file_ids off an item's image field. GET /item/{id} returns
// image values as [{ value: { file_id, ... } }, ...].
function getExistingImageFileIds(podioItem, field) {
    const f = (podioItem.fields || []).find(ff =>
        String(ff.field_id) === String(field.field_id) ||
        (field.external_id && ff.external_id === field.external_id));
    if (!f || !Array.isArray(f.values)) return [];
    return f.values
        .map(v => (v && v.value && typeof v.value === 'object') ? v.value.file_id : (v && v.value))
        .map(normalizeFileId)
        .filter(id => id !== null);
}

/**
 * Intelligent image-field handling for item updates.
 *
 * Podio's PUT /item replaces an image field's entire file list, so sending a
 * single new file_id would silently drop the images already on the item. This
 * makes the behavior dependent on the caller's intent:
 *   - A SINGLE file_id (string/number/{value}) APPENDS to the existing images.
 *   - An ARRAY of file_ids REPLACES the field with exactly those images
 *     (an empty array clears the field — Podio's native behavior).
 *
 * Mutates and returns `data`. On any failure to read the current item it falls
 * back to the value as supplied (the old replace behavior) rather than throwing.
 */
exports.mergeImageFieldValues = async (podio, appId, item_id, data) => {
    const imageFields = await getImageFields(podio, appId);
    if (!imageFields.length) return data;

    // Image fields present in the payload with a single (non-array) value want
    // append semantics; arrays are left untouched (replace).
    const appendTargets = [];
    for (const field of imageFields) {
        for (const key of [field.external_id, String(field.field_id)]) {
            if (key && Object.prototype.hasOwnProperty.call(data, key) && !Array.isArray(data[key])) {
                appendTargets.push({ key, field });
            }
        }
    }
    if (!appendTargets.length) return data;

    let podioItem;
    try {
        podioItem = await podio.get(`/item/${item_id}`);
    } catch (e) {
        return data; // can't read existing images — leave caller's value as-is
    }

    for (const { key, field } of appendTargets) {
        const merged = getExistingImageFileIds(podioItem, field);
        const providedId = normalizeFileId(data[key]);
        if (providedId !== null && !merged.some(id => String(id) === String(providedId))) {
            merged.push(providedId);
        }
        data[key] = merged;
    }
    return data;
};

exports.fieldTransform = (item, update = false, splittableFields = null) => {
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
                // ";" splits a value into MULTIPLE only for multi-value fields
                // (category options and app/relationship references). For every
                // other field type a ";" (e.g. inside "&nbsp;" or ordinary text)
                // is literal and must be left intact.
                if (result.includes(";") && splittableFields && splittableFields.has(key)) {
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

// A message body must be an object for the platform to expose named, mappable
// fields downstream. Wrap primitives so an array of scalars still emits cleanly.
function toMessageBody(v) {
    return (v !== null && typeof v === 'object' && !Array.isArray(v)) ? v : { value: v };
}

// Emit results to the next flow step.
//
// An ARRAY is ALWAYS split into one message PER element — a raw array body
// exposes no named fields to the next step's mapper, so list endpoints
// (findReferenceable, filter, get-by-app, tags, etc.) appeared to "drop" their
// output downstream. Splitting makes each item's fields individually mappable.
// A single object emits as one message. (`splitResult` is accepted for
// backward-compatible call signatures but no longer gates splitting — arrays
// always split.) Callers should `await` this so every emit flushes before the
// action's process promise resolves.
exports.emitData = async (cfg, result, that, end = null) => {
    const { messages } = require('elasticio-node');

    if (Array.isArray(result)) {
        for (const i_item of result) {
            await that.emit('data', messages.newMessageWithBody(toMessageBody(i_item)));
        }
        return;
    }
    await that.emit('data', messages.newMessageWithBody(toMessageBody(result)));
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

        // Same as getStrConf, plus a format hint shown in the mapper.
        function getDateConf(title, description) {
            const conf = getStrConf(title);
            conf.description = description;
            return conf;
        }

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
                // Podio's date value carries every key below. `start`/`end` are
                // the canonical write format (full datetime); the date/time pairs
                // are the documented sub-fields; the *_utc keys are what Podio
                // RETURNS on reads. All are exposed so a date mapped straight
                // through from an upstream Podio step finds its matching target.
                props.properties = {
                    start: getDateConf('(Start)',
                        'Full start datetime, YYYY-MM-DD HH:MM:SS (e.g. 2026-03-15 14:30:00). Podio\'s canonical write format.'),
                    end: getDateConf('(End)',
                        'Full end datetime, YYYY-MM-DD HH:MM:SS. Only for date ranges.'),
                    start_date: getDateConf('(Start Date)',
                        'Start date in YYYY-MM-DD format (e.g. 2026-03-15).'),
                    start_time: getDateConf('(Start Time)',
                        'Start time in HH:MM:SS format (e.g. 14:30:00). Only if the field includes time.'),
                    end_date: getDateConf('(End Date)',
                        'End date in YYYY-MM-DD format. Only for date ranges.'),
                    end_time: getDateConf('(End Time)',
                        'End time in HH:MM:SS format. Only for date ranges with time.'),
                    start_utc: getDateConf('(Start Utc)',
                        'UTC start datetime as returned by Podio. Read-only \u2014 set start or start_date/start_time when writing.'),
                    end_utc: getDateConf('(End Utc)',
                        'UTC end datetime as returned by Podio. Read-only \u2014 set end or end_date/end_time when writing.'),
                    start_date_utc: getDateConf('(Start Date Utc)',
                        'UTC start date as returned by Podio. Read-only.'),
                    start_time_utc: getDateConf('(Start Time Utc)',
                        'UTC start time as returned by Podio. Read-only.'),
                    end_date_utc: getDateConf('(End Date Utc)',
                        'UTC end date as returned by Podio. Read-only.'),
                    end_time_utc: getDateConf('(End Time Utc)',
                        'UTC end time as returned by Podio. Read-only.')
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
