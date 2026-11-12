var Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const { messages } = require('../../../helpers/messages');

exports.process = async function getOrgTags(msg, cfg) {
  const that = this;
  const action = "Get Tags on Organization";
  this.logger.info(`"${action}" action started...`);

  var podio = new Podio(cfg);
  const { org_id, limit, text } = msg.body;

  if (!org_id) {
    throw new Error('org_id field is required');
  }

  try {
    const response = await podio.get(`/tag/org/${org_id}/`, { limit: limit, text: text });
    this.logger.info(`"${action}" action completed...`);
    await helper.emitData(cfg, response, that);
  } catch (err) {
    this.logger.info(`"${action}" action errored...`);
    that.emit('error', err);
  }
}

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
