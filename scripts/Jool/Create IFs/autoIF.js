/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 * Map/Reduce script to create Item Fulfillments grouped by location
 * for sales orders that meet the following criteria:
 * - Entity has custentity_auto_create_ifs = true
 * - Sales order has custbody_sent_po_ack = true
 * - Sales order has custbody_ifs_created = false
 */

define([
    'N/search', 
    'N/log', 
    'N/record', 
    'N/error',
    './_dsh_lib_time_tracker',  // Time tracker library - same SuiteScripts folder in NetSuite
    './_dsh_lib_routing_calculator'  // Routing calculator library - same SuiteScripts folder in NetSuite
], function (search, log, record, error, timeTrackerLib, routingLib) {
    

    function getInputData(inputContext) {
        log.audit('getInputData', 'Starting search for sales orders');
        log.debug('getInputData', 'Search criteria:');
        log.debug('getInputData', '  - custbody_sent_po_ack = true');
        log.debug('getInputData', '  - custbody_ifs_created = false');
        log.debug('getInputData', '  - entity.custentity_auto_create_ifs = true');
        
        // First, search for entities where custentity_auto_create_ifs = true
        var entityIds = [];
        try {
            log.debug('getInputData', 'Step 1: Searching for entities with custentity_auto_create_ifs = true');
            var entitySearch = search.create({
                type: search.Type.CUSTOMER,
                filters: [
                    ['custentity_auto_create_ifs', 'is', 'T']
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid'
                    })
                ]
            });
            
            var entitySearchResults = entitySearch.run();
            entitySearchResults.each(function(result) {
                entityIds.push(result.id);
                return true;
            });
            
            log.debug('getInputData', 'Found ' + entityIds.length + ' entity/ies with custentity_auto_create_ifs = true');
            if (entityIds.length > 0) {
                log.debug('getInputData', 'Entity IDs: ' + entityIds.join(', '));
            }
        } catch (e) {
            log.error('getInputData', 'Error searching for entities: ' + e.toString());
            // If entity search fails, return empty search
            return search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['internalid', 'none', '@NONE@']
                ]
            });
        }
        
        // If no entities found, return empty search
        if (entityIds.length === 0) {
            log.debug('getInputData', 'No entities found with custentity_auto_create_ifs = true, returning empty search');
            return search.create({
                type: search.Type.SALES_ORDER,
                filters: [
                    ['internalid', 'none', '@NONE@']
                ]
            });
        }
        
        // Now search for sales orders with the required criteria
        var salesOrderSearch = search.create({
            type: search.Type.SALES_ORDER,
            filters: [
                ['custbody_sent_po_ack', 'is', 'T'],
                'AND',
                ['custbody_ifs_created', 'is', 'F'],
                'AND',
                ['entity', 'anyof', entityIds]
            ],
            columns: [
                search.createColumn({
                    name: 'internalid'
                }),
                search.createColumn({
                    name: 'entity'
                }),
                search.createColumn({
                    name: 'tranid'
                })
            ]
        });
        
        // Run the search to get count and log results
        try {
            var resultCount = salesOrderSearch.runPaged().count;
            log.audit('getInputData', 'Search created successfully. Found ' + resultCount + ' sales order(s) matching criteria');
            
            if (resultCount > 0) {
                // Log first few results for debugging
                var pagedData = salesOrderSearch.runPaged({ pageSize: 10 });
                var pageRange = pagedData.pageRanges;
                var firstPage = pagedData.fetch({ index: 0 });
                
                log.debug('getInputData', 'Sample results (first 10):');
                firstPage.data.forEach(function(result) {
                    var entityVal = result.getValue('entity');
                    var tranIdVal = result.getValue('tranid');
                    log.debug('getInputData', '  SO ID: ' + result.id + ', Entity: ' + (entityVal || 'N/A') + ', TranID: ' + (tranIdVal || 'N/A'));
                });
            } else {
                log.debug('getInputData', 'No sales orders found matching the search criteria');
            }
        } catch (e) {
            log.error('getInputData', 'Error running sales order search: ' + e.toString());
            log.error('getInputData', 'Search filters: ' + JSON.stringify([
                ['custbody_sent_po_ack', 'is', 'T'],
                'AND',
                ['custbody_ifs_created', 'is', 'F'],
                'AND',
                ['entity', 'anyof', entityIds]
            ]));
        }
        
        return salesOrderSearch;
    }
    
    /**
     * Executes when the map entry point is triggered and applies to each key/value pair.
     * Processes each sales order: groups lines by location and creates IFs
     */
    // Track processed SO IDs to ensure we only process each SO once
    var processedSOIds = {};
    
    function map(mapContext) {
        try {
            var searchResult = JSON.parse(mapContext.value);
            var salesOrderId = searchResult.id;
            
            // Check if we've already processed this SO in this execution
            if (processedSOIds[salesOrderId]) {
                log.debug('map', 'SO ' + salesOrderId + ' already processed, skipping duplicate');
                return;
            }
            
            // Mark this SO as processed
            processedSOIds[salesOrderId] = true;
            
            log.debug('map', 'Search result data: ' + JSON.stringify(searchResult));
            
            // Extract entity and tranid from search result
            // The search result structure should have values as objects with text/value properties
            var entityId = null;
            var tranId = null;
            
            if (searchResult.values) {
                if (searchResult.values.entity) {
                    // Search result values are typically objects with 'value' and 'text' properties
                    entityId = searchResult.values.entity.value || searchResult.values.entity;
                }
                
                if (searchResult.values.tranid) {
                    tranId = searchResult.values.tranid.value || searchResult.values.tranid;
                }
            }
            
            log.audit('map', 'Processing sales order: ' + (tranId || salesOrderId) + (entityId ? ', Entity: ' + entityId : ''));
            
            // Load the sales order to get line items and entity if not from search
            log.debug('map', 'Loading sales order record: ' + salesOrderId);
            var soRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });
            
            // Get entity from SO record if not available from search result
            if (!entityId) {
                entityId = soRecord.getValue('entity');
                log.debug('map', 'Entity ID not in search result, loaded from SO: ' + entityId);
            }
            
            if (!tranId) {
                tranId = soRecord.getValue('tranid');
                log.debug('map', 'TranID not in search result, loaded from SO: ' + tranId);
            }
            
            // Verify the SO has the required fields
            var sentPoAck = soRecord.getValue('custbody_sent_po_ack');
            var ifsCreated = soRecord.getValue('custbody_ifs_created');
            log.debug('map', 'SO ' + tranId + ' - custbody_sent_po_ack: ' + sentPoAck + ', custbody_ifs_created: ' + ifsCreated);
            
            // Group lines by location
            var linesByLocation = {};
            var lineCount = soRecord.getLineCount({
                sublistId: 'item'
            });
            
            log.debug('map', 'SO ' + tranId + ' has ' + lineCount + ' line item(s)');
            
            for (var i = 0; i < lineCount; i++) {
                var locationId = soRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'location',
                    line: i
                });
                
                var itemId = soRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });
                
                var quantity = soRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    line: i
                });
                
                if (!locationId) {
                    log.error('map', 'Line ' + i + ' on SO ' + tranId + ' has no location (Item: ' + itemId + ', Qty: ' + quantity + ')');
                    continue;
                }
                
                if (!linesByLocation[locationId]) {
                    linesByLocation[locationId] = [];
                }
                
                linesByLocation[locationId].push(i);
                log.debug('map', 'Line ' + i + ': Item=' + itemId + ', Qty=' + quantity + ', Location=' + locationId);
            }
            
            log.debug('map', 'Sales order ' + tranId + ' grouped into ' + Object.keys(linesByLocation).length + ' location(s):');
            for (var locId in linesByLocation) {
                log.debug('map', '  Location ' + locId + ': ' + linesByLocation[locId].length + ' line(s)');
            }
            
            // Check if there are multiple locations (split shipment)
            var locationCount = Object.keys(linesByLocation).length;
            var isSplitShipment = locationCount > 1;
            
            if (isSplitShipment) {
                log.debug('map', 'SO ' + tranId + ' has multiple locations (' + locationCount + '), will set custbody_is_split_shipment = true on all IFs');
            }
            
            // Note: Pickup date calculation is handled by routingLib.calculateAndApplyRoutingFields() 
            // after the IF is created, so we don't need to calculate it here
            
            // Create one IF per location
            var ifResults = [];
            for (var locationId in linesByLocation) {
                try {
                    // Reload SO record before each IF creation to get latest state
                    // (in case previous IFs changed the SO)
                    log.debug('map', 'Creating IF for location ' + locationId + ' on SO ' + tranId);
                    var currentSoRecord = record.load({
                        type: record.Type.SALES_ORDER,
                        id: salesOrderId,
                        isDynamic: false
                    });
                    
                    var ifId = createItemFulfillment(currentSoRecord, locationId, linesByLocation[locationId], entityId, tranId, isSplitShipment);
                    if (ifId) {
                        // Get IF tranID
                        var ifRecord = record.load({
                            type: record.Type.ITEM_FULFILLMENT,
                            id: ifId,
                            isDynamic: false
                        });
                        var ifTranId = ifRecord.getValue('tranid');
                        
                        ifResults.push({
                            ifId: ifId,
                            ifTranId: ifTranId,
                            locationId: locationId,
                            success: true
                        });
                        log.audit('map', 'Created IF ' + ifTranId + ' for location ' + locationId + ' on SO ' + tranId);
                    } else {
                        ifResults.push({
                            locationId: locationId,
                            success: false,
                            error: 'Failed to create IF'
                        });
                    }
                } catch (e) {
                    log.error('map', 'Error creating IF for location ' + locationId + ' on SO ' + tranId + ': ' + e.toString());
                    ifResults.push({
                        locationId: locationId,
                        success: false,
                        error: e.toString()
                    });
                }
            }
            
            // Write output for reduce stage
            mapContext.write({
                key: salesOrderId,
                value: {
                    salesOrderId: salesOrderId,
                    entityId: entityId,
                    ifResults: ifResults,
                    allSuccessful: ifResults.every(function(r) { return r.success; })
                }
            });
            
        } catch (e) {
            log.error('map', 'Error processing sales order: ' + e.toString());
            mapContext.write({
                key: salesOrderId || 'unknown',
                value: {
                    error: e.toString(),
                    success: false
                }
            });
        }
    }
    
    function createItemFulfillment(soRecord, locationId, lineIndices, entityId, soTranId, isSplitShipment) {
        var ifId = null; // Declare outside try block so it's accessible in catch
        try {
            var salesOrderId = soRecord.id;
            var soTranIdValue = soTranId || soRecord.getValue('tranid') || salesOrderId;
            
            log.debug('createItemFulfillment', 'Creating IF for SO ' + soTranIdValue + ', Location: ' + locationId + ', Lines: ' + lineIndices.join(', ') + ', Split Shipment: ' + (isSplitShipment ? 'true' : 'false'));
            
            // Transform sales order to item fulfillment
            log.debug('createItemFulfillment', 'Transforming SO ' + soTranIdValue + ' to Item Fulfillment');
            var ifRecord = record.transform({
                fromType: record.Type.SALES_ORDER,
                fromId: salesOrderId,
                toType: record.Type.ITEM_FULFILLMENT,
                isDynamic: true
            });
            
            var totalLines = ifRecord.getLineCount({
                sublistId: 'item'
            });
            
            log.debug('createItemFulfillment', 'IF transformed with ' + totalLines + ' line(s). Filtering for location ' + locationId);
            
            if (totalLines === 0) {
                log.error('createItemFulfillment', 'No lines in transformed item fulfillment for SO ' + soTranIdValue);
                throw error.create({
                    name: 'NO_LINES_IN_IF',
                    message: 'No lines in transformed item fulfillment'
                });
            }
            
            // Convert locationId to string for consistent comparison
            var targetLocationId = String(locationId);
            var linesFulfilled = 0;
            var fulfilledItems = [];
            
            // Loop through all lines and set itemreceive based on location match
            for (var currentLine = 0; currentLine < totalLines; currentLine++) {
                ifRecord.selectLine({
                    sublistId: 'item',
                    line: currentLine
                });
                
                var lineLocation = ifRecord.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'location'
                });
                
                var lineItem = ifRecord.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'item'
                });
                
                var lineQty = ifRecord.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'itemquantity'
                });
                
                var isTargetLocation = String(lineLocation) === targetLocationId;
                
                if (isTargetLocation) {
                    ifRecord.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'itemreceive',
                        value: true
                    });
                    linesFulfilled++;
                    fulfilledItems.push('Item:' + lineItem + ',Qty:' + lineQty);
                } else {
                    // Ensure non-target location items are not fulfilled
                    ifRecord.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'itemreceive',
                        value: false
                    });
                }
                
                ifRecord.commitLine({
                    sublistId: 'item'
                });
            }
            
            log.debug('createItemFulfillment', 'Location ' + locationId + ': ' + linesFulfilled + ' line(s) fulfilled - ' + fulfilledItems.join('; '));
            
            // Check if we have at least one line to fulfill
            if (linesFulfilled === 0) {
                log.error('createItemFulfillment', 'No lines to fulfill for location ' + locationId + ' on SO ' + soTranIdValue);
                throw error.create({
                    name: 'NO_LINES_REMAINING',
                    message: 'No lines to fulfill for location ' + locationId
                });
            }
            
            // Set the ship from location field
            log.debug('createItemFulfillment', 'Setting custbody_ship_from_location to ' + locationId);
            ifRecord.setValue({
                fieldId: 'custbody_ship_from_location',
                value: locationId
            });
            
            // Set split shipment field if there are multiple locations
            if (isSplitShipment) {
                log.debug('createItemFulfillment', 'Setting custbody_is_split_shipment to true (multiple locations on SO)');
                ifRecord.setValue({
                    fieldId: 'custbody_is_split_shipment',
                    value: true
                });
            }
            
            // Save the IF first (before calculating routing info from IF quantities)
            log.debug('createItemFulfillment', 'Saving Item Fulfillment for location ' + locationId);
            ifId = ifRecord.save();
            
            // Get IF tranID for logging
            var savedIfRecord = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId,
                isDynamic: true
            });
            var ifTranId = savedIfRecord.getValue('tranid');
            
            log.debug('createItemFulfillment', 'IF saved as ' + ifTranId);
            
            // If entity is 1716, run Amazon routing request AFTER saving
            // Library handles everything: routing fields, pickup date, routing status
            if (parseInt(entityId) === 1716) {
                log.debug('createItemFulfillment', 'Entity is 1716, running Amazon routing request field population from IF quantities');
                
                // Calculate and apply routing fields using library (handles everything)
                var routingSuccess = routingLib.calculateAndApplyRoutingFields(ifId);
                
                if (!routingSuccess) {
                    log.warning('createItemFulfillment', 'Failed to calculate and apply routing fields for IF ' + ifTranId);
                }
            } else {
                log.debug('createItemFulfillment', 'Entity is ' + entityId + ' (not 1716), skipping Amazon routing request');
            }
            
            log.audit('createItemFulfillment', 'Successfully created IF ' + ifTranId + ' for location ' + locationId + ' on SO ' + soTranIdValue);
            
            // Add time tracker lines for IF creation
            // Action ID 2 = "Create Item fulfillment" (2nd action in the list)
            // Action ID 3 = "Request Routing" (3rd action in the list)
            // Action ID 4 = "Populate routing" (4th action in the list)
            try {
                if (entityId) {
                    // First time tracker line - Create IF (Employee 5)
                    try {
                        log.debug('Time Tracker - Create IF', 'Adding time tracker line for IF: ' + ifTranId + ', Customer: ' + entityId + ', Action: Create IF');
                        timeTrackerLib.addTimeTrackerLine({
                            actionId: 2, // Create Item fulfillment action ID
                            customerId: entityId,
                            timeSaved: 30, // 30 seconds
                            employeeId: 5
                        });
                        log.debug('Time Tracker - Create IF', 'Successfully added time tracker line for employee 5, action 2');
                    } catch (timeTrackerError1) {
                        log.error('Time Tracker Error - Create IF', 'Failed to add time tracker line for employee 5: ' + timeTrackerError1.toString());
                    }
                    
                    // Second time tracker line - Request Routing (Employee 5)
                    try {
                        log.debug('Time Tracker - Request Routing', 'Adding time tracker line for IF: ' + ifTranId + ', Customer: ' + entityId + ', Action: Request Routing');
                        timeTrackerLib.addTimeTrackerLine({
                            actionId: 3, // Request Routing action ID
                            customerId: entityId,
                            timeSaved: 5, // 5 seconds
                            employeeId: 5
                        });
                        log.debug('Time Tracker - Request Routing', 'Successfully added time tracker line for employee 5, action 3');
                    } catch (timeTrackerError2) {
                        log.error('Time Tracker Error - Request Routing', 'Failed to add time tracker line for employee 5: ' + timeTrackerError2.toString());
                    }
                    
                    // Third time tracker line - Populate routing back (Employee 5)
                    try {
                        log.debug('Time Tracker - Populate Routing Back', 'Adding time tracker line for IF: ' + ifTranId + ', Customer: ' + entityId + ', Action: Populate routing');
                        timeTrackerLib.addTimeTrackerLine({
                            actionId: 4, // Populate routing action ID
                            customerId: entityId,
                            timeSaved: 5, // 5 seconds
                            employeeId: 5
                        });
                        log.debug('Time Tracker - Populate Routing Back', 'Successfully added time tracker line for employee 5, action 4');
                    } catch (timeTrackerError3) {
                        log.error('Time Tracker Error - Populate Routing Back', 'Failed to add time tracker line for employee 5: ' + timeTrackerError3.toString());
                    }
                } else {
                    log.debug('Time Tracker', 'Skipping time tracker - no customer ID found on IF: ' + ifTranId);
                }
            } catch (timeTrackerError) {
                // Log error but don't fail the IF creation
                log.error('Time Tracker Error', 'Failed to add time tracker lines for IF ' + ifTranId + ': ' + timeTrackerError.toString());
            }
            
            return ifId;
            
        } catch (e) {
            // If IF was already created (saved), return it even if field population failed
            // The only criteria for success is IF creation, not field population
            if (ifId) {
                log.error('createItemFulfillment', 'Error setting fields on IF ' + ifId + ' for location ' + locationId + ' on SO ' + (soTranId || salesOrderId) + ': ' + e.toString());
                log.error('createItemFulfillment', 'IF was created successfully, returning ifId despite field population error');
                return ifId; // Return the IF ID - field population errors don't matter
            }
            
            // Only throw if IF creation itself failed
            log.error('createItemFulfillment', 'Error creating IF for location ' + locationId + ' on SO ' + (soTranId || salesOrderId) + ': ' + e.toString());
            log.error('createItemFulfillment', 'Stack trace: ' + (e.stack || 'N/A'));
            throw e;
        }
    }
    

    
    /**
     * Executes when the reduce entry point is triggered and applies to each group of key/value pairs.
     * Updates the sales order to mark IFs as created if all were successful
     */
    function reduce(reduceContext) {
        try {
            var soData = JSON.parse(reduceContext.values[0]);
            var salesOrderId = soData.salesOrderId;
            
            // Safety check: if salesOrderId is missing (e.g., from map error), skip processing
            if (!salesOrderId) {
                log.error('reduce', 'Missing salesOrderId in reduce data. Map stage may have failed. Data: ' + JSON.stringify(soData));
                return;
            }
            
            // Get SO tranID for logging
            var soRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });
            var soTranId = soRecord.getValue('tranid') || salesOrderId;
            
            log.debug('reduce', 'Reducing sales order: ' + soTranId);
            log.debug('reduce', 'SO Data: ' + JSON.stringify(soData));
            log.debug('reduce', 'All successful: ' + soData.allSuccessful + ', IF Results count: ' + (soData.ifResults ? soData.ifResults.length : 0));
            
            // Check if all IFs were actually created (have ifId) - field population errors don't matter
            var allIFsCreated = false;
            if (soData.ifResults && soData.ifResults.length > 0) {
                // Count how many IFs were actually created (have ifId)
                var createdCount = 0;
                soData.ifResults.forEach(function(result) {
                    if (result.ifId) {
                        createdCount++;
                    }
                });
                // All IFs were created if the count matches the expected number
                allIFsCreated = (createdCount === soData.ifResults.length);
                log.debug('reduce', 'IFs created: ' + createdCount + ' of ' + soData.ifResults.length);
            }
            
            // If all IFs were created (regardless of field population), update the sales order
            if (allIFsCreated) {
                try {
                    log.debug('reduce', 'All IFs created successfully, updating SO ' + soTranId);
                    
                    var soRecordUpdate = record.load({
                        type: record.Type.SALES_ORDER,
                        id: salesOrderId,
                        isDynamic: true
                    });
                    
                    var currentIfsCreated = soRecordUpdate.getValue('custbody_ifs_created');
                    log.debug('reduce', 'Current custbody_ifs_created value: ' + currentIfsCreated);
                    
                    soRecordUpdate.setValue({
                        fieldId: 'custbody_ifs_created',
                        value: true
                    });
                    
                    var savedId = soRecordUpdate.save();
                    
                    // Get IF tranIDs for logging
                    var ifTranIds = [];
                    soData.ifResults.forEach(function(result) {
                        if (result.success && result.ifTranId) {
                            ifTranIds.push(result.ifTranId);
                        } else if (result.success && result.ifId) {
                            // Fallback if tranID not in result
                            var ifRec = record.load({
                                type: record.Type.ITEM_FULFILLMENT,
                                id: result.ifId,
                                isDynamic: false
                            });
                            var ifTranId = ifRec.getValue('tranid');
                            ifTranIds.push(ifTranId);
                        }
                    });
                    
                    log.audit('reduce', 'Updated SO ' + soTranId + ' - set custbody_ifs_created to true');
                    log.debug('reduce', 'Created IFs for this SO: ' + (ifTranIds.length > 0 ? ifTranIds.join(', ') : 'N/A'));
                    
                } catch (e) {
                    log.error('reduce', 'Error updating SO ' + soTranId + ': ' + e.toString());
                    log.error('reduce', 'Stack trace: ' + (e.stack || 'N/A'));
                }
            } else {
                var reason = '';
                if (!soData.allSuccessful) {
                    reason = 'not all IFs were successful';
                } else if (!soData.ifResults || soData.ifResults.length === 0) {
                    reason = 'no IFs were created';
                }
                log.audit('reduce', 'SO ' + soTranId + ' - ' + reason + ', not updating custbody_ifs_created');
                
                if (soData.ifResults) {
                    soData.ifResults.forEach(function(result) {
                        if (!result.success) {
                            log.debug('reduce', 'Failed IF for location ' + result.locationId + ': ' + (result.error || 'Unknown error'));
                        }
                    });
                }
            }
            
            // Write the final output
            reduceContext.write({
                key: salesOrderId,
                value: soData
            });
            
        } catch (e) {
            log.error('reduce', 'Error reducing sales order: ' + e.toString());
        }
    }
    
    /**
     * Executes when the summarize entry point is triggered and applies to the result set.
     * @param {Object} summaryContext - Holds statistics and results of the Map/Reduce script
     */
    function summarize(summaryContext) {
        var inputSummary = summaryContext.inputSummary;
        var outputSummary = summaryContext.outputSummary;
        var mapSummary = summaryContext.mapSummary;
        var reduceSummary = summaryContext.reduceSummary;
        
        log.audit('summarize', 'Map/Reduce script execution completed');
        log.audit('summarize', 'Input summary: ' + JSON.stringify(inputSummary));
        log.audit('summarize', 'Map summary: ' + JSON.stringify(mapSummary));
        log.audit('summarize', 'Reduce summary: ' + JSON.stringify(reduceSummary));
        log.audit('summarize', 'Output summary: ' + JSON.stringify(outputSummary));
        
        // Process all output results
        var successCount = 0;
        var failureCount = 0;
        var totalIFsCreated = 0;
        
        // Check if outputSummary exists and has output
        try {
            if (outputSummary) {
                log.debug('summarize', 'outputSummary type: ' + typeof outputSummary);
                log.debug('summarize', 'outputSummary keys: ' + (outputSummary ? Object.keys(outputSummary).join(', ') : 'N/A'));
                
                // Try to get output iterator
                var outputIterator = null;
                if (outputSummary.output) {
                    outputIterator = outputSummary.output.iterator();
                } else if (outputSummary.iterator) {
                    outputIterator = outputSummary.iterator();
                }
                
                if (outputIterator) {
                    while (outputIterator.hasNext()) {
                        var output = outputIterator.next();
                        try {
                            var soData = JSON.parse(output.value);
                            
                            if (soData.allSuccessful) {
                                successCount++;
                                totalIFsCreated += soData.ifResults ? soData.ifResults.length : 0;
                                log.audit('summarize', 'SO ' + soData.salesOrderId + ': SUCCESS - Created ' + (soData.ifResults ? soData.ifResults.length : 0) + ' IF(s)');
                            } else {
                                failureCount++;
                                log.audit('summarize', 'SO ' + soData.salesOrderId + ': FAILED - ' + (soData.error || 'Some IFs failed to create'));
                            }
                        } catch (e) {
                            log.error('summarize', 'Error parsing output value: ' + e.toString());
                            failureCount++;
                        }
                    }
                } else {
                    log.audit('summarize', 'No output iterator available in outputSummary');
                }
            } else {
                log.audit('summarize', 'outputSummary is null or undefined');
            }
        } catch (e) {
            log.error('summarize', 'Error accessing output summary: ' + e.toString());
            log.error('summarize', 'Error stack: ' + (e.stack || 'N/A'));
        }
        
        log.audit('summarize', '=== FINAL SUMMARY ===');
        log.audit('summarize', 'Total Sales Orders Processed: ' + (successCount + failureCount));
        log.audit('summarize', 'Successful: ' + successCount);
        log.audit('summarize', 'Failed: ' + failureCount);
        log.audit('summarize', 'Total Item Fulfillments Created: ' + totalIFsCreated);
    }
    
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});

