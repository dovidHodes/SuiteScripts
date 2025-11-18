/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * 
 * Scheduled script to find Item Fulfillments that need batch and attach processing
 * (merging SPS label PDFs into one file).
 * 
 * Search criteria:
 * - custbody_sps_batched_print_com = true (labels are complete)
 * - custbody_requested_batch_and_attach = false (not yet requested)
 * - Entity has custentity_auto_batch_print = true
 * 
 * Sets custbody_requested_batch_and_attach = true only after MR task is successfully submitted.
 */

define(['N/search', 'N/log', 'N/record', 'N/task', 'N/runtime'], function (search, log, record, task, runtime) {
    
    /**
     * Executes when the scheduled script is triggered
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed
     */
    function execute(scriptContext) {
        log.audit('execute', 'Starting scheduled script to schedule batch and attach MR');
        
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
        
        // Build search filters - search for IFs with labels complete but not yet requested for batch and attach
        log.debug('execute', 'Step 2: Creating IF search with ' + entityIds.length + ' entity/ies');
        
        var ifSearch = search.create({
            type: search.Type.ITEM_FULFILLMENT,
            filters: [
                ['mainline', 'is', 'T'],  // Only get header records, not line items
                'AND',
                ['custbody_sps_batched_print_com', 'is', 'T'],
                'AND',
                ['custbody_requested_batch_and_attach', 'is', 'F'],
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
        
        // Add summary to ensure we only get unique IFs
        ifSearch.resultColumns = [
            search.createColumn({
                name: 'internalid',
                summary: search.Summary.GROUP
            })
        ];
        
        log.debug('execute', 'IF search created successfully');
        
        // Process results in batches to avoid governance issues
        var batchSize = 50; // Process 50 IFs at a time
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
                        
                        // Check if we've already processed this IF in this execution - CHECK FIRST
                        if (processedIFIds[ifIdStr]) {
                            log.debug('execute', 'TranID: ' + tranId + ' - Already processed in this execution, skipping duplicate');
                            return; // Skip this iteration
                        }
                        
                        // Mark as processed IMMEDIATELY to prevent duplicate processing
                        processedIFIds[ifIdStr] = true;
                        
                        log.debug('execute', 'TranID: ' + tranId + ' - Processing IF (ID: ' + ifId + '), Entity: ' + entityId);
                        
                        // Double-check requested_batch_and_attach field by loading the record
                        var requestedBatchAndAttach = false;
                        try {
                            var ifRecordCheck = record.load({
                                type: record.Type.ITEM_FULFILLMENT,
                                id: ifId,
                                isDynamic: false
                            });
                            requestedBatchAndAttach = ifRecordCheck.getValue('custbody_requested_batch_and_attach');
                            log.debug('execute', 'TranID: ' + tranId + ' - Requested batch and attach field value: ' + requestedBatchAndAttach);
                        } catch (e) {
                            log.error('execute', 'TranID: ' + tranId + ' - Error loading IF to check requested_batch_and_attach: ' + e.toString());
                            return;
                        }
                        
                        // Skip if already requested (might have been set by concurrent execution)
                        if (requestedBatchAndAttach === true || requestedBatchAndAttach === 'T') {
                            log.debug('execute', 'TranID: ' + tranId + ' - Already has requested_batch_and_attach = true, skipping');
                            return;
                        }
                        
                        // Process IF (requested_batch_and_attach is false)
                        // Add to batch for scheduling
                        ifIdsToSchedule.push({
                            ifId: ifId,
                            tranId: tranId,
                            entityId: entityId
                        });
                        processedCount++;
                        
                        log.debug('execute', 'TranID: ' + tranId + ' - Meets criteria, queued for scheduling. Queue size: ' + ifIdsToSchedule.length);
                        
                        // Schedule MR script when batch is full or at end
                        if (ifIdsToSchedule.length >= batchSize) {
                            log.debug('execute', 'Batch size reached (' + batchSize + '), scheduling MR tasks for ' + ifIdsToSchedule.length + ' IF(s)');
                            var scheduled = scheduleBatchAndAttachMR(ifIdsToSchedule);
                            scheduledCount += scheduled;
                            log.debug('execute', 'Scheduled ' + scheduled + ' MR task(s) from batch. Total scheduled so far: ' + scheduledCount);
                            ifIdsToSchedule = [];
                        }
                    } catch (e) {
                        log.error('execute', 'TranID: ' + tranId + ' - Error processing IF: ' + e.toString());
                        errorCount++;
                    }
                });
            }
            
            // Schedule any remaining IFs
            if (ifIdsToSchedule.length > 0) {
                log.debug('execute', 'Scheduling remaining ' + ifIdsToSchedule.length + ' IF(s) in final batch');
                var scheduled = scheduleBatchAndAttachMR(ifIdsToSchedule);
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
     * Schedules the batch and attach MR script for each IF
     * Sets custbody_requested_batch_and_attach = true only after MR task is successfully submitted
     * @param {Array<Object>} ifDataArray - Array of objects with {ifId, tranId, entityId}
     * @returns {number} Number of successfully scheduled tasks
     */
    function scheduleBatchAndAttachMR(ifDataArray) {
        if (!ifDataArray || ifDataArray.length === 0) {
            log.debug('scheduleBatchAndAttachMR', 'No IF data provided to schedule');
            return 0;
        }
        
        log.debug('scheduleBatchAndAttachMR', 'Starting to schedule ' + ifDataArray.length + ' MR task(s)');
        
        var scheduledCount = 0;
        var errorCount = 0;
        var failedCount = 0;
        
        ifDataArray.forEach(function(ifData, index) {
            var ifId = ifData.ifId;
            var tranId = ifData.tranId || ifId;
            
            log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Processing IF ' + (index + 1) + ' of ' + ifDataArray.length + ' (ID: ' + ifId + ')');
            
            try {
                // Set the field IMMEDIATELY to prevent duplicate processing
                try {
                    log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Loading IF record to set requested_batch_and_attach field');
                    var ifRecordUpdate = record.load({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId,
                        isDynamic: true
                    });
                    
                    // Double-check the field isn't already set
                    var currentValue = ifRecordUpdate.getValue('custbody_requested_batch_and_attach');
                    if (currentValue === true || currentValue === 'T') {
                        log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Already has requested_batch_and_attach = true, skipping');
                        return; // Skip this IF
                    }
                    
                    ifRecordUpdate.setValue({
                        fieldId: 'custbody_requested_batch_and_attach',
                        value: true
                    });
                    
                    ifRecordUpdate.save({
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    });
                    
                    log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Set requested_batch_and_attach = true to prevent duplicate processing');
                } catch (fieldError) {
                    log.error('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Error setting requested_batch_and_attach field: ' + fieldError.toString());
                    throw fieldError;
                }
                
                // Build JSON parameter
                var jsonParam = JSON.stringify({
                    itemFulfillmentId: ifId
                });
                
                log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Built JSON parameter: ' + jsonParam);
                
                var mrScriptId = 'customscript_mr_merge_and_link_labels';
                // List of all available deployments to try (7 deployments)
                var mrDeployIds = [
                    'customdeploy1',
                    'customdeploy2',
                    'customdeploy3',
                    'customdeploy4',
                    'customdeploy5',
                    'customdeploy6',
                    'customdeploy7'
                ];
                
                log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Attempting to schedule MR script with ' + mrDeployIds.length + ' deployment(s)');
                
                // Try each deployment until one succeeds
                var taskId = null;
                var deploymentTried = 0;
                var allDeploymentsBusy = true;
                
                for (var d = 0; d < mrDeployIds.length && taskId === null; d++) {
                    var mrDeployId = mrDeployIds[d];
                    deploymentTried++;
                    
                    try {
                        log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Trying deployment ' + mrDeployId + ' (attempt ' + deploymentTried + ' of ' + mrDeployIds.length + ')');
                        
                        var mrTask = task.create({
                            taskType: task.TaskType.MAP_REDUCE,
                            scriptId: mrScriptId,
                            deploymentId: mrDeployId,
                            params: {
                                custscript_mr_merge_json: jsonParam
                            }
                        });
                        
                        taskId = mrTask.submit();
                        log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - MR task submitted successfully using deployment ' + mrDeployId + '. Task ID: ' + taskId);
                        allDeploymentsBusy = false;
                        break; // Success, exit loop
                        
                    } catch (submitError) {
                        var errorName = submitError.name || '';
                        var errorMessage = submitError.message || submitError.toString();
                        
                        // Check if it's the MAP_REDUCE_ALREADY_RUNNING error
                        if (errorName === 'MAP_REDUCE_ALREADY_RUNNING' || errorMessage.indexOf('already running') >= 0) {
                            log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Deployment ' + mrDeployId + ' is busy, trying next deployment');
                            // Continue to next deployment
                            continue;
                        } else {
                            // Different error - log and try next deployment
                            log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Error with deployment ' + mrDeployId + ': ' + errorMessage + '. Trying next deployment');
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
                
                // Check task status
                try {
                    log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Checking task status for task ' + taskId);
                    var taskStatus = task.checkStatus({
                        taskId: taskId
                    });
                    
                    log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Task ' + taskId + ' status: ' + taskStatus.status);
                    
                    if (taskStatus.status !== task.TaskStatus.FAILED) {
                        scheduledCount++;
                        log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Successfully scheduled MR task ' + taskId + '. Status: ' + taskStatus.status);
                    } else {
                        failedCount++;
                        log.error('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - MR task ' + taskId + ' failed immediately. Resetting field for retry.');
                        // Reset field for retry
                        try {
                            var ifRecordReset = record.load({
                                type: record.Type.ITEM_FULFILLMENT,
                                id: ifId,
                                isDynamic: true
                            });
                            ifRecordReset.setValue({
                                fieldId: 'custbody_requested_batch_and_attach',
                                value: false
                            });
                            ifRecordReset.save({
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            });
                            log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Reset requested_batch_and_attach field for IF ' + tranId + ' to allow retry');
                        } catch (resetError) {
                            log.error('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Error resetting field for IF ' + tranId + ': ' + resetError.toString());
                        }
                    }
                } catch (statusError) {
                    scheduledCount++;
                    log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Could not check task status for ' + taskId + ', but task was submitted. Assuming success.');
                }
                
            } catch (e) {
                errorCount++;
                var errorName = e.name || '';
                var errorMessage = e.message || e.toString();
                
                log.error('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Error scheduling MR script: ' + errorMessage);
                
                // Reset the field so it can be retried on the next scheduled run
                try {
                    var ifRecordReset = record.load({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId,
                        isDynamic: true
                    });
                    ifRecordReset.setValue({
                        fieldId: 'custbody_requested_batch_and_attach',
                        value: false
                    });
                    ifRecordReset.save({
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    });
                    log.debug('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Reset requested_batch_and_attach field for IF ' + tranId + ' due to submission failure - will retry on next run');
                } catch (resetError) {
                    log.error('scheduleBatchAndAttachMR', 'TranID: ' + tranId + ' - Error resetting field for IF ' + tranId + ' after submission failure: ' + resetError.toString());
                }
            }
        });
        
        log.audit('scheduleBatchAndAttachMR', 'Scheduled ' + scheduledCount + ' MR task(s) for ' + ifDataArray.length + ' IF(s). Errors: ' + errorCount + ', Failed: ' + failedCount);
        log.debug('scheduleBatchAndAttachMR', 'Function complete. Remaining governance: ' + runtime.getCurrentScript().getRemainingUsage());
        return scheduledCount;
    }
    
    return {
        execute: execute
    };
});

