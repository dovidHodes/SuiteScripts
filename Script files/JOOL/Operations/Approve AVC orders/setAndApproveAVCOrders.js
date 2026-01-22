/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

define([
    'N/record', 
    'N/log', 
    'N/error',
    './_dsh_lib_time_tracker'  // Time tracker library - same folder or use script ID if uploaded as library
], function(record, log, error, timeTrackerLib) {
    
    /**
     * Function definition to be triggered before record is saved.
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record
     * @param {Record} scriptContext.oldRecord - Old record
     * @param {string} scriptContext.type - Trigger type
     * @since 2015.2
     */
    function beforeSubmit(scriptContext) {
        try {
            var salesOrder = scriptContext.newRecord;
            
            // Only process for entity 1716
            var entityId = salesOrder.getValue({    fieldId: 'entity' });   
            if (entityId != 1716) { 
                   return;
            }

            var tranId = salesOrder.getValue({
                fieldId: 'tranid'
            });
            
            log.debug('AVC Order UE Started', 'Processing Sales Order: ' + tranId);
            
            var needsApproval = false;
            var note = '';
            
            // Create warehouse map with IDs, buffer stock, and names
            var warehouseMap = [
                { id: 38, bufferStock: 250, name: 'Rutgers' },
                { id: 4, bufferStock: 250, name: 'Westmark' }
            ];
            
            // Get line count
            var lineCount = salesOrder.getLineCount({
                sublistId: 'item'
            });
            
            log.debug('AVC Order UE - Line Count', 'Sales Order: ' + tranId + ', Total line items: ' + lineCount);
            
            // First pass: Collect all availability data for both locations
            var itemData = [];
            for (var i = 0; i < lineCount; i++) {
                var itemId = salesOrder.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });
                
                if (!itemId) {
                    continue;
                }
                
                var quantity = salesOrder.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    line: i
                });
                
                log.debug('AVC Order UE - Line Quantity', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Item: ' + itemId + ', Quantity: ' + quantity);
                
                // Load item record once to get units per carton and inventory
                var itemRecord = record.load({
                    type: record.Type.INVENTORY_ITEM,
                    id: itemId
                });
                
                var unitsPerCarton = itemRecord.getValue({
                    fieldId: 'custitemunits_per_carton'
                });
                
                log.debug('AVC Order UE - Carton Qty from Item Record', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Item: ' + itemId + ', Carton Qty (custitemunits_per_carton): ' + unitsPerCarton);
                
                // Check if quantity is divisible by units per carton
                var cartonIssue = false;
                if (unitsPerCarton && unitsPerCarton > 0) {
                    if (quantity % unitsPerCarton !== 0) {
                        needsApproval = true;
                        cartonIssue = true;
                        log.debug('AVC Order UE - Carton Check Failed', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Quantity not divisible by carton units');
                    } else {
                        log.debug('AVC Order UE - Carton Check Passed', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Quantity divisible by carton units');
                    }
                }
                
                // Get available quantity at both warehouses
                var availability = {};
                var noWarehouseHasEnough = true;
                
                log.debug('AVC Order UE - Warehouse Check Start', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Starting warehouse availability check');
                
                for (var w = 0; w < warehouseMap.length; w++) {
                    var warehouse = warehouseMap[w];
                    
                    log.debug('AVC Order UE - Checking Warehouse', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Warehouse: ' + warehouse.name + ' (ID: ' + warehouse.id + ')');
                    
                    // Get available quantity for item at this warehouse
                    var onHandQty = 0;
                    try {
                        // Get quantity from item location sublist
                        var locCount = itemRecord.getLineCount({
                            sublistId: 'locations'
                        });
                        
                        log.debug('AVC Order UE - Location Count', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Item locations: ' + locCount);
                        
                        for (var loc = 0; loc < locCount; loc++) {
                            var locId = itemRecord.getSublistValue({
                                sublistId: 'locations',
                                fieldId: 'location',
                                line: loc
                            });
                            
                            if (locId == warehouse.id) {
                                onHandQty = parseFloat(itemRecord.getSublistValue({
                                    sublistId: 'locations',
                                    fieldId: 'quantityavailable',
                                    line: loc
                                }) || 0);
                                log.debug('AVC Order UE - Found Location', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Warehouse: ' + warehouse.name + ', On-Hand Qty: ' + onHandQty);
                                break;
                            }
                        }
                        
                    } catch (e) {
                        log.error('Error getting inventory', 'Sales Order: ' + tranId + ', Item: ' + itemId + ', Warehouse: ' + warehouse.id + ', Error: ' + e.toString());
                    }
                    
                    // Calculate available quantity (on-hand minus buffer)
                    var availableQty = parseFloat(onHandQty) - warehouse.bufferStock;
                    
                    log.debug('AVC Order UE - Available Qty Calc', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', Warehouse: ' + warehouse.name + ', On-Hand: ' + onHandQty + ', Buffer: ' + warehouse.bufferStock + ', Available: ' + availableQty + ', Required: ' + quantity);
                    
                    // Store availability for this warehouse
                    availability[warehouse.id] = {
                        warehouse: warehouse,
                        availableQty: availableQty,
                        onHandQty: onHandQty,
                        hasEnough: availableQty >= quantity,
                        isBufferIssue: onHandQty >= quantity && availableQty < quantity
                    };
                    
                    if (availableQty >= quantity) {
                        noWarehouseHasEnough = false;
                    }
                }
                
                // If no warehouse has enough quantity
                if (noWarehouseHasEnough) {
                    needsApproval = true;
                    log.debug('AVC Order UE - No Warehouse Has Enough', 'Sales Order: ' + tranId + ', Line ' + (i + 1) + ', No warehouse has sufficient quantity');
                }
                
                // Store item data with full availability snapshot
                itemData.push({
                    lineIndex: i,
                    itemId: itemId,
                    quantity: quantity,
                    unitsPerCarton: unitsPerCarton,
                    cartonIssue: cartonIssue,
                    availability: availability,
                    noWarehouseHasEnough: noWarehouseHasEnough
                });
            }
            
            log.debug('AVC Order UE - Availability Snapshot Complete', 'Sales Order: ' + tranId + ', Collected availability for ' + itemData.length + ' items');
            
            // Second pass: Categorize each line item into one of 3 possibilities
            log.debug('AVC Order UE - Categorizing Items', 'Sales Order: ' + tranId + ', Starting item categorization');
            
            var itemsBoth = [];      // Category 1: Both locations have qty
            var itemsOnly4 = [];     // Category 2: Only enough qty from 4
            var itemsOnly38 = [];    // Category 3: Only enough qty from 38
            var itemsNoQty = [];     // Items with no availability
            
            for (var d = 0; d < itemData.length; d++) {
                var item = itemData[d];
                
                // Skip items with no availability for categorization
                if (item.noWarehouseHasEnough) {
                    itemsNoQty.push(item);
                    continue;
                }
                
                var has38 = item.availability[38] && item.availability[38].hasEnough;
                var has4 = item.availability[4] && item.availability[4].hasEnough;
                
                var avail38Qty = item.availability[38] ? item.availability[38].availableQty : 0;
                var avail4Qty = item.availability[4] ? item.availability[4].availableQty : 0;
                
                log.debug('AVC Order UE - Categorizing Item', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Has38: ' + has38 + ' (qty: ' + avail38Qty + '), Has4: ' + has4 + ' (qty: ' + avail4Qty + '), Required: ' + item.quantity);
                
                // Categorize into one of 3 possibilities
                if (has38 && has4) {
                    itemsBoth.push(item);
                    item.category = 'both';
                    log.debug('AVC Order UE - Categorized as Both', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Available at both locations');
                } else if (!has38 && has4) {
                    itemsOnly4.push(item);
                    item.category = 'only4';
                    log.debug('AVC Order UE - Categorized as Only4', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Only available at location 4');
                } else if (has38 && !has4) {
                    itemsOnly38.push(item);
                    item.category = 'only38';
                    log.debug('AVC Order UE - Categorized as Only38', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Only available at location 38');
                } else {
                    log.error('AVC Order UE - Categorization Failed', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Has38: ' + has38 + ', Has4: ' + has4 + ', This should not happen if noWarehouseHasEnough is false');
                }
            }
            
            log.debug('AVC Order UE - Item Categories', 'Sales Order: ' + tranId + ', Both: ' + itemsBoth.length + ', Only4: ' + itemsOnly4.length + ', Only38: ' + itemsOnly38.length + ', NoQty: ' + itemsNoQty.length);
            
            // Helper function to generate reason message for items only available at one location
            function getSingleLocationReason(item, warehouseId, warehouseName, bufferStock) {
                var reason = 'Item only available at ' + warehouseName + '.';
                var avail = item.availability[warehouseId];
                
                // Check if this is due to buffer (on-hand has enough but buffer reduces available)
                if (avail && avail.isBufferIssue && avail.onHandQty >= item.quantity) {
                    reason += ' Due to buffer of ' + bufferStock + '.';
                }
                
                return reason;
            }
            
            // Determine location assignment strategy
            var assignedLocationMap = {}; // Map to store assigned location for each item
            
            // Strategy 1: If all can be from both options, always prioritize all to go out from 38
            if (itemsBoth.length > 0 && itemsOnly4.length === 0 && itemsOnly38.length === 0) {
                log.debug('AVC Order UE - Strategy 1', 'Sales Order: ' + tranId + ', All items can use both - assigning all to 38');
                for (var i = 0; i < itemsBoth.length; i++) {
                    assignedLocationMap[itemsBoth[i].lineIndex] = {
                        warehouse: 38,
                        reason: 'All items can be fulfilled from both locations. Assigned to Rutgers for consolidation.'
                    };
                }
            }
            // Strategy 2: If one line item only has qty in a specific location and the rest can go either way, set all to that location
            else if (itemsOnly4.length > 0 && itemsOnly38.length === 0 && itemsBoth.length > 0) {
                log.debug('AVC Order UE - Strategy 2a', 'Sales Order: ' + tranId + ', Items only in 4, rest can use both - assigning all to 4');
                // Assign all items to 4 (including itemsBoth)
                for (var i = 0; i < itemsOnly4.length; i++) {
                    assignedLocationMap[itemsOnly4[i].lineIndex] = {
                        warehouse: 4,
                        reason: getSingleLocationReason(itemsOnly4[i], 4, warehouseMap[1].name, warehouseMap[1].bufferStock)
                    };
                }
                for (var i = 0; i < itemsBoth.length; i++) {
                    assignedLocationMap[itemsBoth[i].lineIndex] = {
                        warehouse: 4,
                        reason: 'Consolidated to Westmark because other items require this location.'
                    };
                }
            }
            else if (itemsOnly38.length > 0 && itemsOnly4.length === 0 && itemsBoth.length > 0) {
                log.debug('AVC Order UE - Strategy 2b', 'Sales Order: ' + tranId + ', Items only in 38, rest can use both - assigning all to 38');
                // Assign all items to 38 (including itemsBoth)
                for (var i = 0; i < itemsOnly38.length; i++) {
                    assignedLocationMap[itemsOnly38[i].lineIndex] = {
                        warehouse: 38,
                        reason: getSingleLocationReason(itemsOnly38[i], 38, warehouseMap[0].name, warehouseMap[0].bufferStock)
                    };
                }
                for (var i = 0; i < itemsBoth.length; i++) {
                    assignedLocationMap[itemsBoth[i].lineIndex] = {
                        warehouse: 38,
                        reason: 'Consolidated to Rutgers because other items require this location.'
                    };
                }
            }
            // Strategy 3: If one line has qty in 4 but not in 38 AND another line has qty in 38 but not in 4, set each line what they need and set either way to 38
            else if (itemsOnly4.length > 0 && itemsOnly38.length > 0) {
                log.debug('AVC Order UE - Strategy 3', 'Sales Order: ' + tranId + ', Conflicting location requirements - assigning based on need, both options go to 38');
                // Assign itemsOnly4 to 4
                for (var i = 0; i < itemsOnly4.length; i++) {
                    assignedLocationMap[itemsOnly4[i].lineIndex] = {
                        warehouse: 4,
                        reason: getSingleLocationReason(itemsOnly4[i], 4, warehouseMap[1].name, warehouseMap[1].bufferStock)
                    };
                }
                // Assign itemsOnly38 to 38
                for (var i = 0; i < itemsOnly38.length; i++) {
                    assignedLocationMap[itemsOnly38[i].lineIndex] = {
                        warehouse: 38,
                        reason: getSingleLocationReason(itemsOnly38[i], 38, warehouseMap[0].name, warehouseMap[0].bufferStock)
                    };
                }
                // Assign itemsBoth to 38 (prioritize 38 for items without bias)
                for (var i = 0; i < itemsBoth.length; i++) {
                    assignedLocationMap[itemsBoth[i].lineIndex] = {
                        warehouse: 38,
                        reason: 'Item available at both locations. Assigned to Rutgers for consolidation.'
                    };
                }
            }
            // Fallback: If only itemsOnly4 or itemsOnly38 exist (no itemsBoth)
            else if (itemsOnly4.length > 0 && itemsOnly38.length === 0) {
                log.debug('AVC Order UE - Fallback Only4', 'Sales Order: ' + tranId + ', Only items requiring 4');
                for (var i = 0; i < itemsOnly4.length; i++) {
                    assignedLocationMap[itemsOnly4[i].lineIndex] = {
                        warehouse: 4,
                        reason: getSingleLocationReason(itemsOnly4[i], 4, warehouseMap[1].name, warehouseMap[1].bufferStock)
                    };
                }
            }
            else if (itemsOnly38.length > 0 && itemsOnly4.length === 0) {
                log.debug('AVC Order UE - Fallback Only38', 'Sales Order: ' + tranId + ', Only items requiring 38');
                for (var i = 0; i < itemsOnly38.length; i++) {
                    assignedLocationMap[itemsOnly38[i].lineIndex] = {
                        warehouse: 38,
                        reason: getSingleLocationReason(itemsOnly38[i], 38, warehouseMap[0].name, warehouseMap[0].bufferStock)
                    };
                }
            }
            
            // Final fallback: Assign any remaining itemsBoth that weren't caught by strategies above
            for (var i = 0; i < itemsBoth.length; i++) {
                if (!assignedLocationMap[itemsBoth[i].lineIndex]) {
                    log.debug('AVC Order UE - Final Fallback Both', 'Sales Order: ' + tranId + ', Line ' + (itemsBoth[i].lineIndex + 1) + ', Unassigned itemsBoth - assigning to 38');
                    assignedLocationMap[itemsBoth[i].lineIndex] = {
                        warehouse: 38,
                        reason: 'Item available at both locations. Assigned to Rutgers for consolidation.'
                    };
                }
            }
            
            // Assign locations and build notes
            for (var d = 0; d < itemData.length; d++) {
                var item = itemData[d];
                var lineNote = '';
                
                // Add carton issue note if applicable
                if (item.cartonIssue) {
                    needsApproval = true;
                    lineNote += 'Quantity (' + item.quantity + ') is not divisible by units per carton (' + item.unitsPerCarton + '). ';
                }
                
                // Handle items with no availability
                if (item.noWarehouseHasEnough) {
                    needsApproval = true;
                    lineNote += 'No qty avail at both locations. ';
                } else {
                    // Get assigned location from map
                    var assignment = assignedLocationMap[item.lineIndex];
                    
                    // Safety check: If item wasn't assigned but should be, assign based on category
                    if (!assignment && item.category) {
                        var has38 = item.availability[38] && item.availability[38].hasEnough;
                        var has4 = item.availability[4] && item.availability[4].hasEnough;
                        
                        if (item.category === 'both' && has38 && has4) {
                            assignment = {
                                warehouse: 38,
                                reason: 'Item available at both locations. Assigned to Rutgers for consolidation.'
                            };
                            log.debug('AVC Order UE - Safety Assignment Both', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Item available at both - assigning to 38');
                        } else if (item.category === 'only4' && has4) {
                            assignment = {
                                warehouse: 4,
                                reason: getSingleLocationReason(item, 4, warehouseMap[1].name, warehouseMap[1].bufferStock)
                            };
                            log.debug('AVC Order UE - Safety Assignment Only4', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Item only at 4 - assigning to 4');
                        } else if (item.category === 'only38' && has38) {
                            assignment = {
                                warehouse: 38,
                                reason: getSingleLocationReason(item, 38, warehouseMap[0].name, warehouseMap[0].bufferStock)
                            };
                            log.debug('AVC Order UE - Safety Assignment Only38', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Item only at 38 - assigning to 38');
                        }
                    }
                    
                    if (assignment) {
                        salesOrder.setSublistValue({
                            sublistId: 'item',
                            fieldId: 'location',
                            line: item.lineIndex,
                            value: assignment.warehouse
                        });
                        
                        var warehouseName = (assignment.warehouse == 38) ? warehouseMap[0].name : warehouseMap[1].name;
                        lineNote += assignment.reason + ' ';
                        log.debug('AVC Order UE - Location Assigned', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Location: ' + assignment.warehouse + ', Reason: ' + assignment.reason);
                    } else {
                        // Ultimate fallback: assign based on actual availability
                        var has38 = item.availability[38] && item.availability[38].hasEnough;
                        var has4 = item.availability[4] && item.availability[4].hasEnough;
                        
                        if (has38 && has4) {
                            salesOrder.setSublistValue({
                                sublistId: 'item',
                                fieldId: 'location',
                                line: item.lineIndex,
                                value: 38
                            });
                            lineNote += 'Item available at both locations. Assigned to Rutgers for consolidation. ';
                            log.debug('AVC Order UE - Ultimate Fallback Both', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Available at both - assigning to 38');
                        } else if (has4 && !has38) {
                            salesOrder.setSublistValue({
                                sublistId: 'item',
                                fieldId: 'location',
                                line: item.lineIndex,
                                value: 4
                            });
                            lineNote += getSingleLocationReason(item, 4, warehouseMap[1].name, warehouseMap[1].bufferStock) + ' ';
                            log.debug('AVC Order UE - Ultimate Fallback Only4', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Only at 4 - assigning to 4');
                        } else if (has38 && !has4) {
                            salesOrder.setSublistValue({
                                sublistId: 'item',
                                fieldId: 'location',
                                line: item.lineIndex,
                                value: 38
                            });
                            lineNote += getSingleLocationReason(item, 38, warehouseMap[0].name, warehouseMap[0].bufferStock) + ' ';
                            log.debug('AVC Order UE - Ultimate Fallback Only38', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Only at 38 - assigning to 38');
                        }
                    }
                }
                
                // Set the auto approve note field on line item
                if (lineNote) {
                    salesOrder.setSublistValue({
                        sublistId: 'item',
                        fieldId: 'custcol_auto_approve_note',
                        line: item.lineIndex,
                        value: lineNote.trim()
                    });
                    log.debug('AVC Order UE - Line Note Set', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ', Note: ' + lineNote.trim());
                }
                
                // Add to main note if needed
                if (lineNote) {
                    note += 'Line ' + (item.lineIndex + 1) + ': ' + lineNote + '\n';
                }
                
                log.debug('AVC Order UE - Line Complete', 'Sales Order: ' + tranId + ', Line ' + (item.lineIndex + 1) + ' processing complete');
            }
            
            // If needs approval, set order status to 'A', otherwise set to 'B'
            if (needsApproval) {
                salesOrder.setValue({
                    fieldId: 'orderstatus',
                    value: 'A'
                });
                log.debug('AVC Order UE - Approval Set', 'Sales Order: ' + tranId + ', Order status set to A (needs approval)');
            } else {
                salesOrder.setValue({
                    fieldId: 'orderstatus',
                    value: 'B'
                });
                log.debug('AVC Order UE - Auto Approved', 'Sales Order: ' + tranId + ', Order status set to B (auto approved)');
                
                // Add time tracker line for order approval
                // Action ID 1 = "Approve order" (1st action in the list)
                try {
                    if (entityId) {
                        log.debug('Time Tracker - Approve Order', 'Adding time tracker line for Sales Order: ' + tranId + ', Customer: ' + entityId);
                        timeTrackerLib.addTimeTrackerLine({
                            actionId: 1, // Approve order action ID
                            customerId: entityId,
                            timeSaved: 30, // 30 seconds saved
                            employeeId: 5
                        });
                        log.debug('Time Tracker - Approve Order', 'Successfully added time tracker line for Sales Order: ' + tranId);
                    } else {
                        log.debug('Time Tracker - Approve Order', 'Skipping time tracker - no customer ID found on Sales Order: ' + tranId);
                    }
                } catch (timeTrackerError) {
                    // Log error but don't fail the order approval
                    log.error('Time Tracker Error - Approve Order', 'Failed to add time tracker line for Sales Order: ' + tranId + ', Error: ' + timeTrackerError.toString());
                }
            }
            
            log.debug('AVC Order Processing Complete', 'Sales Order: ' + tranId + ', Needs Approval: ' + needsApproval);
            
        } catch (e) {
            log.error('Error in approve_avc_orders_ue', e.toString());
            throw e;
        }
    }
    
    return {
        beforeSubmit: beforeSubmit
    };
});

