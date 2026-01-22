/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event script that triggers when SPS batch print label checkbox is checked.
 * When custbody_sps_batched_print_com changes to true, this script:
 * 1. Checks if customer has custentity_auto_batch_print = true
 * 2. Schedules a Map/Reduce script to merge all SPS label PDFs into one
 * 
 * Only runs on IFs where:
 * - Customer has custentity_auto_batch_print = true
 * - custbody_sps_batched_print_com = true (just checked)
 */

define(['N/record', 'N/task', 'N/log'], function (record, task, log) {
    
    /**
     * Triggered after an Item Fulfillment record is saved
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed
     * @param {number} scriptContext.newRecord - The new record being saved
     * @param {number} scriptContext.oldRecord - The old record before changes
     */
    function afterSubmit(scriptContext) {
        try {
            var newRecord = scriptContext.newRecord;
            var oldRecord = scriptContext.oldRecord;
            var ifId = newRecord.id;
            var recordType = newRecord.type;
            
            // Only process Item Fulfillments
            if (recordType !== record.Type.ITEM_FULFILLMENT) {
                return;
            }
            
            // Check if batch print complete checkbox was just set to true
            var newBatchPrintComplete = newRecord.getValue('custbody_sps_batched_print_com');
            var oldBatchPrintComplete = oldRecord.getValue('custbody_sps_batched_print_com');
            
            // Only process if checkbox changed from false to true
            if (newBatchPrintComplete === true && oldBatchPrintComplete !== true) {
                log.debug('afterSubmit', 'Batch print complete checkbox set to true for IF: ' + ifId);
                
                // Get customer ID
                var entityId = newRecord.getValue('entity');
                if (!entityId) {
                    log.debug('afterSubmit', 'No customer ID found on IF ' + ifId + ', skipping');
                    return;
                }
                
                // Check if customer has auto batch print enabled
                try {
                    var customerRecord = record.load({
                        type: record.Type.CUSTOMER,
                        id: entityId
                    });
                    var autoBatchPrint = customerRecord.getValue('custentity_auto_batch_print');
                    
                    if (autoBatchPrint !== true && autoBatchPrint !== 'T') {
                        log.debug('afterSubmit', 'Customer ' + entityId + ' does not have auto_batch_print enabled, skipping merge');
                        return;
                    }
                    
                    log.debug('afterSubmit', 'Customer ' + entityId + ' has auto_batch_print enabled, scheduling merge MR');
                    
                    // Check if already requested (prevent duplicate processing)
                    var alreadyRequested = newRecord.getValue('custbody_requested_batch_and_attach');
                    if (alreadyRequested === true || alreadyRequested === 'T') {
                        log.debug('afterSubmit', 'IF ' + ifId + ' already has requested_batch_and_attach = true, skipping');
                        return;
                    }
                    
                    // Schedule the Map/Reduce script to merge labels
                    scheduleMergeLabelsMR(ifId);
                    
                } catch (customerError) {
                    log.error('afterSubmit', 'Error checking customer auto_batch_print for IF ' + ifId + ': ' + customerError.toString());
                }
            }
        } catch (e) {
            log.error('afterSubmit', 'Error in afterSubmit: ' + e.toString());
        }
    }
    
    /**
     * Schedules the Map/Reduce script to merge label PDFs
     * @param {string} ifId - Item Fulfillment internal ID
     */
    function scheduleMergeLabelsMR(ifId) {
        try {
            // Set the requested field to true BEFORE scheduling to prevent duplicates
            try {
                record.submitFields({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ifId,
                    values: {
                        custbody_requested_batch_and_attach: true
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
                log.debug('scheduleMergeLabelsMR', 'Set requested_batch_and_attach = true for IF ' + ifId);
            } catch (fieldError) {
                log.error('scheduleMergeLabelsMR', 'Error setting requested_batch_and_attach field: ' + fieldError.toString());
                throw fieldError; // Don't proceed if we can't set the field
            }
            
            var mrScriptId = 'customscript_dsh_mr_merge_labels';
            var mrDeployId = 'customdeploy_dsh_mr_merge_labels';
            
            // Build JSON parameter with IF ID
            var jsonParam = JSON.stringify({
                itemFulfillmentId: ifId
            });
            
            log.debug('scheduleMergeLabelsMR', 'Scheduling MR script for IF: ' + ifId);
            
            var mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: mrScriptId,
                deploymentId: mrDeployId,
                params: {
                    custscript_dsh_mr_merge_labels_json: jsonParam
                }
            });
            
            var taskId = mrTask.submit();
            log.audit('scheduleMergeLabelsMR', 'MR task scheduled for IF ' + ifId + '. Task ID: ' + taskId);
            
        } catch (e) {
            log.error('scheduleMergeLabelsMR', 'Error scheduling MR script for IF ' + ifId + ': ' + e.toString());
            
            // If scheduling failed, reset the field so it can be retried
            try {
                record.submitFields({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ifId,
                    values: {
                        custbody_requested_batch_and_attach: false
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
                log.debug('scheduleMergeLabelsMR', 'Reset requested_batch_and_attach = false for IF ' + ifId + ' due to scheduling failure');
            } catch (resetError) {
                log.error('scheduleMergeLabelsMR', 'Error resetting field after failure: ' + resetError.toString());
            }
        }
    }
    
    return {
        afterSubmit: afterSubmit
    };
});

