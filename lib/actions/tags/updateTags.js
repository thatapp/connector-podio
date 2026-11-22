var Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');

exports.process = async function updateTags(msg, cfg) {
  const that = this;
  var podio = new Podio(cfg);
  this.logger.info('"Update tags" action started...');
  const { ref_type, ref_id, tags, text } = msg.body;
  const values = tags === undefined && typeof text === 'string' ? text.split(',') : tags;

  if (!ref_type) {
    throw new Error('ref_type field is required');
  }

  if (!ref_id) {
    throw new Error('ref_id field is required');
  }

  if (!Array.isArray(values) || values.some(tag => typeof tag !== 'string' || !tag.trim())) {
    throw new Error('tags must be an array of nonempty tag strings.');
  }

  const tagArray = values.map(tag => tag.trim());
  try {
    await podio.put(`/tag/${ref_type}/${ref_id}`, tagArray);
    this.logger.info('"Update tags" action completed...');
    await that.emit('data', messages.newMessageWithBody(""));
  } catch (err) {
    this.logger.info('"Update tags" action errored...');
    await that.emit('error', err);
  }
}
