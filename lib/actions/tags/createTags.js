var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');

exports.process = async function createTags(msg, cfg) {
  const that = this;
  var podio = new Podio(cfg);
  this.logger.info('"Create tags" action started...');
  const { ref_type, ref_id, text } = msg.body;

  if (!ref_type) {
    throw new Error('ref_type field is required');
  }

  if (!ref_id) {
    throw new Error('ref_d field is required');
  }

  if (!text) {
    throw new Error('text field is required');
  }

  const tagArray = text.split(',').map(tag => tag.trim());
  try {
    await podio.post(`/tag/${ref_type}/${ref_id}`, tagArray);
    this.logger.info('"Create tags" action completed...');
    that.emit('data', messages.newMessageWithBody(""));
  } catch (err) {
    this.logger.info('"Create tags" action errored...');
    that.emit('error', err);
  }
}
