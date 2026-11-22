var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');

exports.process = async function removeTags(msg, cfg) {
  const that = this;
  var podio = new Podio(cfg);
  this.logger.info('"Remove tags" action started...');
  const { ref_type, ref_id } = msg.body;
  const text = msg.body.tag ?? msg.body.text;

  if (!ref_type) {
    throw new Error('ref_type field is required');
  }

  if (!ref_id) {
    throw new Error('ref_id field is required');
  }

  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('tag field is required');
  }

  try {
    await podio.delete(`/tag/${ref_type}/${ref_id}?text=${encodeURIComponent(text.trim())}`);
    this.logger.info('"Remove tags" action completed...');
    await that.emit('data', messages.newMessageWithBody(""));
  } catch (err) {
    this.logger.info('"Remove tags" action errored...');
    await that.emit('error', err);
  }
}
