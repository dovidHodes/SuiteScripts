/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * 
 * Scheduled script to find Item Fulfillments that need autopack and schedule the SPS MR autopack script.
 * Search criteria:
 * - custbody_requested_autopack = false
 * - Entity has custentity_auto_create_packages = true
 * - Created date after November 1, 2025
 * - If entity has custentity_needs_routing = true, then custbody_routing_status must be 3
 *   Otherwise, routing status is not required
 * 
 * Sets custbody_requested_autopack = true only after MR task is successfully submitted (not failed).
 */

define(['N/search', 'N/log', 'N/record', 'N/task', 'N/runtime'], function (search, log, record, task, runtime) {
    
    /**
     * Executes when the scheduled script is triggered
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed
     */
    function execute(scriptContext) {
        log.audit('execute', 'Starting scheduled script to schedule SPS autopack');
        
        // First, search for entities where custentity_auto_create_packages = true
        // Also get custentity_needs_routing to determine routing status requirement
        var entityMap = {}; // Map of entityId -> {needsRouting: true/false}
        var entityIds = [];
        try {
            log.debug('execute', 'Step 1: Searching for entities with custentity_auto_create_packages = true');
            var entitySearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['custentity_auto_create_packages', 'is', 'T']
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid'
                    }),
                    search.createColumn({
                        name: 'custentity_needs_routing'
                    })
                ]
            });
            
            var entitySearchResults = entitySearch.run();
            entitySearchResults.each(function(result) {
                var entityId = result.id;
                var needsRouting = result.getValue('custentity_needs_routing') === 'T';
                entityIds.push(entityId);
                entityMap[entityId] = { needsRouting: needsRouting };
                log.debug('execute', 'Entity ' + entityId + ' - needs_routing: ' + needsRouting);
                return true;
            });
            
            log.debug('execute', 'Found ' + entityIds.length + ' entity/ies with custentity_auto_create_packages = true');
            log.debug('execute', 'Entity IDs: ' + entityIds.join(', '));
            if (entityIds.length === 0) {
                log.audit('execute', 'No entities found with custentity_auto_create_packages = true, exiting');
                return;
            }
        } catch (e) {
            log.error('execute', 'Error searching for entities: ' + e.toString());
            return;
        }
        
        // Build search filters - routing status is conditional based on entity needs_routing flag
        // We'll search for IFs with requested_autopack = false and entity in our list
        // Then filter by routing status in the processing loop based on entity needs_routing
        // Only process IFs created after November 1, 2025
        log.debug('execute', 'Step 2: Creating IF search with ' + entityIds.length + ' entity/ies');
        // Use string date format for NetSuite search: MM/DD/YYYY
        var cutoffDateStr = '11/01/2025';
        log.debug('execute', 'Date filter: Only processing IFs with trandate after ' + cutoffDateStr);
        
        var ifSearch = search.create({
            type: search.Type.ITEM_FULFILLMENT,
            filters: [
                ['custbody_requested_autopack', 'is', 'F'],
                'AND',
                ['entity', 'anyof', entityIds],
                'AND',
                ['trandate', search.Operator.AFTER, cutoffDateStr]
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
                }),
                search.createColumn({
                    name: 'custbody_routing_status'
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
                        
                        // Get entity info to check routing requirement
                        var entityInfo = entityMap[entityId];
                        if (!entityInfo) {
                            log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') entity ' + entityId + ' not in map, skipping');
                            return; // Skip this iteration
                        }
                        
                        log.debug('execute', 'IF ' + tranId + ' - Entity needs_routing: ' + entityInfo.needsRouting);
                        
                        // Get routing status from search result
                        var routingStatus = result.getValue('custbody_routing_status');
                        var requestedAutopack = result.getValue('custbody_requested_autopack');
                        
                        log.debug('execute', 'IF ' + tranId + ' - Routing status: ' + routingStatus + ', Requested autopack: ' + requestedAutopack);
                        
                        // Check routing status requirement based on entity needs_routing flag
                        var routingStatusValid = true;
                        if (entityInfo.needsRouting) {
                            // Entity requires routing, so routing status must be 3
                            routingStatusValid = (routingStatus === '3' || routingStatus === 3);
                            log.debug('execute', 'IF ' + tranId + ' - Entity requires routing, status check: ' + routingStatusValid + ' (status=' + routingStatus + ')');
                            if (!routingStatusValid) {
                                log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') entity requires routing but status is ' + routingStatus + ', skipping');
                            }
                        } else {
                            // Entity doesn't require routing, so routing status doesn't matter
                            routingStatusValid = true;
                            log.debug('execute', 'IF ' + tranId + ' - Entity does not require routing, status check passed');
                        }
                        
                        if (routingStatusValid && requestedAutopack !== 'T') {
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
                                var scheduled = scheduleSpsMrAutopack(ifIdsToSchedule);
                                scheduledCount += scheduled;
                                log.debug('execute', 'Scheduled ' + scheduled + ' MR task(s) from batch. Total scheduled so far: ' + scheduledCount);
                                ifIdsToSchedule = [];
                            }
                        } else {
                            log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') does not meet criteria. routingStatusValid: ' + routingStatusValid + ', requestedAutopack: ' + requestedAutopack);
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
                var scheduled = scheduleSpsMrAutopack(ifIdsToSchedule);
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
     * Schedules the SPS MR autopack script - ONE IF at a time
     * IMPORTANT: The SPS MR script only processes the FIRST IF in the array!
     * So we schedule one MR task per IF to ensure all IFs are processed.
     * Only sets custbody_requested_autopack = true if task submission is successful (not failed).
     * 
     * @param {Array<Object>} ifDataArray - Array of objects with {ifId, tranId, entityId}
     * @returns {number} Number of successfully scheduled tasks
     */
    function scheduleSpsMrAutopack(ifDataArray) {
        if (!ifDataArray || ifDataArray.length === 0) {
            log.debug('scheduleSpsMrAutopack', 'No IF data provided to schedule');
            return 0;
        }
        
        log.debug('scheduleSpsMrAutopack', 'Starting to schedule ' + ifDataArray.length + ' MR task(s)');
        
        // NOTE: The SPS MR script only processes the FIRST IF in itemFulfillmentArr
        // So we must schedule one MR task per IF, not batch them
        var scheduledCount = 0;
        var errorCount = 0;
        var failedCount = 0;
        
        ifDataArray.forEach(function(ifData, index) {
            var ifId = ifData.ifId;
            var tranId = ifData.tranId || ifId;
            
            log.debug('scheduleSpsMrAutopack', 'Processing IF ' + (index + 1) + ' of ' + ifDataArray.length + ': ' + tranId + ' (ID: ' + ifId + ')');
            
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
                    var currentValue = ifRecordUpdate.getValue('custbody_requested_autopack');
                    if (currentValue === true || currentValue === 'T') {
                        log.debug('scheduleSpsMrAutopack', 'IF ' + tranId + ' (ID: ' + ifId + ') already has requested_autopack = true, skipping to prevent duplicate');
                        return; // Skip this IF
                    }
                    
                    ifRecordUpdate.setValue({
                        fieldId: 'custbody_requested_autopack',
                        value: true
                    });
                    
                    ifRecordUpdate.save({
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    });
                    
                    log.debug('scheduleSpsMrAutopack', 'Set requested_autopack = true for IF ' + tranId + ' (ID: ' + ifId + ') to prevent duplicate processing');
                } catch (fieldError) {
                    log.error('scheduleSpsMrAutopack', 'Error setting requested_autopack field for IF ' + tranId + ' (ID: ' + ifId + '): ' + fieldError.toString());
                    throw fieldError; // Don't proceed if we can't set the field
                }
                
                // Build the JSON parameter - only ONE IF per MR execution
                var jsonParam = JSON.stringify({
                    itemFulfillmentArr: [ifId]  // Array with single IF
                });
                
                log.debug('scheduleSpsMrAutopack', 'JSON parameter for IF ' + tranId + ': ' + jsonParam);
                
                var mrScriptId = 'customscript_sps_mr_auto_pack_2x';
                var mrDeployId = 'customdeploy_sps_mr_auto_pack_2x_9';
                
                log.debug('scheduleSpsMrAutopack', 'Creating MR task for IF ' + tranId + ' with script: ' + mrScriptId + ', deploy: ' + mrDeployId);
                
                // Create the MapReduce task - ONE per IF
                var mrTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: mrScriptId,
                    deploymentId: mrDeployId,
                    params: {
                        custscript_sps_mr_autopack_json: jsonParam
                    }
                });
                
                log.debug('scheduleSpsMrAutopack', 'Submitting MR task for IF ' + tranId);
                var taskId = null;
                var submissionAttempts = 0;
                var maxRetries = 2;
                var retryDelay = 2000; // 2 seconds delay between retries
                
                // Try to submit with retry logic for MAP_REDUCE_ALREADY_RUNNING errors
                while (submissionAttempts <= maxRetries && taskId === null) {
                    try {
                        taskId = mrTask.submit();
                        log.debug('scheduleSpsMrAutopack', 'MR task submitted for IF ' + tranId + '. Task ID: ' + taskId);
                        break; // Success, exit retry loop
                    } catch (submitError) {
                        submissionAttempts++;
                        var errorName = submitError.name || '';
                        var errorMessage = submitError.message || submitError.toString();
                        
                        // Check if it's the MAP_REDUCE_ALREADY_RUNNING error
                        if (errorName === 'MAP_REDUCE_ALREADY_RUNNING' || errorMessage.indexOf('already running') >= 0) {
                            if (submissionAttempts <= maxRetries) {
                                log.debug('scheduleSpsMrAutopack', 'MR task already running for IF ' + tranId + '. Retry attempt ' + submissionAttempts + ' of ' + maxRetries + ' after ' + retryDelay + 'ms delay');
                                // Wait before retrying (using a simple loop since we can't use setTimeout in scheduled scripts)
                                var startTime = new Date().getTime();
                                while (new Date().getTime() - startTime < retryDelay) {
                                    // Busy wait - not ideal but necessary in scheduled scripts
                                }
                                // Recreate the task for retry
                                mrTask = task.create({
                                    taskType: task.TaskType.MAP_REDUCE,
                                    scriptId: mrScriptId,
                                    deploymentId: mrDeployId,
                                    params: {
                                        custscript_sps_mr_autopack_json: jsonParam
                                    }
                                });
                            } else {
                                // Max retries reached
                                log.debug('scheduleSpsMrAutopack', 'MR task still running after ' + maxRetries + ' retries for IF ' + tranId + '. Will retry on next scheduled run.');
                                throw submitError; // Re-throw to be caught by outer catch
                            }
                        } else {
                            // Different error, don't retry
                            throw submitError;
                        }
                    }
                }
                
                // If we still don't have a taskId, throw error
                if (!taskId) {
                    throw new Error('Failed to submit MR task after ' + maxRetries + ' retries');
                }
                
                // Check task status immediately after submission
                // Field is already set upfront, so we just verify task status
                try {
                    log.debug('scheduleSpsMrAutopack', 'Checking task status for task ' + taskId);
                    var taskStatus = task.checkStatus({
                        taskId: taskId
                    });
                    
                    log.debug('scheduleSpsMrAutopack', 'Task ' + taskId + ' status: ' + taskStatus.status);
                    
                    if (taskStatus.status !== task.TaskStatus.FAILED) {
                        // Task was successfully submitted (PENDING, PROCESSING, or COMPLETE)
                        // Field already set upfront, so no need to set again
                        scheduledCount++;
                        log.debug('scheduleSpsMrAutopack', 'Successfully scheduled MR task ' + taskId + ' for IF ' + tranId + ' (ID: ' + ifId + '). Status: ' + taskStatus.status + '. Field already set.');
                    } else {
                        // Task failed immediately - reset the field so it can be retried
                        failedCount++;
                        log.error('scheduleSpsMrAutopack', 'MR task ' + taskId + ' for IF ' + tranId + ' (ID: ' + ifId + ') failed immediately. Status: ' + taskStatus.status + '. Resetting field for retry.');
                        try {
                            var ifRecordReset = record.load({
                                type: record.Type.ITEM_FULFILLMENT,
                                id: ifId,
                                isDynamic: true
                            });
                            ifRecordReset.setValue({
                                fieldId: 'custbody_requested_autopack',
                                value: false
                            });
                            ifRecordReset.save({
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            });
                            log.debug('scheduleSpsMrAutopack', 'Reset requested_autopack field for IF ' + tranId + ' to allow retry');
                        } catch (resetError) {
                            log.error('scheduleSpsMrAutopack', 'Error resetting field for IF ' + tranId + ': ' + resetError.toString());
                        }
                    }
                } catch (statusError) {
                    // If we can't check status, assume it's pending/processing
                    // Field already set upfront, so no need to set again
                    scheduledCount++;
                    log.debug('scheduleSpsMrAutopack', 'Could not check task status for ' + taskId + ', but task was submitted. Assuming success. Field already set. Error: ' + statusError.toString());
                }
                
            } catch (e) {
                // Task submission failed - reset the field so it can be retried
                errorCount++;
                var errorName = e.name || '';
                var errorMessage = e.message || e.toString();
                
                // Reset the field since task submission failed
                try {
                    var ifRecordReset = record.load({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId,
                        isDynamic: true
                    });
                    ifRecordReset.setValue({
                        fieldId: 'custbody_requested_autopack',
                        value: false
                    });
                    ifRecordReset.save({
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    });
                    log.debug('scheduleSpsMrAutopack', 'Reset requested_autopack field for IF ' + tranId + ' due to submission failure - will retry on next run');
                } catch (resetError) {
                    log.error('scheduleSpsMrAutopack', 'Error resetting field for IF ' + tranId + ' after submission failure: ' + resetError.toString());
                }
                
                if (errorName === 'MAP_REDUCE_ALREADY_RUNNING' || errorMessage.indexOf('already running') >= 0) {
                    log.debug('scheduleSpsMrAutopack', 'MR script already running for IF ' + tranId + ' (ID: ' + ifId + '). Field reset - will retry on next scheduled run.');
                } else {
                    log.error('scheduleSpsMrAutopack', 'Error scheduling MR script for IF ' + tranId + ' (ID: ' + ifId + '): ' + e.toString());
                    log.error('scheduleSpsMrAutopack', 'Stack trace: ' + (e.stack || 'N/A'));
                }
                log.error('scheduleSpsMrAutopack', 'Field reset - IF can be retried on next run');
            }
        });
        
        log.audit('scheduleSpsMrAutopack', 'Scheduled ' + scheduledCount + ' MR task(s) for ' + ifDataArray.length + ' IF(s). Errors: ' + errorCount + ', Failed: ' + failedCount);
        log.debug('scheduleSpsMrAutopack', 'Function complete. Remaining governance: ' + runtime.getCurrentScript().getRemainingUsage());
        return scheduledCount;
    }
    
    return {
        execute: execute
    };
});

