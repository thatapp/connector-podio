'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Get Task Summary
 * https://developers.podio.com/doc/tasks/get-task-summary-1612017
 * GET /task/summary
 *
 * Returns a summary of tasks grouped by status (overdue, today, etc.).
 */
exports.process = async function getTaskSummary(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const input = msg.body;

    try {
        // Build query parameters
        const params = {};

        // Filter by organization
        if (input.org || input.org_id) {
            params.org = input.org || input.org_id;
        }

        // Filter by space
        if (input.space || input.space_id) {
            params.space = input.space || input.space_id;
        }

        // Limit per group
        if (input.limit) {
            params.limit = input.limit;
        }

        console.log('Getting task summary');

        const summary = await podio.get('/task/summary', params);

        helper.emitData(cfg, summary, that);
    } catch (error) {
        console.error('getTaskSummary failed:', error.message || error);
        await that.emit('error', error);
    }
};

// Answers a Podio hook validation before normal processing (GitLab #476).
exports.process = require('../../../helpers/hookVerify').guard(exports.process);
