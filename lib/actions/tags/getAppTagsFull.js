var Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');
const { messages } = require('../../../helpers/messages');

exports.process = async function getAppTagsFull(msg, cfg) {
  const that = this;
  const action = "Get Items Tagged in App and Space";
  this.logger.info(`"${action}" action started...`);

  var podio = new Podio(cfg);
  const { app_id } = msg.body;

  if (!app_id) {
    throw new Error('app_id field is required');
  }

  try {
    const { tag, space_id } = msg.body;
    let response;
    if (tag !== undefined || space_id !== undefined) {
      if (typeof tag !== 'string' || !tag.trim() || !space_id) throw new Error('tag and space_id are required together.');
      const app = await podio.get(`/app/${app_id}`);
      if (String(app.space_id) !== String(space_id)) throw new Error('The selected app does not belong to this space.');
      response = await podio.get(`/tag/app/${app_id}/search/full`, { text: tag.trim(), space_id });
    } else {
      response = await podio.get(`/tag/app/${app_id}/search/full`);
    }
    this.logger.info(`"${action}" action completed...`);
    await helper.emitData(cfg, response, that);
  } catch (err) {
    this.logger.info(`"${action}" action errored...`);
    that.emit('error', err);
  }
}

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
