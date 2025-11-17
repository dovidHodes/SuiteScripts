/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

define([
    'N/record', 
    'N/log',
    './_dsh_lib_time_tracker'  // Time tracker library - same folder in SuiteScripts
], function(record, log, timeTrackerLib) {
    
    /**
     * Function to be executed before record submit.
     * Sets Amazon location number for routing purposes on Item Fulfillment records.
     */
    function afterSubmit(context) {
        try {
            
            // Load the updated record to get current values
            var updatedRecord = record.load({
                type: 'itemfulfillment',
                id: context.newRecord.id,
                isDynamic: false
            });
            
            // Check if entity ID is 1716, if not end immediately
            var entityId = parseInt(updatedRecord.getValue('entity'));
            if (entityId !== 1716) {
                log.debug('Entity Check', 'Entity ID is not 1716 (' + entityId + '), skipping processing');
                return;
            }
            
            // Check if routing status is not 2, 3, or 4, if it is then end immediately
            /*var routingStatus = parseInt(updatedRecord.getValue('custbody_routing_status'));
            if (routingStatus === 2 || routingStatus === 3 || routingStatus === 4) {
                log.debug('Routing Status Check', 'Routing status is 2, 3, or 4 (' + routingStatus + '), skipping processing');
                return;
            }*/
            
            log.debug('Amazon Location Number Setter', 'Processing Item Fulfillment: ' + updatedRecord.id);
            
            // Get the location from the first line (assuming only one location per IF)
            var lineCount = updatedRecord.getLineCount({ sublistId: 'item' });
            
            if (lineCount === 0) {
                log.debug('No Lines', 'No item lines found on Item Fulfillment');
                return;
            }
            
            // Get location from the first line
            var locationId = updatedRecord.getSublistValue({
                sublistId: 'item',
                fieldId: 'location',
                line: 0
            });
            
            if (!locationId) {
                log.debug('No Location', 'No location found on first line');
                return;
            }
            
            log.debug('Location Found', 'Location ID: ' + locationId);
            
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
            
            var ifTranId = updatedRecord.getValue('tranid') || updatedRecord.id;
            
            log.debug('applyAmazonRoutingRequest', 'Starting routing calculation - Location: ' + locationName + ', Amazon Loc#: ' + (amazonLocationNumber || 'NOT SET') + ', IF: ' + ifTranId + ' - Using IF quantities only');
            
            // Initialize totals for cartons, volume, weight, and pallets
            var totalCartons = 0;
            var totalVolume = 0;
            var totalWeight = 0;
            var totalPalletFraction = 0.0;
            
            // Process each item line for carton/volume/weight/pallet calculations
            for (var i = 0; i < lineCount; i++) {
                var itemId = updatedRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                });
                
                var itemQuantity = updatedRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'itemquantity',
                    line: i
                });
                
                // Process all lines with quantity > 0 (itemreceive check only needed during IF creation)
                if (itemId && itemQuantity > 0) {
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
                // Load the Item Fulfillment record fresh to make it editable
                var ifRecord = record.load({
                    type: 'itemfulfillment',
                    id: context.newRecord.id
                });
                
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
                
                // Calculate and set pickup date from SO MABD (1 business day before MABD)
                var pickupDateSet = false;
                try {
                    // Get the SO ID from the IF
                    var soId = updatedRecord.getValue('createdfrom');
                    if (soId) {
                        var soRecord = record.load({
                            type: 'salesorder',
                            id: soId,
                            isDynamic: false
                        });
                        
                        var mabdDate = soRecord.getValue('custbody_gbs_mabd');
                        if (mabdDate) {
                            // Calculate 1 business day before MABD
                            var requestedPickupDate = calculatePickupDateFromMABD(mabdDate, ifTranId);
                            
                            if (requestedPickupDate) {
                                ifRecord.setValue({
                                    fieldId: 'custbody_sps_date_118',
                                    value: requestedPickupDate
                                });
                                pickupDateSet = true;
                                log.debug('applyAmazonRoutingRequest', 'Set custbody_sps_date_118 to ' + formatDateForLog(requestedPickupDate) + ' for IF ' + ifTranId);
                            } else {
                                log.debug('applyAmazonRoutingRequest', 'No pickup date calculated or date too close, leaving custbody_sps_date_118 blank');
                            }
                        } else {
                            log.debug('applyAmazonRoutingRequest', 'SO ' + soId + ' has no MABD date, skipping pickup date calculation');
                        }
                    } else {
                        log.debug('applyAmazonRoutingRequest', 'IF ' + ifTranId + ' has no createdfrom (SO), skipping pickup date calculation');
                    }
                } catch (dateError) {
                    log.error('applyAmazonRoutingRequest', 'Error setting pickup date on IF ' + ifTranId + ': ' + dateError.toString());
                    pickupDateSet = false;
                }
                
                // If routing fields and pickup date were set successfully, set routing status
                if (pickupDateSet) {
                    try {
                        ifRecord.setValue({
                            fieldId: 'custbody_routing_status',
                            value: 1
                        });
                        log.debug('applyAmazonRoutingRequest', 'Set custbody_routing_status to 1 (ready for routing request)');
                    } catch (statusError) {
                        log.error('applyAmazonRoutingRequest', 'Error setting routing status on IF ' + ifTranId + ': ' + statusError.toString());
                    }
                }
                
                // Save the record with the new field values
                var recordId = ifRecord.save();
                log.debug('applyAmazonRoutingRequest', 'Routing fields set - Loc: ' + locationId + ', Amazon#: ' + amazonLocationNumber + ', Cartons: ' + totalCartons + ', Vol: ' + totalVolume.toFixed(2) + ' cu ft, Wt: ' + totalWeight.toFixed(2) + ', Pallets: ' + totalPallets + ', Request Type: ' + requestType);
                
                // Add time tracker lines for routing field population
                // Action ID 3 = "Request Routing" (3rd action in the list)
                // Action ID 4 = "Populate routing" (4th action in the list)
                try {
                    if (entityId) {
                        // First time tracker line - Request Routing (Employee 5)
                        try {
                            log.debug('Time Tracker - Request Routing', 'Adding time tracker line for IF: ' + ifTranId + ', Customer: ' + entityId + ', Action: Request Routing');
                            timeTrackerLib.addTimeTrackerLine({
                                actionId: 3, // Request Routing action ID
                                customerId: entityId,
                                timeSaved: 5, // 5 seconds
                                employeeId: 5
                            });
                            log.debug('Time Tracker - Request Routing', 'Successfully added time tracker line for employee 5, action 3');
                        } catch (timeTrackerError1) {
                            log.error('Time Tracker Error - Request Routing', 'Failed to add time tracker line for employee 5: ' + timeTrackerError1.toString());
                        }
                        
                        // Second time tracker line - Populate routing back (Employee 5)
                        try {
                            log.debug('Time Tracker - Populate Routing Back', 'Adding time tracker line for IF: ' + ifTranId + ', Customer: ' + entityId + ', Action: Populate routing');
                            timeTrackerLib.addTimeTrackerLine({
                                actionId: 4, // Populate routing action ID
                                customerId: entityId,
                                timeSaved: 5, // 5 seconds
                                employeeId: 5
                            });
                            log.debug('Time Tracker - Populate Routing Back', 'Successfully added time tracker line for employee 5, action 4');
                        } catch (timeTrackerError2) {
                            log.error('Time Tracker Error - Populate Routing Back', 'Failed to add time tracker line for employee 5: ' + timeTrackerError2.toString());
                        }
                    } else {
                        log.debug('Time Tracker', 'Skipping time tracker - no customer ID found on IF: ' + ifTranId);
                    }
                } catch (timeTrackerError) {
                    // Log error but don't fail the routing field population
                    log.error('Time Tracker Error', 'Failed to add time tracker lines for IF ' + ifTranId + ': ' + timeTrackerError.toString());
                }
            } else {
                log.warning('applyAmazonRoutingRequest', 'Amazon location number not found for location ' + locationId + ' (' + locationName + '), skipping routing field population');
            }
            
        } catch (e) {
            log.error('applyAmazonRoutingRequest', 'Error applying Amazon routing request: ' + e.toString());
        }
    }
    
    /**
     * Calculates the requested pickup date from SO MABD date
     * Calculates 1 business day before MABD (excluding Saturday and Sunday)
     * If the calculated date is within 1 business day from today, returns null
     * @param {Date|string} mabdDate - The MABD date from the SO
     * @param {string} ifTranId - Item Fulfillment transaction ID for logging
     * @returns {Date|null} - Date object, or null if should be left blank
     */
    function calculatePickupDateFromMABD(mabdDate, ifTranId) {
        try {
            if (!mabdDate) {
                log.debug('calculatePickupDateFromMABD', 'IF ' + ifTranId + ' - No MABD date provided, skipping pickup date calculation');
                return null;
            }
            
            log.debug('calculatePickupDateFromMABD', 'IF ' + ifTranId + ' MABD date: ' + mabdDate);
            
            // Calculate 1 business day before MABD (returns Date object)
            var pickupDateObj = calculateBusinessDaysBefore(mabdDate, 1);
            
            if (!pickupDateObj) {
                log.debug('calculatePickupDateFromMABD', 'Could not calculate pickup date from MABD: ' + mabdDate);
                return null;
            }
            
            // Set time to midnight for comparison
            pickupDateObj.setHours(0, 0, 0, 0);
            
            // Get current date
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Check if pickup date is within 1 business day from today
            var businessDaysBetween = countBusinessDaysBetween(today, pickupDateObj);
            
            if (businessDaysBetween <= 1) {
                log.debug('calculatePickupDateFromMABD', 'Calculated pickup date ' + formatDateForLog(pickupDateObj) + ' is within 1 business day from today (' + businessDaysBetween + ' business days), will leave field blank');
                return null;
            }
            
            log.debug('calculatePickupDateFromMABD', 'Calculated pickup date: ' + formatDateForLog(pickupDateObj) + ' (1 business day before MABD: ' + mabdDate + ')');
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
    
    return {
        afterSubmit: afterSubmit
    };
});
