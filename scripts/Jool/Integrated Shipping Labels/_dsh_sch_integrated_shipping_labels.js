/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * 
 * Scheduled script to find Item Fulfillments that need integrated shipping labels
 * and schedule the Map/Reduce script for processing.
 * 
 * Search criteria:
 * - Entity has custentity_create_packages_integrated = true
 * - If entity has custentity_needs_routing = true, only when custbody_routing_status = 3 (routing received)
 * - SCAC must be in custentity_is_small_parcel list (opposite of BOL logic)
 * - custbody_requested_integrated_packages = false
 * 
 * Sets custbody_requested_integrated_packages = true when scheduling MR.
 */

define(['N/search', 'N/log', 'N/record', 'N/task', 'N/runtime'], function (search, log, record, task, runtime) {
    
    /**
     * Executes when the scheduled script is triggered
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed
     */
    function execute(scriptContext) {
        log.audit('execute', 'Starting scheduled script to schedule integrated shipping labels');
        
        // Step 1: Search for entities where custentity_create_packages_integrated = true
        var entityIds = [];
        try {
            log.debug('execute', 'Step 1: Searching for entities with custentity_create_packages_integrated = true');
            var entitySearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['custentity_create_packages_integrated', 'is', 'T']
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
            
            log.debug('execute', 'Found ' + entityIds.length + ' entity/ies with custentity_create_packages_integrated = true');
            if (entityIds.length === 0) {
                log.audit('execute', 'No entities found with custentity_create_packages_integrated = true, exiting');
                return;
            }
        } catch (e) {
            log.error('execute', 'Error searching for entities: ' + e.toString());
            return;
        }
        
        // Step 2: Search for IFs with required criteria
        log.debug('execute', 'Step 2: Creating IF search with ' + entityIds.length + ' entity/ies');
        
        var ifSearch = search.create({
            type: search.Type.ITEM_FULFILLMENT,
            filters: [
                ['mainline', 'is', 'T'],  // Only get header records, not line items
                'AND',
                ['custbody_requested_integrated_packages', 'is', 'F'],
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
                }),
                search.createColumn({
                    name: 'custbody_sps_carrieralphacode'
                }),
                search.createColumn({
                    name: 'custbody_routing_status'
                })
            ]
        });
        log.debug('execute', 'IF search created successfully');
        
        // Step 3: Process results and validate additional criteria
        var processedCount = 0;
        var scheduledCount = 0;
        var errorCount = 0;
        var skippedCount = 0;
        var ifIdsToSchedule = [];
        var processedIFIds = {}; // Track processed IF IDs to prevent duplicates
        
        try {
            log.debug('execute', 'Step 3: Running IF search and validating criteria');
            var pagedData = ifSearch.runPaged({ pageSize: 1000 });
            var pageRange = pagedData.pageRanges;
            
            log.audit('execute', 'Found ' + pagedData.count + ' item fulfillment(s) matching initial criteria');
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
                    var scac = result.getValue('custbody_sps_carrieralphacode') || '';
                    var routingStatus = result.getValue('custbody_routing_status');
                    
                    try {
                        // Convert to string for consistent comparison
                        var ifIdStr = String(ifId);
                        
                        // Check if we've already processed this IF in this execution
                        if (processedIFIds[ifIdStr]) {
                            log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') already processed in this execution, skipping duplicate');
                            return; // Skip this iteration
                        }
                        
                        log.debug('execute', 'Processing IF: ' + tranId + ' (ID: ' + ifId + '), Entity: ' + entityId + ', SCAC: ' + scac);
                        
                        // Double-check requested field by loading the record
                        var requestedIntegratedPackages = false;
                        try {
                            var ifRecordCheck = record.load({
                                type: record.Type.ITEM_FULFILLMENT,
                                id: ifId,
                                isDynamic: false
                            });
                            requestedIntegratedPackages = ifRecordCheck.getValue('custbody_requested_integrated_packages');
                            log.debug('execute', 'IF ' + tranId + ' - Requested integrated packages (from record): ' + requestedIntegratedPackages);
                        } catch (e) {
                            log.error('execute', 'Error loading IF ' + tranId + ' to check requested_integrated_packages: ' + e.toString());
                            return;
                        }
                        
                        // Skip if already requested
                        if (requestedIntegratedPackages === true || requestedIntegratedPackages === 'T') {
                            log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') already has requested_integrated_packages = true, skipping');
                            processedIFIds[ifIdStr] = true;
                            return;
                        }
                        
                        // Load customer record to check additional criteria
                        try {
                            var customerRecord = record.load({
                                type: record.Type.CUSTOMER,
                                id: entityId,
                                isDynamic: false
                            });
                            
                            // Check if entity needs routing - if yes, verify routing_status = 3
                            var needsRouting = customerRecord.getValue('custentity_needs_routing');
                            if (needsRouting === true || needsRouting === 'T') {
                                log.debug('execute', 'Entity ' + entityId + ' needs routing, checking routing_status');
                                // Convert to number for comparison (handles both string "3" and number 3)
                                var routingStatusNum = parseInt(routingStatus, 10);
                                log.debug('execute', 'IF ' + tranId + ' - routing_status value: ' + routingStatus + ' (type: ' + typeof routingStatus + '), as number: ' + routingStatusNum);
                                if (routingStatusNum !== 3) {
                                    log.debug('execute', 'IF ' + tranId + ' - Entity needs routing but routing_status is ' + routingStatus + ' (needs 3), skipping');
                                    skippedCount++;
                                    processedIFIds[ifIdStr] = true;
                                    return;
                                }
                                log.debug('execute', 'IF ' + tranId + ' - Routing status is 3, proceeding');
                            }
                            
                            // Check SCAC against custentity_is_small_parcel list
                            // Only process if SCAC IS in the list (opposite of BOL logic)
                            if (!scac || scac === '') {
                                log.debug('execute', 'IF ' + tranId + ' - No SCAC code found, skipping');
                                skippedCount++;
                                processedIFIds[ifIdStr] = true;
                                return;
                            }
                            
                            // Get the multi-select field text values
                            var isSmallParcelText = '';
                            try {
                                var textValue = customerRecord.getText({
                                    fieldId: 'custentity_is_small_parcel'
                                });
                                isSmallParcelText = (textValue ? String(textValue) : '') || '';
                            } catch (textError) {
                                isSmallParcelText = '';
                            }
                            
                            // Check if SCAC is in the small parcel list
                            var scacInSmallParcelList = false;
                            if (isSmallParcelText && typeof isSmallParcelText === 'string' && isSmallParcelText.trim() !== '') {
                                var smallParcelList = isSmallParcelText.split(',').map(function(item) {
                                    return item.trim();
                                });
                                
                                log.debug('execute', 'TranID: ' + tranId + ' - Comparing SCAC "' + scac + '" against small parcel list: ' + smallParcelList.join(', '));
                                
                                for (var j = 0; j < smallParcelList.length; j++) {
                                    if (smallParcelList[j].toUpperCase() === scac.toUpperCase()) {
                                        scacInSmallParcelList = true;
                                        log.debug('execute', 'TranID: ' + tranId + ' - Match found: SCAC "' + scac + '" is in small parcel list');
                                        break;
                                    }
                                }
                            } else {
                                log.debug('execute', 'TranID: ' + tranId + ' - No small parcel list found on entity');
                            }
                            
                            // Only proceed if SCAC IS in the list (opposite of BOL exclusion logic)
                            if (!scacInSmallParcelList) {
                                log.debug('execute', 'IF ' + tranId + ' - SCAC "' + scac + '" is NOT in small parcel list, skipping');
                                skippedCount++;
                                processedIFIds[ifIdStr] = true;
                                return;
                            }
                            
                            // All checks passed - mark as processed and queue for scheduling
                            processedIFIds[ifIdStr] = true;
                            
                            // Set the field IMMEDIATELY to prevent duplicate processing
                            try {
                                var ifRecordUpdate = record.load({
                                    type: record.Type.ITEM_FULFILLMENT,
                                    id: ifId,
                                    isDynamic: true
                                });
                                
                                // Double-check the field isn't already set (race condition)
                                var currentValue = ifRecordUpdate.getValue('custbody_requested_integrated_packages');
                                if (currentValue === true || currentValue === 'T') {
                                    log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') already has requested_integrated_packages = true, skipping to prevent duplicate');
                                    return;
                                }
                                
                                ifRecordUpdate.setValue({
                                    fieldId: 'custbody_requested_integrated_packages',
                                    value: true
                                });
                                
                                ifRecordUpdate.save({
                                    enableSourcing: false,
                                    ignoreMandatoryFields: true
                                });
                                
                                log.debug('execute', 'Set requested_integrated_packages = true for IF ' + tranId + ' (ID: ' + ifId + ')');
                            } catch (fieldError) {
                                log.error('execute', 'Error setting requested_integrated_packages field for IF ' + tranId + ' (ID: ' + ifId + '): ' + fieldError.toString());
                                throw fieldError;
                            }
                            
                            // Add to batch for scheduling
                            ifIdsToSchedule.push({
                                ifId: ifId,
                                tranId: tranId,
                                entityId: entityId
                            });
                            processedCount++;
                            
                            log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') meets all criteria, queued for scheduling. Queue size: ' + ifIdsToSchedule.length);
                            
                            // Schedule MR script when batch is full
                            var batchSize = 50;
                            if (ifIdsToSchedule.length >= batchSize) {
                                log.debug('execute', 'Batch size reached (' + batchSize + '), scheduling MR tasks');
                                var scheduled = scheduleIntegratedShippingLabelsMR(ifIdsToSchedule);
                                scheduledCount += scheduled;
                                log.debug('execute', 'Scheduled ' + scheduled + ' MR task(s) from batch. Total scheduled so far: ' + scheduledCount);
                                ifIdsToSchedule = [];
                            }
                            
                        } catch (customerError) {
                            log.error('execute', 'Error checking customer criteria for IF ' + tranId + ' (ID: ' + ifId + '): ' + customerError.toString());
                            errorCount++;
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
                var scheduled = scheduleIntegratedShippingLabelsMR(ifIdsToSchedule);
                scheduledCount += scheduled;
                log.debug('execute', 'Final batch: Scheduled ' + scheduled + ' MR task(s)');
            }
            
            log.audit('execute', '=== SCHEDULED SCRIPT SUMMARY ===');
            log.audit('execute', 'Total IFs processed: ' + processedCount);
            log.audit('execute', 'Total MR scripts scheduled: ' + scheduledCount);
            log.audit('execute', 'Skipped (did not meet criteria): ' + skippedCount);
            log.audit('execute', 'Errors: ' + errorCount);
            log.debug('execute', 'Script execution complete. Remaining governance: ' + runtime.getCurrentScript().getRemainingUsage());
            
        } catch (e) {
            log.error('execute', 'Error running item fulfillment search: ' + e.toString());
            log.error('execute', 'Stack trace: ' + (e.stack || 'N/A'));
        }
    }
    
    /**
     * Schedules the integrated shipping labels MR script - ONE IF at a time
     * @param {Array<Object>} ifDataArray - Array of objects with {ifId, tranId, entityId}
     * @returns {number} Number of successfully scheduled tasks
     */
    function scheduleIntegratedShippingLabelsMR(ifDataArray) {
        if (!ifDataArray || ifDataArray.length === 0) {
            log.debug('scheduleIntegratedShippingLabelsMR', 'No IF data provided to schedule');
            return 0;
        }
        
        log.debug('scheduleIntegratedShippingLabelsMR', 'Starting to schedule ' + ifDataArray.length + ' MR task(s)');
        
        var scheduledCount = 0;
        var errorCount = 0;
        
        ifDataArray.forEach(function(ifData, index) {
            var ifId = ifData.ifId;
            var tranId = ifData.tranId || ifId;
            
            log.debug('scheduleIntegratedShippingLabelsMR', 'Processing IF ' + (index + 1) + ' of ' + ifDataArray.length + ': ' + tranId + ' (ID: ' + ifId + ')');
            
            try {
                // Build the JSON parameter - only ONE IF per MR execution
                var jsonParam = JSON.stringify({
                    itemFulfillmentIds: [ifId]  // Array with single IF
                });
                
                log.debug('scheduleIntegratedShippingLabelsMR', 'JSON parameter for IF ' + tranId + ': ' + jsonParam);
                
                var mrScriptId = 'customscript_dsh_mr_integrated_shipping_labels';
                var mrDeployId = 'customdeploy_dsh_mr_integrated_shipping_labels';
                
                var mrTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: mrScriptId,
                    deploymentId: mrDeployId,
                    params: {
                        custscript_dsh_mr_integrated_labels_json: jsonParam
                    }
                });
                
                var taskId = mrTask.submit();
                log.debug('scheduleIntegratedShippingLabelsMR', 'MR task submitted for IF ' + tranId + '. Task ID: ' + taskId);
                scheduledCount++;
                
            } catch (e) {
                errorCount++;
                log.error('scheduleIntegratedShippingLabelsMR', 'Error scheduling MR script for IF ' + tranId + ' (ID: ' + ifId + '): ' + e.toString());
                
                // Reset the field so it can be retried on the next scheduled run
                try {
                    record.submitFields({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId,
                        values: {
                            custbody_requested_integrated_packages: false
                        },
                        options: {
                            enableSourcing: false,
                            ignoreMandatoryFields: true
                        }
                    });
                    log.debug('scheduleIntegratedShippingLabelsMR', 'Reset requested_integrated_packages field for IF ' + tranId + ' due to scheduling failure');
                } catch (resetError) {
                    log.error('scheduleIntegratedShippingLabelsMR', 'Error resetting field for IF ' + tranId + ': ' + resetError.toString());
                }
            }
        });
        
        log.audit('scheduleIntegratedShippingLabelsMR', 'Scheduled ' + scheduledCount + ' MR task(s) for ' + ifDataArray.length + ' IF(s). Errors: ' + errorCount);
        return scheduledCount;
    }
    
    return {
        execute: execute
    };
});

