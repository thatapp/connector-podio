const Podio = require('../../../podio');
const {messages} = require('../../../helpers/messages');
const org = require("../../../helpers/orgHelper");
const space = require("../../../helpers/spaceHelper");
const helper = require('../../../helpers/itemHelper');

exports.process = async function getSpaceMembers(msg, cfg) {
  var that = this;
  var item = msg.body;
  var podio = new Podio(cfg);
  var fields = {};
  fields.space_id = parseInt(cfg.spaceId);
  if (item.limit) {
    fields.limit = item.limit;
  }
  if (item.member_type) {
    fields.member_type = item.member_type;
  }
  if (item.offset) {
    fields.offset = item.offset;
  }
  if (item.query) {
    fields.query = item.query;
  }

  try {
    const members = await podio.get("/space/" + cfg.spaceId + "/member/v2/", fields);
    helper.emitData(cfg, members, that);
  } catch (err) {
    that.emit('error', err);
  }
};

exports.spaces = async function getSpaces(cfg, msg) {
  return space.getSpaces(cfg, msg);
};

exports.organisations = async function getOrganisations(cfg, cb) {
    return org.getOrganisations(cfg, cb);
};

exports.getMetaModel = function getMetaModel(cfg, cb) {
    var schema;
    var itemProperties = {
        limit: {
            type: "number",
            label: "Limit",
            placeholder:"100"
        },
        offset: {
            type: "TextFieldView",
            label: "Offset",
            placeholder:"0"
        },
        member_type: {
            type: "string",
            prompt: "Member Type",
            label: "Member Type(employee,external,admin,regular,light,guest)",
        },
        query: {
            type: "string",
            label: "query"
        }
    };
    schema = {
        'in': {
            type: 'object',
            properties: itemProperties
        }
    };
    return cb(null, schema);
}
