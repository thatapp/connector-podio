'use strict';

const Podio = require('./podio');

module.exports = async function verifyCredentials(credentials, cb) {
    try {
        const cfg = { oauth: credentials.oauth, retries: credentials.retries, retryDelay: credentials.retryDelay };
        const podio = new Podio(cfg);

        // Verify credentials by making a simple API call to Podio
        await podio.get('/user/status');

        console.log('Credentials verified successfully');
        return cb(null, { verified: true });
    } catch (error) {
        console.error('Credential verification failed:', error.message);
        return cb(null, { verified: false });
    }
};
