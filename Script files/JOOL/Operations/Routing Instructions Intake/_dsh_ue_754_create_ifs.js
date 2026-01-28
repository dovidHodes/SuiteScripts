/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * User Event script for customtransaction_754 that creates Item Fulfillments
 * from Sales Orders referenced on each line (custcol_754_sales_order).
 *
 * Deployment: Set "Applies To" to customtransaction_754
 * Event: afterSubmit (create only)
 */

define([
    'N/record',
    'N/log',
    'N/error'
], function(record, log, error) {

    // Function executed after record is submitted (create only)
    // Creates Item Fulfillments from Sales Orders referenced on each line
    // scriptContext - Object containing newRecord and type
    // scriptContext.newRecord - New record that was saved
    // scriptContext.type - Trigger type (create, edit, etc.)
    function afterSubmit(scriptContext) {
        try {
            var newRecord = scriptContext.newRecord;
            var type = scriptContext.type;


            var recordId = newRecord.id;
            var tranId = newRecord.getValue('tranid') || recordId;

            log.debug('afterSubmit', 'Processing customtransaction_754 afterSubmit: ' + tranId);

            // Get warehouse location from header
            var warehouseLocationId = newRecord.getValue('custbody_warehouse_location');
            if (!warehouseLocationId) {
                log.debug('afterSubmit', 'No warehouse location found, skipping IF creation');
                return;
            }

            // Get line count
            var lineCount = newRecord.getLineCount({
                sublistId: 'line'
            });

            if (lineCount < 0) {
                log.audit('afterSubmit', 'Invalid line count (' + lineCount + ') - sublist "line" may not exist or be accessible. Skipping IF creation.');
                return;
            }

            log.debug('afterSubmit', 'Processing ' + lineCount + ' line(s) for IF creation');

            var ifsCreated = 0;
            var errors = [];

            // Process each line
            for (var i = 0; i < lineCount; i++) {
                try {
                    var soId = newRecord.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_754_sales_order',
                        line: i
                    });

                    if (!soId) {
                        log.debug('afterSubmit', 'Line ' + i + ': No Sales Order ID, skipping IF creation');
                        continue;
                    }

                    // Get pallet count from 754 line
                    var palletCount754 = newRecord.getSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_quantity_shipping',
                        line: i
                    });

                    if (!palletCount754 || palletCount754 <= 0) {
                        var errorMsg = 'Line ' + (i + 1) + ': Pallet count (custcol_quantity_shipping) is missing or zero. Cannot create IF.';
                        errors.push(errorMsg);
                        log.audit('afterSubmit', errorMsg);
                        continue;
                    }

                    log.debug('afterSubmit', 'Line ' + i + ': Pallet count from 754 line: ' + palletCount754);

                    // Load the Sales Order
                    var soRecord = record.load({
                        type: record.Type.SALES_ORDER,
                        id: soId,
                        isDynamic: false
                    });

                    var soTranId = soRecord.getValue('tranid') || soId;
                    log.debug('afterSubmit', 'Line ' + i + ': SO TranID: ' + soTranId);

                    // Calculate total pallets needed for the SO
                    var soPallets = calculateSOTotalPallets(soRecord);
                    log.debug('afterSubmit', 'Line ' + i + ': Calculated SO pallets: ' + soPallets + ', 754 line pallets: ' + palletCount754);

                    // Determine SO fulfillment type: full SO or split across loads
                    var fulfillmentType = determineSOFulfillmentType(soPallets, palletCount754);

                    if (fulfillmentType.type === 'error') {
                        // Error case: SO pallets < 754 pallets (should not happen)
                        var errorMsg = 'Line ' + (i + 1) + ': ' + fulfillmentType.error;
                        errors.push(errorMsg);
                        log.audit('afterSubmit', errorMsg);
                        continue;
                    } else if (fulfillmentType.type === 'split') {
                        // Split case: PO is split across multiple loads (754s)
                        log.debug('afterSubmit', 'Line ' + i + ': SO pallets (' + soPallets + ') > 754 line pallets (' + palletCount754 + ') - PO split across multiple loads');
                        handleExcessPallets(soRecord, soPallets, palletCount754);
                        // Don't treat as error - this is expected for split POs
                        continue;
                    }

                    // Full SO case: 754 line represents full SO, create IF with all lines
                    var soLineCount = soRecord.getLineCount({
                        sublistId: 'item'
                    });
                    var allLineIndices = [];
                    for (var j = 0; j < soLineCount; j++) {
                        allLineIndices.push(j);
                    }

                    log.debug('afterSubmit', 'Line ' + i + ': Full SO - creating IF from SO: ' + soId + ' with ' + allLineIndices.length + ' line(s)');

                    // Create Item Fulfillment using the proper function with all lines
                    var ifId = createItemFulfillment(soRecord, warehouseLocationId, allLineIndices);

                    if (ifId) {
                        // Get IF tranID for logging
                        var ifRecord = record.load({
                            type: record.Type.ITEM_FULFILLMENT,
                            id: ifId,
                            isDynamic: false
                        });
                        var ifTranId = ifRecord.getValue('tranid') || ifId;
                        log.audit('afterSubmit', 'Line ' + i + ': Created IF ' + ifTranId + ' from SO ' + soTranId);
                        ifsCreated++;
                    } else {
                        var errorMsg = 'Line ' + (i + 1) + ': Failed to create IF - no IF ID returned';
                        errors.push(errorMsg);
                        log.error('afterSubmit', errorMsg);
                    }

                } catch (lineError) {
                    var errorMsg = 'Line ' + (i + 1) + ': Error creating IF - ' + lineError.toString();
                    errors.push(errorMsg);
                    log.error('afterSubmit', 'Error processing line ' + i + ': ' + lineError.toString());
                    // Continue processing other lines even if one fails
                }
            }

            // Append any errors to the issue field and set status to 'C'
            if (errors.length > 0) {
                updateRecordWithErrors(recordId, errors);
            }

            log.audit('afterSubmit', 'Completed IF creation for ' + tranId + ': Created ' + ifsCreated + ' IF(s), ' + errors.length + ' error(s)');

        } catch (e) {
            log.error('afterSubmit', 'Error in afterSubmit: ' + e.toString());
            log.error('afterSubmit', 'Stack trace: ' + e.stack);
            
            // Try to set status to 'C' due to error
            try {
                var recordId = scriptContext.newRecord.id;
                var errorMsg = 'Unexpected error in IF creation script: ' + e.toString();
                updateRecordWithErrors(recordId, [errorMsg]);
                log.audit('afterSubmit', 'Set status to C due to unexpected error');
            } catch (statusError) {
                log.error('afterSubmit', 'Failed to set status to C in error handler: ' + statusError.toString());
            }
            // Don't throw - allow record to be saved even if IF creation fails
        }
    }

    // Calculates total pallets needed for a Sales Order based on line-level units per pallet and units per carton
    // Cannot split cartons across pallets
    // soRecord - Sales Order record
    // Returns: Total pallets needed
    function calculateSOTotalPallets(soRecord) {
        var totalPallets = 0;
        var soLineCount = soRecord.getLineCount({
            sublistId: 'item'
        });

        log.debug('calculateSOTotalPallets', 'Processing ' + soLineCount + ' SO line(s)');

        for (var i = 0; i < soLineCount; i++) {
            try {
                var quantity = soRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'quantity',
                    line: i
                });

                var unitsPerPallet = soRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'custcol_upp_westmark',
                    line: i
                });

                var unitsPerCarton = soRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'custcol_units_per_carton_1_line_field',
                    line: i
                });

                // Skip if required values are missing or zero
                if (!quantity || quantity <= 0) {
                    log.debug('calculateSOTotalPallets', 'Line ' + i + ': Quantity is missing or zero, skipping');
                    continue;
                }

                if (!unitsPerCarton || unitsPerCarton <= 0) {
                    log.debug('calculateSOTotalPallets', 'Line ' + i + ': Units per carton is missing or zero, skipping');
                    continue;
                }

                if (!unitsPerPallet || unitsPerPallet <= 0) {
                    log.debug('calculateSOTotalPallets', 'Line ' + i + ': Units per pallet is missing or zero, skipping');
                    continue;
                }

                // Calculate pallets needed for this line
                // Cannot split cartons across pallets
                var cartonsNeeded = Math.ceil(quantity / unitsPerCarton);
                var cartonsPerPallet = Math.floor(unitsPerPallet / unitsPerCarton);

                if (cartonsPerPallet <= 0) {
                    log.warning('calculateSOTotalPallets', 'Line ' + i + ': Cartons per pallet is zero or negative (UPP: ' + unitsPerPallet + ', UPC: ' + unitsPerCarton + '), skipping');
                    continue;
                }

                var palletsForLine = Math.ceil(cartonsNeeded / cartonsPerPallet);
                totalPallets += palletsForLine;

                log.debug('calculateSOTotalPallets', 'Line ' + i + ': Qty=' + quantity + ', UPC=' + unitsPerCarton + ', UPP=' + unitsPerPallet + ', Cartons=' + cartonsNeeded + ', Cartons/Pallet=' + cartonsPerPallet + ', Pallets=' + palletsForLine);

            } catch (lineError) {
                log.error('calculateSOTotalPallets', 'Error processing SO line ' + i + ': ' + lineError.toString());
                // Continue processing other lines
            }
        }

        log.debug('calculateSOTotalPallets', 'Total pallets calculated: ' + totalPallets);
        return totalPallets;
    }

    // Placeholder function for handling excess pallets when SO pallets > 754 pallets
    // Future implementation will decide which lines go onto which pallet
    // soRecord - Sales Order record
    // soPallets - Calculated pallets from SO
    // targetPallets - Target pallets from 754 line
    function handleExcessPallets(soRecord, soPallets, targetPallets) {
        log.debug('handleExcessPallets', 'Split logic not yet implemented. SO pallets: ' + soPallets + ', Target pallets: ' + targetPallets);
        // Placeholder for future implementation
        return;
    }

    // Determines SO fulfillment type: full SO or split across multiple loads (754s)
    // soPallets - Calculated pallets from SO
    // palletCount754 - Pallet count from 754 line
    // Returns: Object with {type: 'full'|'split'|'error', error: string|null}
    //   'full' - 754 line represents full SO, create IF
    //   'split' - PO is split across multiple loads (754s), handle split logic
    //   'error' - SO pallets < 754 pallets (should not happen)
    function determineSOFulfillmentType(soPallets, palletCount754) {
        if (soPallets < palletCount754) {
            return {
                type: 'error',
                error: 'Sales Order pallet count (' + soPallets + ') is less than 754 line pallet count (' + palletCount754 + '). Cannot create IF.'
            };
        } else if (soPallets > palletCount754) {
            return {
                type: 'split',
                error: null
            };
        }
        return { type: 'full', error: null };
    }

    // Creates Item Fulfillment from Sales Order with specified line indices
    // Uses the same syntax pattern as autoIF.js
    // soRecord - Sales Order record
    // warehouseLocationId - Warehouse location ID to use for IF
    // lineIndices - Array of SO line indices to fulfill (0-based)
    // Returns: IF ID if successful, null otherwise
    function createItemFulfillment(soRecord, warehouseLocationId, lineIndices) {
        var ifId = null;
        try {
            var salesOrderId = soRecord.id;
            var soTranId = soRecord.getValue('tranid') || salesOrderId;

            log.debug('createItemFulfillment', 'Creating IF for SO ' + soTranId + ', Location: ' + warehouseLocationId + ', Lines: ' + lineIndices.join(', '));

            // Transform sales order to item fulfillment
            log.debug('createItemFulfillment', 'Transforming SO ' + soTranId + ' to Item Fulfillment');
            var ifRecord = record.transform({
                fromType: record.Type.SALES_ORDER,
                fromId: salesOrderId,
                toType: record.Type.ITEM_FULFILLMENT,
                isDynamic: true
            });

            var totalLines = ifRecord.getLineCount({
                sublistId: 'item'
            });

            log.debug('createItemFulfillment', 'IF transformed with ' + totalLines + ' line(s). Filtering for ' + lineIndices.length + ' specified line(s)');

            if (totalLines === 0) {
                log.error('createItemFulfillment', 'No lines in transformed item fulfillment for SO ' + soTranId);
                throw error.create({
                    name: 'NO_LINES_IN_IF',
                    message: 'No lines in transformed item fulfillment'
                });
            }

            // Convert lineIndices to a Set for faster lookup
            var lineIndicesSet = {};
            for (var idx = 0; idx < lineIndices.length; idx++) {
                lineIndicesSet[lineIndices[idx]] = true;
            }

            var linesFulfilled = 0;
            var fulfilledItems = [];

            // Loop through all lines and set itemreceive based on lineIndices
            for (var currentLine = 0; currentLine < totalLines; currentLine++) {
                ifRecord.selectLine({
                    sublistId: 'item',
                    line: currentLine
                });

                var lineItem = ifRecord.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'item'
                });

                var lineQty = ifRecord.getCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'itemquantity'
                });

                var shouldFulfill = lineIndicesSet[currentLine] === true;

                if (shouldFulfill) {
                    ifRecord.setCurrentSublistValue({
                        sublistId: 'item',
                        fieldId: 'itemreceive',
                        value: true
                    });
                    linesFulfilled++;
                    fulfilledItems.push('Item:' + lineItem + ',Qty:' + lineQty);
                } else {
                    // Ensure non-specified lines are not fulfilled
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

            log.debug('createItemFulfillment', 'Lines fulfilled: ' + linesFulfilled + ' - ' + fulfilledItems.join('; '));

            // Check if we have at least one line to fulfill
            if (linesFulfilled === 0) {
                log.error('createItemFulfillment', 'No lines to fulfill for specified line indices on SO ' + soTranId);
                throw error.create({
                    name: 'NO_LINES_REMAINING',
                    message: 'No lines to fulfill for specified line indices'
                });
            }

            // Set the ship from location field
            log.debug('createItemFulfillment', 'Setting custbody_ship_from_location to ' + warehouseLocationId);
            ifRecord.setValue({
                fieldId: 'custbody_ship_from_location',
                value: warehouseLocationId
            });

            // Note: location field is set automatically from SO transform, don't override it

            // Save the IF (matching autoIF.js pattern - no options)
            log.debug('createItemFulfillment', 'Saving Item Fulfillment for location ' + warehouseLocationId);
            try {
                ifId = ifRecord.save();
            } catch (saveError) {
                log.error('createItemFulfillment', 'Error saving IF: ' + saveError.toString());
                log.error('createItemFulfillment', 'Save error details: ' + JSON.stringify(saveError));
                // Try to get more details about validation errors
                if (saveError.details) {
                    log.error('createItemFulfillment', 'Save error details object: ' + JSON.stringify(saveError.details));
                }
                if (saveError.cause) {
                    log.error('createItemFulfillment', 'Save error cause: ' + JSON.stringify(saveError.cause));
                }
                throw saveError;
            }

            // Get IF tranID for logging
            var savedIfRecord = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId,
                isDynamic: true
            });
            var ifTranId = savedIfRecord.getValue('tranid');

            log.debug('createItemFulfillment', 'IF saved as ' + ifTranId);
            log.audit('createItemFulfillment', 'Successfully created IF ' + ifTranId + ' for location ' + warehouseLocationId + ' on SO ' + soTranId + ' with ' + linesFulfilled + ' line(s)');

            return ifId;

        } catch (e) {
            // If IF was already created (saved), return it even if field population failed
            if (ifId) {
                log.error('createItemFulfillment', 'Error setting fields on IF ' + ifId + ' for location ' + warehouseLocationId + ' on SO ' + (soRecord.getValue('tranid') || soRecord.id) + ': ' + e.toString());
                log.error('createItemFulfillment', 'IF was created successfully, returning ifId despite field population error');
                return ifId; // Return the IF ID - field population errors don't matter
            }

            // Only throw if IF creation itself failed
            log.error('createItemFulfillment', 'Error creating IF for location ' + warehouseLocationId + ' on SO ' + (soRecord.getValue('tranid') || soRecord.id) + ': ' + e.toString());
            log.error('createItemFulfillment', 'Stack trace: ' + (e.stack || 'N/A'));
            throw e;
        }
    }

    // Updates the 754 record with error messages and sets status to 'C'
    // recordId - 754 record ID
    // errors - Array of error messages
    function updateRecordWithErrors(recordId, errors) {
        try {
            var recordToUpdate = record.load({
                type: 'customtransaction_754',
                id: recordId,
                isDynamic: true
            });

            var existingIssue = recordToUpdate.getValue('custbody_issue') || '';
            var errorText = errors.join('\n');
            var newIssueValue = existingIssue ? (existingIssue + '\n' + errorText) : errorText;

            recordToUpdate.setValue('custbody_issue', newIssueValue);
            recordToUpdate.setValue('transtatus', 'C');
            recordToUpdate.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
            });
            log.audit('updateRecordWithErrors', 'Set status to C due to errors');
        } catch (statusUpdateError) {
            log.error('updateRecordWithErrors', 'Failed to update status to C: ' + statusUpdateError.toString());
            log.error('updateRecordWithErrors', 'Status update error stack: ' + statusUpdateError.stack);
        }
    }


    return {
        afterSubmit: afterSubmit
    };
});
