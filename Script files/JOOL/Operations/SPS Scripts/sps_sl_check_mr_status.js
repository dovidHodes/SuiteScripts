/**
 *@NApiVersion 2.1
 *@NModuleScope SameAccount
 *@NScriptType Suitelet
 *@NAmdConfig ./module_config.json
 */
define(["require", "exports", "N/error", "N/task", "N/log"], function (require, exports, error, task, log) {
    function onRequest(ctx) {
        var params = ctx.request.parameters;
        if (!params.mapReduceTaskId) {
            throw error.create({ name: 'MISSING_PARAM', message: 'Missing mapReduceTaskId parameter', notifyOff: true });
        }
        log.debug('Checking status of Map/Reduce task', JSON.stringify(params.mapReduceTaskId));
        var results = task.checkStatus({ taskId: params.mapReduceTaskId });
        log.debug('Map/Reduce task status results', JSON.stringify(results));
        ctx.response.write(JSON.stringify({ stage: results === null || results === void 0 ? void 0 : results.stage, status: results === null || results === void 0 ? void 0 : results.status }));
    }
    return { onRequest: onRequest };
});
