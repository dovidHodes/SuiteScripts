/**
 *@NApiVersion 2.0
 *@NModuleScope SameAccount
 *@NScriptType UserEventScript
 *@NAmdConfig ./module_config.json
 */
define(["require", "exports", "N/log", "N/record", "N/task", "N/runtime", "./lib/sps_lib_inactivate_pack_def"], function (require, exports, log, record, task, runtime, packDefLib) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.beforeSubmit = exports.beforeLoad = void 0;
    function beforeLoad(ctx) {
        var rec = ctx.newRecord;
        ctx.form.clientScriptModulePath = './sps_cs_pack_def_messaging';
    }
    exports.beforeLoad = beforeLoad;
    function beforeSubmit(ctx) {
        if (ctx.type === ctx.UserEventType.EDIT) {
            var packDefCurrenRec = ctx.newRecord;
            var packDefRecId_1 = packDefCurrenRec.id;
            var isInactive = packDefCurrenRec.getValue({ fieldId: 'isinactive' });
            if (isInactive === true) {
                try {
                    log.audit('Current Record is Inactive', 'Yes');
                    // If package definition Inactive checkbox is checked,
                    // run search that looks for active pack rules associated to package definition
                    // then mark each associated pack rule as inactive
                    var packRulesResult = packDefLib.searchActivePackRulesByInternalID(packDefRecId_1);
                    if (packRulesResult) {
                        packRulesResult.each(function (result) {
                            var currentUsageObj = runtime.getCurrentScript();
                            var currentUsage = currentUsageObj.getRemainingUsage();
                            log.debug('Current Usage', currentUsage);
                            var packRuleId = result.getValue({ name: 'internalid' });
                            log.debug('Current Pack Rule ID', packRuleId);
                            if (currentUsage >= 20) {
                                if (packDefRecId_1) {
                                    record.submitFields({
                                        type: 'customrecord_sps_pack_qty',
                                        id: packRuleId,
                                        values: {
                                            isinactive: true,
                                        },
                                    });
                                }
                                return true;
                            }
                            else {
                                // There is not sufficient governance units remaining,
                                // Must throw to Map/Reduce
                                try {
                                    log.debug('packDefRecId for task', packDefRecId_1);
                                    var scriptTask = task.create({ taskType: task.TaskType.MAP_REDUCE });
                                    (scriptTask.scriptId = 'customscript_sps_inactivate_pack_def_mr'), (scriptTask.params = { custscript_sps_packdef_id_param: packDefRecId_1 });
                                    var mrTaskId = scriptTask.submit();
                                    // @ts-ignore
                                    var taskStatus = task.checkStatus(mrTaskId);
                                    log.debug('taskStatus', taskStatus);
                                }
                                catch (e) {
                                    log.error('Error while calling MR script to inactivate Package Definition', JSON.stringify(e));
                                }
                            }
                        });
                    }
                }
                catch (e) {
                    log.error('Error while processing package rules inactivation', JSON.stringify(e));
                }
            }
        }
    }
    exports.beforeSubmit = beforeSubmit;
});
