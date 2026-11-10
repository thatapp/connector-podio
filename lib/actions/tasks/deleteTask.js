'use strict';

const Podio = require('../../../podio');
const { messages } = require('../../../helpers/messages');

/**
 * Delete Task
 * https://developers.podio.com/doc/tasks/delete-task-77179
 * DELETE /task/{task_id}
 *
 * Deletes the task with the given id.
 */
exports.process = async function deleteTask(msg, cfg) {
    const that = this;
    const podio = new Podio(cfg);

    const taskId = msg.body.task_id;

    if (!taskId) {
        throw new Error('task_id is required');
    }

    try {
        const url = `/task/${taskId}`;
        console.log(`Deleting task: ${taskId}`);

        await podio.delete(url);

        await that.emit('data', messages.newMessageWithBody({
            status: 'success',
            message: `Task ${taskId} deleted successfully`,
            task_id: taskId
        }));
    } catch (error) {
        console.error('deleteTask failed:', error.message || error);
        await that.emit('error', error);
    }
};
