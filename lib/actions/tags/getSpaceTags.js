var Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const { messages } = require('elasticio-node');

exports.process = async function getSpaceTags(msg, cfg) {
  const that = this;
  const action = "Get Tags on Space";
  this.logger.info(`"${action}" action started...`);

  var podio = new Podio(cfg);
  const { space_id, limit, text } = msg.body;

  if (!space_id) {
    throw new Error('space_id field is required');
  }

  try {
    const response = await podio.get(`/tag/space/${space_id}/`, { limit: limit, text: text });
    this.logger.info(`"${action}" action completed...`);
    await helper.emitData(cfg, response, that);
  } catch (err) {
    this.logger.info(`"${action}" action errored...`);
    that.emit('error', err);
  }
}
