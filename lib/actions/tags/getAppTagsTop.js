var Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const { messages } = require('elasticio-node');

exports.process = async function getAppTagsTop(msg, cfg) {
  const that = this;
  const action = "Get Tags on App Top";
  this.logger.info(`"${action}" action started...`);

  var podio = new Podio(cfg);
  const { app_id, limit, text } = msg.body;

  if (!app_id) {
    throw new Error('app_id field is required');
  }

  try {
    const response = await podio.get(`/tag/app/${app_id}/top/`, { limit: limit, text: text });
    this.logger.info(`"${action}" action completed...`);
    await helper.emitData(cfg, response, that);
  } catch (err) {
    this.logger.info(`"${action}" action errored...`);
    that.emit('error', err);
  }
}
