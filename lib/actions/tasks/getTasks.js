'use strict';

const Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');
const helper = require('../../../helpers/itemHelper');

/**
 * Get Tasks
 * https://developers.podio.com/doc/tasks/get-tasks-77949
 * GET /task/
 *
 * Returns all tasks matching the given filters.
 * This is the most capable task listing endpoint with 20+ filter options.
 */
const DEFAULT_BATCH_SIZE = 50;

exports.process = async function getTasks(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const input = msg.body;

    const batchSize = input.limit || DEFAULT_BATCH_SIZE;
    const allTasks = [];
    let offset = input.offset || 0;
    let hasMore = true;

    // Build query parameters from input
    const buildParams = (currentOffset) => {
        const params = {
            limit: batchSize,
            offset: currentOffset
        };

        // Filter by completion status
        if (input.completed !== undefined) {
            params.completed = input.completed;
        }

        // Filter by app
        if (input.app || input.app_id) {
            params.app = input.app || input.app_id;
        }

        // Filter by organization
        if (input.org || input.org_id) {
            params.org = input.org || input.org_id;
        }

        // Filter by space
        if (input.space || input.space_id) {
            params.space = input.space || input.space_id;
        }

        // Filter by responsible user(s)
        if (input.responsible) {
            params.responsible = input.responsible;
        }

        // Filter by reference (format: "type:id" or "type:id;type:id")
        if (input.reference || (input.ref_type && input.ref_id)) {
            params.reference = input.reference || `${input.ref_type}:${input.ref_id}`;
        }

        // Filter by label
        if (input.label || input.label_id) {
            params.label = input.label || input.label_id;
        }

        // Filter by external ID
        if (input.external_id) {
            params.external_id = input.external_id;
        }

        // Date range filters (format: YYYY-MM-DD-YYYY-MM-DD)
        if (input.due_date) {
            params.due_date = input.due_date;
        }
        if (input.created_on) {
            params.created_on = input.created_on;
        }
        if (input.completed_on) {
            params.completed_on = input.completed_on;
        }

        // Filter by creator
        if (input.created_by) {
            params.created_by = input.created_by;
        }

        // Filter by completer
        if (input.completed_by) {
            params.completed_by = input.completed_by;
        }

        // Filter by reassigned status
        if (input.reassigned !== undefined) {
            params.reassigned = input.reassigned;
        }

        // Filter by file presence
        if (input.files !== undefined) {
            params.files = input.files;
        }

        // Grouping option
        if (input.grouping) {
            params.grouping = input.grouping;
        }

        // Sorting
        if (input.sort_by) {
            params.sort_by = input.sort_by;
        }
        if (input.sort_desc !== undefined) {
            params.sort_desc = input.sort_desc;
        }

        // View level (use "full" for complete task data)
        if (input.view) {
            params.view = input.view;
        }

        return params;
    };

    console.log(`Starting getTasks with batch size: ${batchSize}`);

    try {
        while (hasMore) {
            const params = buildParams(offset);
            console.log(`Fetching tasks at offset ${offset}...`);

            const response = await podio.get('/task/', params);

            if (!response || !Array.isArray(response)) {
                console.log('No tasks in response or unexpected format');
                // If response is an object with tasks property
                if (response && response.tasks) {
                    allTasks.push(...response.tasks);
                }
                break;
            }

            console.log(`Fetched ${response.length} tasks`);

            allTasks.push(...response);

            // Check if we should continue
            if (response.length < batchSize) {
                hasMore = false;
            } else {
                offset += batchSize;
            }

            // Emit each task if splitResult is enabled
            if (cfg.splitResult && response.length > 0) {
                for (const task of response) {
                    await that.emit('data', messages.newMessageWithBody(task));
                }
            }
        }

        console.log(`Total tasks fetched: ${allTasks.length}`);

        // Emit all tasks at once if not splitting
        if (!cfg.splitResult) {
            helper.emitData(cfg, allTasks, that);
        }

    } catch (error) {
        console.error('getTasks failed:', error.message || error);
        await that.emit('error', error);
    }
};
