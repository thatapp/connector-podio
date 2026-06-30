var Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const { messages } = require('elasticio-node');

exports.process = async function getAppTagsSearch(msg, cfg) {
  const that = this;
  const action = "Get Objects on App With Tag";
  this.logger.info(`"${action}" action started...`);

  var podio = new Podio(cfg);
  const { app_id, text } = msg.body;

  if (!app_id) {
    throw new Error('app_id field is required');
  }

  try {
    const response = await podio.get(`/tag/app/${app_id}/search/`, { text: text });
    this.logger.info(`"${action}" action completed...`);
    await helper.emitData(cfg, response, that);
  } catch (err) {
    this.logger.info(`"${action}" action errored...`);
    that.emit('error', err);
  }
}
