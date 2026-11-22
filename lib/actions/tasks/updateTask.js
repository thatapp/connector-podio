'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Update Task
 * https://developers.podio.com/doc/tasks/update-task-10583674
 * PUT /task/{task_id}
 *
 * Updates the task with the given id. This is the most capable update endpoint,
 * superseding individual update endpoints (description, due date, text, etc.).
 */
exports.process = async function updateTask(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const input = msg.body;

    const taskId = input.task_id;

    if (!taskId) {
        throw new Error('task_id is required');
    }

    try {
        // Build update payload - only include fields that are provided
        const payload = {};

        // Text (title)
        if (input.text !== undefined) {
            payload.text = input.text;
        }

        // Description
        if (input.description !== undefined) {
            payload.description = input.description;
        }

        // Due date/time
        if (input.due_date !== undefined) {
            payload.due_date = input.due_date;
        }
        if (input.due_time !== undefined) {
            payload.due_time = input.due_time;
        }

        // Responsible user
        if (input.responsible !== undefined) {
            payload.responsible = input.responsible;
        }

        // Private flag
        if (input.private !== undefined) {
            payload.private = input.private;
        }

        // Reference
        if (input.ref_type !== undefined) {
            payload.ref_type = input.ref_type;
        }
        if (input.ref_id !== undefined) {
            payload.ref_id = input.ref_id;
        }

        // Completed status
        if (input.completed !== undefined) {
            payload.completed = input.completed;
        }

        // Labels
        if (input.labels !== undefined) {
            payload.labels = input.labels;
        }

        // File attachments
        if (input.file_ids !== undefined) {
            payload.file_ids = input.file_ids;
        }

        // Reminder
        if (input.reminder !== undefined) {
            payload.reminder = input.reminder;
        } else if (input.remind_delta !== undefined) {
            payload.reminder = { remind_delta: input.remind_delta };
        }

        // Build URL with query params
        const hook = cfg.hook === false || cfg.hook === 'false' ? 0 : 1;
        const silent = cfg.silent === true || cfg.silent === 'true' ? 1 : 0;
        for (const key of ['external_id', 'recurrence']) {
            if (input[key] !== undefined) payload[key] = input[key];
        }
        const url = `/task/${taskId}?hook=${hook}&silent=${silent}`;

        console.log(`Updating task ${taskId}`);

        const task = await podio.put(url, payload);

        helper.emitData(cfg, task, that);
    } catch (error) {
        console.error('updateTask failed:', error.message || error);
        await that.emit('error', error);
    }
};
