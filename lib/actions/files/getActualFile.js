'use strict';

const helper = require('../../../helpers/itemHelper');
const axios = require('axios');

exports.process = async function getActualFile(msg, cfg) {
    const that = this;
    const { file_id, raw_data } = msg.body;

    if (!file_id) {
        throw new Error('File_id field is required');
    }

    const response = await axios.post('https://workflow.thatapp.io/get/actual/files', {
        access_token: cfg.oauth.access_token,
        refresh_token: cfg.oauth.refresh_token,
        file_id: file_id,
        raw_data: raw_data
    });

    if (response.data && response.data.status === false) {
        throw new Error(response.data.message || 'File download failed');
    }

    helper.emitData(cfg, response.data, that);
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
