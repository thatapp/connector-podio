var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');

exports.process = async function removeTags(msg, cfg) {
  const that = this;
  var podio = new Podio(cfg);
  this.logger.info('"Remove tags" action started...');
  const { ref_type, ref_id, text } = msg.body;

  if (!ref_type) {
    throw new Error('ref_type field is required');
  }

  if (!ref_id) {
    throw new Error('ref_d field is required');
  }

  if (!text) {
    throw new Error('tag field is required');
  }

  try {
    await podio.delete(`/tag/${ref_type}/${ref_id}?text=${text.trim()}`);
    this.logger.info('"Remove tags" action completed...');
    that.emit('data', messages.newMessageWithBody(""));
  } catch (err) {
    this.logger.info('"Remove tags" action errored...');
    that.emit('error', err);
  }
}
