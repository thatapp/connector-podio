const axios = require('axios');

// #462: the platform's file proxy needs a credential a step's process is never given. The platform
// answers two fixed forwards for a step's own run key instead; both variables are set for every run.
const PATHS = { url: '/resources/file-proxy/url', file: '/resources/file-proxy/file' };

exports.PATHS = PATHS;
exports.postToFileProxy = async function postToFileProxy(kind, payload) {
    const base = String(process.env.THATAPP_API_URI || '').replace(/\/+$/, '');
    const key = String(process.env.THATAPP_API_KEY || '');
    if (!base) throw new Error('This step can only upload from inside a running flow: THATAPP_API_URI is not set.');
    if (!key) throw new Error('This step can only upload from inside a running flow: THATAPP_API_KEY is not set.');
    // NOTE: do not log `payload` (it carries the OAuth refresh_token) or the header (the run key).
    return axios.post(base + PATHS[kind], payload, { headers: { Authorization: 'Bearer ' + key } });
};
