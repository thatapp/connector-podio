'use strict';

const Podio = require('../../../podio');
const { toPodioId } = require('../../../helpers/coerce');
const { emitData } = require('../../../helpers/itemHelper');
const { guard } = require('../../../helpers/hookVerify');

exports.process = guard(async function getActualFile(msg, cfg) {
    const fileId = toPodioId(msg.body.file_id, 'file_id');
    const podio = new Podio(cfg, this);
    const metadata = await podio.get('/file/' + fileId);
    if (Number(metadata.file_id) !== fileId || metadata.hosted_by !== 'podio') {
        throw new Error('File Download requires the selected Podio-hosted file.');
    }
    const raw = msg.body.raw_data;
    const includeBytes = raw === true || raw === 'true' || raw === 'yes';
    const filename = String(metadata.name || fileId);
    const result = { status: true, file_name: filename, download_url: 'https://api.podio.com/file/' + fileId + '/raw' };
    if (includeBytes || this.attachments?.write) {
        const encoded = await podio.get('/file/' + fileId + '/raw');
        if (typeof encoded !== 'string') throw new Error('Podio did not return file content.');
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.toString('base64') !== encoded || metadata.size == null || bytes.length !== Number(metadata.size)) {
            throw new Error('Podio file content did not match its metadata.');
        }
        if (this.attachments?.write) {
            const stored = await this.attachments.write({ filename, contentType: metadata.mimetype || 'application/octet-stream', data: bytes });
            if (!stored || typeof stored.url !== 'string' || !stored.url) throw new Error('The platform did not store the file.');
            result.download_url = stored.url;
        }
        if (includeBytes) result.base64 = encoded;
    }
    return emitData(cfg, result, this);
});
