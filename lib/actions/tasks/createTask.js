'use strict';

const Podio = require('../../../podio');
const helper = require('../../../helpers/itemHelper');

/**
 * Create Task
 * https://developers.podio.com/doc/tasks/create-task-22419
 * POST /task/
 *
 * Creates a new task. Can optionally be linked to a reference object.
 * This endpoint supersedes "Create Task with Reference" as ref_type/ref_id are optional params.
 */
exports.process = async function createTask(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);
    const input = msg.body;

    if (!input.text) {
        throw new Error('text is required (the task title)');
    }

    try {
        // Build task payload
        const payload = {
            text: input.text
        };

        // Optional: Description
        if (input.description) {
            payload.description = input.description;
        }

        // Optional: Due date/time
        if (input.due_on) {
            payload.due_on = input.due_on; // UTC datetime
        } else {
            if (input.due_date) {
                payload.due_date = input.due_date; // Local date
            }
            if (input.due_time) {
                payload.due_time = input.due_time; // Local time
            }
        }

        // Optional: Reference to another object (item, space, etc.)
        let path = '/task/';
        if (input.ref_type !== undefined || input.ref_id !== undefined) {
            const { toPodioId } = require('../../../helpers/coerce');
            if (typeof input.ref_type !== 'string' || !/^[a-z_]+$/.test(input.ref_type)) throw new Error('A task reference type is required.');
            path = '/task/' + input.ref_type + '/' + toPodioId(input.ref_id, 'ref_id') + '/';
        }

        // Optional: Responsible user(s)
        if (input.responsible) {
            payload.responsible = input.responsible;
        }

        // Optional: Private task
        if (input.private !== undefined) {
            payload.private = input.private;
        }

        // Optional: File attachments
        if (input.file_ids) {
            payload.file_ids = input.file_ids;
        }

        // Optional: Labels (can be text strings or IDs)
        if (input.labels) {
            payload.labels = input.labels;
        }
        if (input.label_ids) {
            payload.label_ids = input.label_ids;
        }

        // Optional: Reminder
        if (input.reminder || input.remind_delta) {
            payload.reminder = input.reminder || { remind_delta: input.remind_delta };
        }

        // Optional: Recurrence
        if (input.recurrence) {
            payload.recurrence = input.recurrence;
        }

        // Optional: External ID
        if (input.external_id) {
            payload.external_id = input.external_id;
        }

        // Build URL with query params
        const hook = cfg.hook === false || cfg.hook === 'false' ? 0 : 1;
        const silent = cfg.silent === true || cfg.silent === 'true' ? 1 : 0;
        const url = `${path}?hook=${hook}&silent=${silent}`;

        console.log(`Creating task: ${input.text}`);

        const task = await podio.post(url, payload);

        helper.emitData(cfg, task, that);
    } catch (error) {
        console.error('createTask failed:', error.message || error);
        await that.emit('error', error);
    }
};
