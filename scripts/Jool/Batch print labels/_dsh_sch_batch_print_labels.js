/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * 
 * Scheduled script to find Item Fulfillments that need batch label printing and schedule the SPS MR batch label script.
 * Search criteria:
 * - custbody_requested_batch_print = false
 * - custbody_sps_batched_print_com = false
 * - custbody_routing_status = 3 (routing received)
 * - Entity has custentity_auto_batch_print = true
 * 
 * Sets custbody_requested_batch_print = true only after MR task is successfully submitted (not failed).
 */

define(['N/search', 'N/log', 'N/record', 'N/task', 'N/runtime', './_dsh_lib_time_tracker'], function (search, log, record, task, runtime, timeTrackerLib) {
    
    /**
     * Executes when the scheduled script is triggered
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed
     */
    function execute(scriptContext) {
        log.audit('execute', 'Starting scheduled script to schedule SPS batch print labels');
        
        // First, search for entities where custentity_auto_batch_print = true
        var entityIds = [];
        try {
            log.debug('execute', 'Step 1: Searching for entities with custentity_auto_batch_print = true');
            var entitySearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['custentity_auto_batch_print', 'is', 'T']
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid'
                    })
                ]
            });
            
            var entitySearchResults = entitySearch.run();
            entitySearchResults.each(function(result) {
                var entityId = result.id;
                entityIds.push(entityId);
                return true;
            });
            
            log.debug('execute', 'Found ' + entityIds.length + ' entity/ies with custentity_auto_batch_print = true');
            log.debug('execute', 'Entity IDs: ' + entityIds.join(', '));
            if (entityIds.length === 0) {
                log.audit('execute', 'No entities found with custentity_auto_batch_print = true, exiting');
                return;
            }
        } catch (e) {
            log.error('execute', 'Error searching for entities: ' + e.toString());
            return;
        }
        
        // Build search filters - search for IFs with requested_batch_print = false, sps_batched_print_com = false, routing_status = 3, and entity in our list
        log.debug('execute', 'Step 2: Creating IF search with ' + entityIds.length + ' entity/ies');
        
        var ifSearch = search.create({
            type: search.Type.ITEM_FULFILLMENT,
            filters: [
                ['mainline', 'is', 'T'],  // Only get header records, not line items
                'AND',
                ['custbody_requested_batch_print', 'is', 'F'],
                'AND',
                ['custbody_sps_batched_print_com', 'is', 'F'],
                'AND',
                ['custbody_routing_status', 'is', '3'],
                'AND',
                ['entity', 'anyof', entityIds]
            ],
            columns: [
                search.createColumn({
                    name: 'internalid'
                }),
                search.createColumn({
                    name: 'tranid'
                }),
                search.createColumn({
                    name: 'entity'
                })
            ]
        });
        log.debug('execute', 'IF search created successfully');
        
        // Process results in batches to avoid governance issues
        // Note: Each IF gets its own MR task (MR only processes first IF in array)
        var batchSize = 50; // Mark 50 IFs at a time before scheduling MR tasks
        var processedCount = 0;
        var scheduledCount = 0;
        var errorCount = 0;
        var ifIdsToSchedule = [];
        var processedIFIds = {}; // Track processed IF IDs to ensure each is only processed once
        
        try {
            log.debug('execute', 'Step 3: Running IF search');
            var pagedData = ifSearch.runPaged({ pageSize: 1000 });
            var pageRange = pagedData.pageRanges;
            
            log.audit('execute', 'Found ' + pagedData.count + ' item fulfillment(s) matching criteria');
            log.debug('execute', 'Search returned ' + pageRange.length + ' page(s)');
            
            // Process each page
            for (var i = 0; i < pageRange.length; i++) {
                log.debug('execute', 'Processing page ' + (i + 1) + ' of ' + pageRange.length);
                var page = pagedData.fetch({ index: i });
                log.debug('execute', 'Page ' + (i + 1) + ' has ' + page.data.length + ' result(s)');
                
                page.data.forEach(function(result) {
                    var ifId = result.id;
                    var tranId = result.getValue('tranid') || ifId;
                    var entityId = result.getValue('entity');
                    
                    try {
                        // Convert to string for consistent comparison
                        var ifIdStr = String(ifId);
                        
                        // Check if we've already processed this IF in this execution
                        if (processedIFIds[ifIdStr]) {
                            log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') already processed in this execution, skipping duplicate');
                            return; // Skip this iteration
                        }
                        
                        log.debug('execute', 'Processing IF: ' + tranId + ' (ID: ' + ifId + '), Entity: ' + entityId);
                        
                        // Double-check requested_batch_print field by loading the record
                        // This prevents processing IFs that were just set to true by another concurrent execution
                        var requestedBatchPrint = false;
                        var spsBatchPrintComplete = false;
                        try {
                            var ifRecordCheck = record.load({
                                type: record.Type.ITEM_FULFILLMENT,
                                id: ifId,
                                isDynamic: false
                            });
                            requestedBatchPrint = ifRecordCheck.getValue('custbody_requested_batch_print');
                            spsBatchPrintComplete = ifRecordCheck.getValue('custbody_sps_batched_print_com');
                            log.debug('execute', 'IF ' + tranId + ' - Requested batch print (from record): ' + requestedBatchPrint + ', SPS complete: ' + spsBatchPrintComplete);
                        } catch (e) {
                            log.error('execute', 'Error loading IF ' + tranId + ' to check fields: ' + e.toString());
                            // If we can't load it, skip to be safe
                            return;
                        }
                        
                        // Skip if already requested or already completed (might have been set by concurrent execution)
                        if (requestedBatchPrint === true || requestedBatchPrint === 'T') {
                            log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') already has requested_batch_print = true, skipping');
                            // Mark as processed so we don't check it again in this execution
                            processedIFIds[ifIdStr] = true;
                            return;
                        }
                        
                        if (spsBatchPrintComplete === true || spsBatchPrintComplete === 'T') {
                            log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') already has sps_batched_print_com = true, skipping');
                            processedIFIds[ifIdStr] = true;
                            return;
                        }
                        
                        // Process IF (both fields are false)
                        // Mark this IF as processed to prevent duplicates
                        processedIFIds[ifIdStr] = true;
                        
                        // Add to batch for scheduling (will set field after successful task submission)
                        ifIdsToSchedule.push({
                            ifId: ifId,
                            tranId: tranId,
                            entityId: entityId
                        });
                        processedCount++;
                        
                        log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') meets criteria, queued for scheduling. Queue size: ' + ifIdsToSchedule.length);
                        
                        // Schedule MR script when batch is full or at end
                        if (ifIdsToSchedule.length >= batchSize) {
                            log.debug('execute', 'Batch size reached (' + batchSize + '), scheduling MR tasks');
                            var scheduled = scheduleSpsMrBatchLabels(ifIdsToSchedule);
                            scheduledCount += scheduled;
                            log.debug('execute', 'Scheduled ' + scheduled + ' MR task(s) from batch. Total scheduled so far: ' + scheduledCount);
                            ifIdsToSchedule = [];
                        }
                    } catch (e) {
                        log.error('execute', 'Error processing IF ' + tranId + ' (ID: ' + ifId + '): ' + e.toString());
                        errorCount++;
                    }
                });
            }
            
            // Schedule any remaining IFs
            if (ifIdsToSchedule.length > 0) {
                log.debug('execute', 'Scheduling remaining ' + ifIdsToSchedule.length + ' IF(s) in final batch');
                var scheduled = scheduleSpsMrBatchLabels(ifIdsToSchedule);
                scheduledCount += scheduled;
                log.debug('execute', 'Final batch: Scheduled ' + scheduled + ' MR task(s)');
            }
            
            log.audit('execute', '=== SCHEDULED SCRIPT SUMMARY ===');
            log.audit('execute', 'Total IFs processed: ' + processedCount);
            log.audit('execute', 'Total MR scripts scheduled: ' + scheduledCount);
            log.audit('execute', 'Errors: ' + errorCount);
            log.debug('execute', 'Script execution complete. Remaining governance: ' + runtime.getCurrentScript().getRemainingUsage());
            
        } catch (e) {
            log.error('execute', 'Error running item fulfillment search: ' + e.toString());
            log.error('execute', 'Stack trace: ' + (e.stack || 'N/A'));
        }
    }
    
    /**
     * Schedules the SPS MR batch label script - ONE IF at a time
     * IMPORTANT: The SPS MR script only processes the FIRST IF in the array!
     * So we schedule one MR task per IF to ensure all IFs are processed.
     * Only sets custbody_requested_batch_print = true if task submission is successful (not failed).
     * 
     * @param {Array<Object>} ifDataArray - Array of objects with {ifId, tranId, entityId}
     * @returns {number} Number of successfully scheduled tasks
     */
    function scheduleSpsMrBatchLabels(ifDataArray) {
        if (!ifDataArray || ifDataArray.length === 0) {
            log.debug('scheduleSpsMrBatchLabels', 'No IF data provided to schedule');
            return 0;
        }
        
        log.debug('scheduleSpsMrBatchLabels', 'Starting to schedule ' + ifDataArray.length + ' MR task(s)');
        
        // NOTE: The SPS MR script only processes the FIRST IF in itemFulfillmentArr
        // So we must schedule one MR task per IF, not batch them
        var scheduledCount = 0;
        var errorCount = 0;
        var failedCount = 0;
        
        ifDataArray.forEach(function(ifData, index) {
            var ifId = ifData.ifId;
            var tranId = ifData.tranId || ifId;
            
            log.debug('scheduleSpsMrBatchLabels', 'Processing IF ' + (index + 1) + ' of ' + ifDataArray.length + ': ' + tranId + ' (ID: ' + ifId + ')');
            
            try {
                // Set the field IMMEDIATELY to prevent duplicate processing
                // This prevents the same IF from being picked up multiple times if the script runs concurrently
                // or if there's a delay between task submission and field update
                try {
                    var ifRecordUpdate = record.load({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId,
                        isDynamic: true
                    });
                    
                    // Double-check the field isn't already set (in case of race condition)
                    var currentValue = ifRecordUpdate.getValue('custbody_requested_batch_print');
                    if (currentValue === true || currentValue === 'T') {
                        log.debug('scheduleSpsMrBatchLabels', 'IF ' + tranId + ' (ID: ' + ifId + ') already has requested_batch_print = true, skipping to prevent duplicate');
                        return; // Skip this IF
                    }
                    
                    ifRecordUpdate.setValue({
                        fieldId: 'custbody_requested_batch_print',
                        value: true
                    });
                    
                    ifRecordUpdate.save({
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    });
                    
                    log.debug('scheduleSpsMrBatchLabels', 'Set requested_batch_print = true for IF ' + tranId + ' (ID: ' + ifId + ') to prevent duplicate processing');
                } catch (fieldError) {
                    log.error('scheduleSpsMrBatchLabels', 'Error setting requested_batch_print field for IF ' + tranId + ' (ID: ' + ifId + '): ' + fieldError.toString());
                    throw fieldError; // Don't proceed if we can't set the field
                }
                
                // Build the JSON parameter - only ONE IF per MR execution
                // Note: packageSource and packStructure can be undefined - MR script will handle defaults
                var jsonParam = JSON.stringify({
                    itemFulfillmentArr: [ifId],  // Array with single IF
                    maxLabelRequest: 75,  // Default value
                    packageSource: undefined,  // Will be determined by MR script if not provided
                    packStructure: undefined  // Will be determined by MR script if not provided
                });
                
                log.debug('scheduleSpsMrBatchLabels', 'JSON parameter for IF ' + tranId + ': ' + jsonParam);
                
                var mrScriptId = 'customscript_sps_mr_batch_label';
                // List of all available deployments to try (0-10 = 11 deployments)
                var mrDeployIds = [
                    'customdeploy_sps_mr_batch_label_0',
                    'customdeploy_sps_mr_batch_label_1',
                    'customdeploy_sps_mr_batch_label_2',
                    'customdeploy_sps_mr_batch_label_3',
                    'customdeploy_sps_mr_batch_label_4',
                    'customdeploy_sps_mr_batch_label_5',
                    'customdeploy_sps_mr_batch_label_6',
                    'customdeploy_sps_mr_batch_label_7',
                    'customdeploy_sps_mr_batch_label_8',
                    'customdeploy_sps_mr_batch_label_9',
                    'customdeploy_sps_mr_batch_label_10'
                ];
                
                // Try each deployment until one succeeds
                var taskId = null;
                var deploymentTried = 0;
                var allDeploymentsBusy = true;
                
                for (var d = 0; d < mrDeployIds.length && taskId === null; d++) {
                    var mrDeployId = mrDeployIds[d];
                    deploymentTried++;
                    
                    try {
                        log.debug('scheduleSpsMrBatchLabels', 'Trying deployment ' + mrDeployId + ' for IF ' + tranId + ' (attempt ' + deploymentTried + ' of ' + mrDeployIds.length + ')');
                        
                        var mrTask = task.create({
                            taskType: task.TaskType.MAP_REDUCE,
                            scriptId: mrScriptId,
                            deploymentId: mrDeployId,
                            params: {
                                custscript_sps_mr_batch_label_json: jsonParam
                            }
                        });
                        
                        taskId = mrTask.submit();
                        log.debug('scheduleSpsMrBatchLabels', 'MR task submitted for IF ' + tranId + ' using deployment ' + mrDeployId + '. Task ID: ' + taskId);
                        allDeploymentsBusy = false;
                        break; // Success, exit loop
                        
                    } catch (submitError) {
                        var errorName = submitError.name || '';
                        var errorMessage = submitError.message || submitError.toString();
                        
                        // Check if it's the MAP_REDUCE_ALREADY_RUNNING error
                        if (errorName === 'MAP_REDUCE_ALREADY_RUNNING' || errorMessage.indexOf('already running') >= 0) {
                            log.debug('scheduleSpsMrBatchLabels', 'Deployment ' + mrDeployId + ' is busy for IF ' + tranId + ', trying next deployment');
                            // Continue to next deployment
                            continue;
                        } else {
                            // Different error - log and try next deployment
                            log.debug('scheduleSpsMrBatchLabels', 'Error with deployment ' + mrDeployId + ' for IF ' + tranId + ': ' + errorMessage + '. Trying next deployment');
                            continue;
                        }
                    }
                }
                
                // If we tried all deployments and none worked
                if (!taskId) {
                    if (allDeploymentsBusy) {
                        throw new Error('All MR deployments are busy. Tried ' + deploymentTried + ' deployment(s).');
                    } else {
                        throw new Error('Failed to submit MR task after trying ' + deploymentTried + ' deployment(s)');
                    }
                }
                
                // Check task status immediately after submission
                // Field is already set upfront, so we just verify task status
                try {
                    log.debug('scheduleSpsMrBatchLabels', 'Checking task status for task ' + taskId);
                    var taskStatus = task.checkStatus({
                        taskId: taskId
                    });
                    
                    log.debug('scheduleSpsMrBatchLabels', 'Task ' + taskId + ' status: ' + taskStatus.status);
                    
                    if (taskStatus.status !== task.TaskStatus.FAILED) {
                        // Task was successfully submitted (PENDING, PROCESSING, or COMPLETE)
                        // Field already set upfront, so no need to set again
                        scheduledCount++;
                        log.debug('scheduleSpsMrBatchLabels', 'Successfully scheduled MR task ' + taskId + ' for IF ' + tranId + ' (ID: ' + ifId + '). Status: ' + taskStatus.status + '. Field already set.');
                        
                        // Add time tracker line for batch print label
                        // Action ID 8 = "Batch & upload labels" (8th action in the list) - Employee 5
                        try {
                            var entityId = ifData.entityId;
                            if (entityId) {
                                timeTrackerLib.addTimeTrackerLine({
                                    actionId: 8, // Batch & upload labels action ID
                                    customerId: entityId,
                                    timeSaved: 40, // 40 seconds
                                    employeeId: 5
                                });
                                log.debug('Time Tracker - Batch Print Label', 'Added time tracker line for employee 5, action 8, IF: ' + tranId);
                            } else {
                                log.debug('Time Tracker', 'Skipping time tracker - no customer ID found on IF: ' + tranId);
                            }
                        } catch (timeTrackerError) {
                            // Log error but don't fail the scheduling
                            log.error('Time Tracker Error - Batch Print Label', 'Failed to add time tracker line for IF ' + tranId + ': ' + timeTrackerError.toString());
                        }
                    } else {
                        // Task failed immediately - reset the field so it can be retried
                        failedCount++;
                        log.error('scheduleSpsMrBatchLabels', 'MR task ' + taskId + ' for IF ' + tranId + ' (ID: ' + ifId + ') failed immediately. Status: ' + taskStatus.status + '. Resetting field for retry.');
                        try {
                            var ifRecordReset = record.load({
                                type: record.Type.ITEM_FULFILLMENT,
                                id: ifId,
                                isDynamic: true
                            });
                            ifRecordReset.setValue({
                                fieldId: 'custbody_requested_batch_print',
                                value: false
                            });
                            ifRecordReset.save({
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            });
                            log.debug('scheduleSpsMrBatchLabels', 'Reset requested_batch_print field for IF ' + tranId + ' to allow retry');
                        } catch (resetError) {
                            log.error('scheduleSpsMrBatchLabels', 'Error resetting field for IF ' + tranId + ': ' + resetError.toString());
                        }
                    }
                } catch (statusError) {
                    // If we can't check status, assume it's pending/processing
                    // Field already set upfront, so no need to set again
                    scheduledCount++;
                    log.debug('scheduleSpsMrBatchLabels', 'Could not check task status for ' + taskId + ', but task was submitted. Assuming success. Field already set. Error: ' + statusError.toString());
                    
                    // Add time tracker line for batch print label (assuming success)
                    // Action ID 8 = "Batch & upload labels" (8th action in the list) - Employee 5
                    try {
                        var entityId = ifData.entityId;
                        if (entityId) {
                            timeTrackerLib.addTimeTrackerLine({
                                actionId: 8, // Batch & upload labels action ID
                                customerId: entityId,
                                timeSaved: 40, // 40 seconds
                                employeeId: 5
                            });
                            log.debug('Time Tracker - Batch Print Label', 'Added time tracker line for employee 5, action 8, IF: ' + tranId + ' (status check failed but task submitted)');
                        } else {
                            log.debug('Time Tracker', 'Skipping time tracker - no customer ID found on IF: ' + tranId);
                        }
                    } catch (timeTrackerError) {
                        // Log error but don't fail the scheduling
                        log.error('Time Tracker Error - Batch Print Label', 'Failed to add time tracker line for IF ' + tranId + ': ' + timeTrackerError.toString());
                    }
                }
                
            } catch (e) {
                // Task submission failed
                errorCount++;
                var errorName = e.name || '';
                var errorMessage = e.message || e.toString();
                var isAllDeploymentsBusy = errorMessage.indexOf('All MR deployments are busy') >= 0 || 
                                          errorMessage.indexOf('already running') >= 0 ||
                                          errorName === 'MAP_REDUCE_ALREADY_RUNNING';
                
                // Reset the field so it can be retried on the next scheduled run
                // This allows the scheduled script to keep trying until a deployment becomes available
                try {
                    var ifRecordReset = record.load({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId,
                        isDynamic: true
                    });
                    ifRecordReset.setValue({
                        fieldId: 'custbody_requested_batch_print',
                        value: false
                    });
                    ifRecordReset.save({
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    });
                    
                    if (isAllDeploymentsBusy) {
                        log.debug('scheduleSpsMrBatchLabels', 'All MR deployments busy for IF ' + tranId + ' (ID: ' + ifId + '). Field reset - will retry on next scheduled run when capacity is available.');
                    } else {
                        log.debug('scheduleSpsMrBatchLabels', 'Reset requested_batch_print field for IF ' + tranId + ' due to submission failure - will retry on next run');
                    }
                } catch (resetError) {
                    log.error('scheduleSpsMrBatchLabels', 'Error resetting field for IF ' + tranId + ' after submission failure: ' + resetError.toString());
                }
                
                if (isAllDeploymentsBusy) {
                    log.debug('scheduleSpsMrBatchLabels', 'All MR deployments are busy for IF ' + tranId + ' (ID: ' + ifId + '). Will retry on next scheduled run when a deployment becomes available.');
                } else {
                    log.error('scheduleSpsMrBatchLabels', 'Error scheduling MR script for IF ' + tranId + ' (ID: ' + ifId + '): ' + e.toString());
                    log.error('scheduleSpsMrBatchLabels', 'Stack trace: ' + (e.stack || 'N/A'));
                }
            }
        });
        
        log.audit('scheduleSpsMrBatchLabels', 'Scheduled ' + scheduledCount + ' MR task(s) for ' + ifDataArray.length + ' IF(s). Errors: ' + errorCount + ', Failed: ' + failedCount);
        log.debug('scheduleSpsMrBatchLabels', 'Function complete. Remaining governance: ' + runtime.getCurrentScript().getRemainingUsage());
        return scheduledCount;
    }
    
    return {
        execute: execute
    };
});

