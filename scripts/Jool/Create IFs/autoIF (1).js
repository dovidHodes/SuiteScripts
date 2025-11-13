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
    './_dsh_lib_time_tracker'  // Time tracker library - same folder in SuiteScripts
], function (search, log, record, error, timeTrackerLib) {
    

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
            
            // Calculate pickup date from SO MABD (only for entity 1716, part of routing logic)
            var requestedPickupDate = null;
            if (parseInt(entityId) === 1716) {
                requestedPickupDate = calculatePickupDateFromMABD(soRecord, tranId);
            }
            
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
                    
                    var ifId = createItemFulfillment(currentSoRecord, locationId, linesByLocation[locationId], entityId, tranId, requestedPickupDate, isSplitShipment);
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
    
    function createItemFulfillment(soRecord, locationId, lineIndices, entityId, soTranId, requestedPickupDate, isSplitShipment) {
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
            // This calculates routing info from the IF quantities only (not SO)
            var routingFieldsSet = false;
            var pickupDateSet = false;
            
            if (parseInt(entityId) === 1716) {
                log.debug('createItemFulfillment', 'Entity is 1716, running Amazon routing request field population from IF quantities');
                routingFieldsSet = applyAmazonRoutingRequest(savedIfRecord, locationId, soTranIdValue, ifTranId);
                
                // Set requested pickup date if calculated (requestedPickupDate is a Date object)
                // Wrap in try-catch so date errors don't fail the entire IF creation
                if (requestedPickupDate) {
                    try {
                        savedIfRecord.setValue({
                            fieldId: 'custbody_sps_date_118',
                            value: requestedPickupDate
                        });
                        pickupDateSet = true;
                        log.debug('createItemFulfillment', 'Set custbody_sps_date_118 to ' + formatDateForLog(requestedPickupDate) + ' for IF ' + ifTranId);
                    } catch (dateError) {
                        log.error('createItemFulfillment', 'Error setting pickup date on IF ' + ifTranId + ': ' + dateError.toString());
                        log.error('createItemFulfillment', 'Pickup date value was: ' + formatDateForLog(requestedPickupDate));
                        // Continue - don't fail the IF creation just because date field failed
                        pickupDateSet = false;
                    }
                } else {
                    log.debug('createItemFulfillment', 'No pickup date calculated or date too close, leaving custbody_sps_date_118 blank');
                }
                
                // If routing fields and pickup date were set successfully, set routing status
                if (routingFieldsSet && pickupDateSet) {
                    try {
                        savedIfRecord.setValue({
                            fieldId: 'custbody_routing_status',
                            value: 1
                        });
                        log.debug('createItemFulfillment', 'Set custbody_routing_status to 1 (ready for routing request)');
                    } catch (statusError) {
                        log.error('createItemFulfillment', 'Error setting routing status on IF ' + ifTranId + ': ' + statusError.toString());
                        // Continue - don't fail the IF creation
                    }
                }
            } else {
                log.debug('createItemFulfillment', 'Entity is ' + entityId + ' (not 1716), skipping Amazon routing request');
            }
            
            // Save again after setting all fields (only if we made changes)
            try {
                savedIfRecord.save();
                log.debug('createItemFulfillment', 'IF ' + ifTranId + ' updated with routing information and pickup date');
            } catch (saveError) {
                log.error('createItemFulfillment', 'Error saving IF ' + ifTranId + ' after setting routing fields: ' + saveError.toString());
                // Continue - IF was already created successfully, this is just an update
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
    

    function applyAmazonRoutingRequest(ifRecord, locationId, soTranId, ifTranId) {
        try {
            // Load the location record to get the Amazon location number
            var locationRecord = record.load({
                type: 'location',
                id: locationId
            });
            
            var locationName = locationRecord.getValue({
                fieldId: 'name'
            });
            
            var amazonLocationNumber = locationRecord.getValue({
                fieldId: 'custrecord_amazon_location_number'
            });
            
            log.debug('applyAmazonRoutingRequest', 'Starting routing calculation - Location: ' + locationName + ', Amazon Loc#: ' + (amazonLocationNumber || 'NOT SET') + ', SO: ' + (soTranId || 'N/A') + ', IF: ' + (ifTranId || 'N/A') + ' - Using IF quantities only');
            
            // Initialize totals for cartons, volume, weight, and pallets
            var totalCartons = 0;
            var totalVolume = 0;
            var totalWeight = 0;
            var totalPalletFraction = 0.0;
            
            // Get line count from IF (only fulfilled lines)
            var lineCount = ifRecord.getLineCount({
                sublistId: 'item'
            });
            
            // Process each item line for carton/volume/weight/pallet calculations
            // Use IF quantities only (itemquantity from the IF)
            for (var i = 0; i < lineCount; i++) {
                var itemId = ifRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });
                
                // Get quantity from IF (this is the fulfilled quantity, not SO quantity)
                var itemQuantity = ifRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'itemquantity',
                    line: i
                });
                
                // Check if this line is actually being fulfilled (itemreceive = true)
                var itemReceive = ifRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'itemreceive',
                    line: i
                });
                
                // Only process lines that are being fulfilled (itemreceive = true) and have quantity > 0
                if (itemId && itemQuantity > 0 && itemReceive) {
                    // Load the item record
                    var itemRecord = record.load({
                        type: 'inventoryitem',
                        id: itemId
                    });
                    
                    var itemName = itemRecord.getValue('itemid') || itemId;
                    
                    // Calculate cartons - always use custitemunits_per_carton
                    var unitsPerCarton = itemRecord.getValue('custitemunits_per_carton') || 1;
                    var itemCartons = Math.ceil(itemQuantity / unitsPerCarton);
                    totalCartons += itemCartons;
                    
                    // Get cubic feet per carton
                    var cubicFeetPerCarton = itemRecord.getValue('custitemcustitem_carton_cbf') || 0;
                    var itemVolume = cubicFeetPerCarton * Math.max(1, itemCartons); // Minimum 1 carton
                    totalVolume += itemVolume;
                    
                    // Get weight per carton - always use custitemweight_carton_1
                    var weightPerCarton = itemRecord.getValue('custitemweight_carton_1') || 0;
                    var itemWeight = weightPerCarton * Math.max(1, itemCartons); // Minimum 1 carton
                    totalWeight += itemWeight;
                    
                    // Get units per pallet based on location for pallet calculation
                    var unitsPerPallet = 0;
                    if (parseInt(locationId) === 4) { // Westmark
                        unitsPerPallet = itemRecord.getValue('custitem_units_per_pallet_westmark') || 1;
                    } else if (parseInt(locationId) === 38) { // Rutgers
                        unitsPerPallet = itemRecord.getValue('custitemunits_per_pallet') || 1;
                    } else {
                        unitsPerPallet = 1; // Default to 1 if location not recognized
                    }
                    
                    // Calculate pallet fraction for this item and add to total
                    var palletFraction = 0;
                    if (unitsPerPallet > 0) {
                        palletFraction = itemQuantity / unitsPerPallet;
                        totalPalletFraction += palletFraction;
                    } else {
                        // If unitsPerPallet is 0 or invalid, treat as 1 unit per pallet
                        palletFraction = itemQuantity;
                        totalPalletFraction += itemQuantity;
                    }
                    
                    log.debug('applyAmazonRoutingRequest', 'Line ' + i + ': ' + itemName + ' - Qty: ' + itemQuantity + ', Cartons: ' + itemCartons + ', Vol: ' + itemVolume.toFixed(2) + ' cu ft, Wt: ' + itemWeight.toFixed(2) + ', Units/Pallet: ' + unitsPerPallet + ', PalletFrac: ' + palletFraction.toFixed(3));
                }
            }
            
            // Round up to get total pallets (since you can't have a partial physical pallet)
            // Ensure at least 1 pallet if there are any items
            var totalPallets = Math.max(1, Math.ceil(totalPalletFraction));
            
            log.debug('applyAmazonRoutingRequest', 'Totals - Cartons: ' + totalCartons + ', Vol: ' + totalVolume.toFixed(2) + ' cu ft, Wt: ' + totalWeight.toFixed(2) + ', PalletFrac: ' + totalPalletFraction.toFixed(3) + ', Pallets: ' + totalPallets);
            
            if (amazonLocationNumber) {
                // Set the custbody_ship_from_location field with the location internal ID
                ifRecord.setValue({
                    fieldId: 'custbody_ship_from_location',
                    value: locationId
                });
                
                // Set the warehouse location number on the Item Fulfillment
                ifRecord.setValue({
                    fieldId: 'custbody_warehouse_location_number',
                    value: amazonLocationNumber
                });
                
                // Set the calculated totals
                ifRecord.setValue({
                    fieldId: 'custbody_total_cartons',
                    value: totalCartons
                });
                
                ifRecord.setValue({
                    fieldId: 'custbody_total_volume',
                    value: totalVolume
                });
                
                ifRecord.setValue({
                    fieldId: 'custbody_total_weight',
                    value: totalWeight
                });
                
                // Set request type based on weight: >285 lbs = 1, <=285 lbs = 2
                var requestType = (totalWeight > 285) ? 1 : 2;
                ifRecord.setValue({
                    fieldId: 'custbody_request_type',
                    value: requestType
                });
                log.debug('applyAmazonRoutingRequest', 'Set custbody_request_type to ' + requestType + ' (weight: ' + totalWeight.toFixed(2) + ' lbs)');
                
                ifRecord.setValue({
                    fieldId: 'custbody_total_pallets',
                    value: totalPallets
                });
                
                log.debug('applyAmazonRoutingRequest', 'Routing fields set - Loc: ' + locationId + ', Amazon#: ' + amazonLocationNumber + ', Cartons: ' + totalCartons + ', Vol: ' + totalVolume.toFixed(2) + ' cu ft, Wt: ' + totalWeight.toFixed(2) + ', Pallets: ' + totalPallets + ', Request Type: ' + requestType);
                return true;
            } else {
                log.warning('applyAmazonRoutingRequest', 'Amazon location number not found for location ' + locationId + ' (' + locationName + '), skipping routing field population');
                return false;
            }
            
        } catch (e) {
            log.error('applyAmazonRoutingRequest', 'Error applying Amazon routing request: ' + e.toString());
            throw e;
        }
    }
    
    /**
     * Calculates the requested pickup date from SO MABD date
     * Calculates 2 business days before MABD (excluding Saturday and Sunday)
     * If the calculated date is within 2 business days from today, returns null
     * @param {Record} soRecord - The Sales Order record
     * @param {string} soTranId - Sales Order transaction ID for logging
     * @returns {Date|null} - Date object, or null if should be left blank
     */
    function calculatePickupDateFromMABD(soRecord, soTranId) {
        try {
            // Get MABD date from SO
            var mabdDate = soRecord.getValue('custbody_gbs_mabd');
            
            if (!mabdDate) {
                log.debug('calculatePickupDateFromMABD', 'SO ' + soTranId + ' has no MABD date (custbody_gbs_mabd), skipping pickup date calculation');
                return null;
            }
            
            log.debug('calculatePickupDateFromMABD', 'SO ' + soTranId + ' MABD date: ' + mabdDate);
            
            // Calculate 2 business days before MABD (returns Date object)
            var pickupDateObj = calculateBusinessDaysBefore(mabdDate, 2);
            
            if (!pickupDateObj) {
                log.debug('calculatePickupDateFromMABD', 'Could not calculate pickup date from MABD: ' + mabdDate);
                return null;
            }
            
            // Set time to midnight for comparison
            pickupDateObj.setHours(0, 0, 0, 0);
            
            // Get current date
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Check if pickup date is within 2 business days from today
            var businessDaysBetween = countBusinessDaysBetween(today, pickupDateObj);
            
            if (businessDaysBetween <= 2) {
                log.debug('calculatePickupDateFromMABD', 'Calculated pickup date ' + formatDateForLog(pickupDateObj) + ' is within 2 business days from today (' + businessDaysBetween + ' business days), will leave field blank');
                return null;
            }
            
            log.debug('calculatePickupDateFromMABD', 'Calculated pickup date: ' + formatDateForLog(pickupDateObj) + ' (2 business days before MABD: ' + mabdDate + ')');
            return pickupDateObj;
            
        } catch (e) {
            log.error('calculatePickupDateFromMABD', 'Error calculating pickup date: ' + e.toString());
            return null;
        }
    }
    
    /**
     * Formats a Date object for logging purposes (MM/DD/YYYY)
     * @param {Date} dateObj - Date object to format
     * @returns {string} - Formatted date string
     */
    function formatDateForLog(dateObj) {
        if (!dateObj) return 'N/A';
        var year = dateObj.getFullYear();
        var month = dateObj.getMonth() + 1;
        var day = dateObj.getDate();
        var monthStr = month < 10 ? '0' + month : String(month);
        var dayStr = day < 10 ? '0' + day : String(day);
        return monthStr + '/' + dayStr + '/' + year;
    }
    
    /**
     * Counts the number of business days between two dates (inclusive)
     * Business days exclude Saturday (6) and Sunday (0)
     * @param {Date} startDate - The starting date
     * @param {Date} endDate - The ending date
     * @returns {number} - Number of business days between the dates (inclusive)
     */
    function countBusinessDaysBetween(startDate, endDate) {
        try {
            var count = 0;
            var currentDate = new Date(startDate);
            var end = new Date(endDate);
            
            // Ensure we're comparing dates correctly
            if (currentDate > end) {
                var temp = currentDate;
                currentDate = end;
                end = temp;
            }
            
            // Count business days from start to end (inclusive)
            while (currentDate <= end) {
                var dayOfWeek = currentDate.getDay();
                // If it's not Saturday (6) or Sunday (0), it's a business day
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    count++;
                }
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            return count;
            
        } catch (e) {
            log.error('countBusinessDaysBetween', 'Error counting business days: ' + e.toString());
            return 0;
        }
    }
    
    /**
     * Calculates a date that is N business days before the given date
     * Business days exclude Saturday (6) and Sunday (0)
     * @param {Date|string} startDate - The starting date
     * @param {number} businessDays - Number of business days to go back
     * @returns {Date|null} - Date object, or null if calculation fails
     */
    function calculateBusinessDaysBefore(startDate, businessDays) {
        try {
            var date = new Date(startDate);
            if (isNaN(date.getTime())) {
                log.error('calculateBusinessDaysBefore', 'Invalid date: ' + startDate);
                return null;
            }
            
            var daysToSubtract = 0;
            var businessDaysCounted = 0;
            
            // Go back day by day until we've counted enough business days
            while (businessDaysCounted < businessDays) {
                daysToSubtract++;
                var checkDate = new Date(date);
                checkDate.setDate(date.getDate() - daysToSubtract);
                
                var dayOfWeek = checkDate.getDay();
                // If it's not Saturday (6) or Sunday (0), it's a business day
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    businessDaysCounted++;
                }
            }
            
            var resultDate = new Date(date);
            resultDate.setDate(date.getDate() - daysToSubtract);
            resultDate.setHours(0, 0, 0, 0); // Set to midnight
            
            return resultDate;
            
        } catch (e) {
            log.error('calculateBusinessDaysBefore', 'Error calculating business days: ' + e.toString());
            return null;
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

