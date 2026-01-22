/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Routing Calculator Library - Reusable function for calculating and applying routing fields
 * (cartons, volume, weight, pallets) for Item Fulfillments. Handles pallet sharing correctly.
 * Use this library function in all scripts that need to calculate routing information.
 */

define([
  'N/record',
  'N/log'
], function (record, log) {
  
  /**
   * Calculates and applies all routing fields to an Item Fulfillment
   * - Loads the IF record
   * - Gets location from IF
   * - Calculates routing fields (cartons, volume, weight, pallets with sharing)
   * - Applies fields to IF
   * - Calculates pickup date from SO MABD
   * - Sets routing status to 1
   * - Saves the record
   * 
   * @param {string|number} ifId - The Item Fulfillment internal ID
   * @returns {boolean} - True if successful, false otherwise
   */
  function calculateAndApplyRoutingFields(ifId) {
    try {
      if (!ifId) {
        log.error('Routing Calculator', 'Missing required parameter: ifId is required');
        return false;
      }
      
      log.debug('Routing Calculator', 'Starting routing calculation for IF: ' + ifId);
      
      // Load the IF record
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: true
      });
      
      var ifTranId = ifRecord.getValue('tranid') || ifId;
      var entityId = parseInt(ifRecord.getValue('entity'));
      
      // Only process entity 1716
      if (entityId !== 1716) {
        log.debug('Routing Calculator', 'Entity ID is not 1716 (' + entityId + '), skipping processing');
        return false;
      }
      
      // Get location from first line
      var lineCount = ifRecord.getLineCount({
        sublistId: 'item'
      });
      
      if (lineCount === 0) {
        log.debug('Routing Calculator', 'No item lines found on Item Fulfillment');
        return false;
      }
      
      var locationId = ifRecord.getSublistValue({
        sublistId: 'item',
        fieldId: 'location',
        line: 0
      });
      
      if (!locationId) {
        log.debug('Routing Calculator', 'No location found on first line');
        return false;
      }
      
      // Load location to get Amazon location number
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
      
      if (!amazonLocationNumber) {
        log.audit('Routing Calculator', 'Amazon location number not found for location ' + locationId + ' (' + locationName + '), skipping routing field population');
        return false;
      }
      
      log.debug('Routing Calculator', 'Location: ' + locationName + ' (' + locationId + '), Amazon Loc#: ' + amazonLocationNumber);
      
      // Initialize totals for cartons, volume, weight, and pallets
      var totalCartons = 0;
      var totalVolume = 0;
      var totalWeight = 0;
      var totalUnits = 0;
      
      // Store item data for pallet calculation
      var itemData = [];
      var hasMissingUPP = false; // Track if any items have missing units per pallet
      var missingUPPItems = []; // Track which items have missing UPP for email notification
      var hasMissingCartonWeight = false; // Track if any items have missing carton weight
      var missingCartonWeightItems = []; // Track which items have missing carton weight
      
      log.debug('Routing Calculator - Pallet Debug', '=== STARTING PALLET CALCULATION ===');
      log.debug('Routing Calculator - Pallet Debug', 'Total lines in IF: ' + lineCount + ' (processing all lines with quantity > 0)');
      
      // Process each item line for carton/volume/weight/pallet calculations
      for (var i = 0; i < lineCount; i++) {
        var itemId = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'item',
          line: i
        });
        
        var itemQuantity = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'itemquantity',
          line: i
        });
        
        // Process all lines with quantity > 0
        if (itemId && itemQuantity > 0) {
          // Load the item record
          var itemRecord = record.load({
            type: 'inventoryitem',
            id: itemId
          });
          
          var itemName = itemRecord.getValue('itemid') || itemId;
          
          // Calculate cartons
          var unitsPerCarton = itemRecord.getValue('custitemunits_per_carton') || 1;
          var itemCartons = Math.ceil(itemQuantity / unitsPerCarton);
          totalCartons += itemCartons;
          
          // Get cubic feet per carton
          var cubicFeetPerCarton = itemRecord.getValue('custitemcustitem_carton_cbf') || 0;
          var itemVolume = cubicFeetPerCarton * Math.max(1, itemCartons);
          totalVolume += itemVolume;
          
          // Get weight per carton
          var weightPerCartonFieldValue = itemRecord.getValue('custitemweight_carton_1');
          var weightPerCarton = weightPerCartonFieldValue || 0;
          var itemWeight = weightPerCarton * Math.max(1, itemCartons);
          totalWeight += itemWeight;
          
          // Check if carton weight is missing/null/empty
          if (!weightPerCartonFieldValue || weightPerCartonFieldValue === 0 || weightPerCartonFieldValue === '') {
            hasMissingCartonWeight = true;
            var locationNameForWeight = locationRecord.getValue('name') || locationId;
            missingCartonWeightItems.push({
              itemName: itemName,
              itemId: itemId,
              locationId: locationId,
              locationName: locationNameForWeight,
              quantity: itemQuantity
            });
            log.audit('Routing Calculator - Missing Carton Weight', 
                        'Item ' + itemName + ' (ID: ' + itemId + ') has missing/null/empty carton weight field. ' +
                        'Location: ' + locationId + ' (' + locationNameForWeight + '), Defaulting to 0 weight. ' +
                        'Routing status will be set to 4 (error requesting).');
          }
          
          // Get units per pallet based on location
          var unitsPerPallet = 0;
          var uppFieldValue = null;
          var isUPPEmpty = false;
          
          if (parseInt(locationId) === 4) { // Westmark
            uppFieldValue = itemRecord.getValue('custitem_units_per_pallet_westmark');
          } else if (parseInt(locationId) === 38) { // Rutgers
            uppFieldValue = itemRecord.getValue('custitemunits_per_pallet');
          } else {
            // For other locations, default to 1
            unitsPerPallet = 1;
          }
          
          // Check if UPP is missing/null/empty - DO NOT DEFAULT TO 1
          // More comprehensive check to catch all empty cases including whitespace
          if (uppFieldValue !== null && uppFieldValue !== undefined) {
            if (typeof uppFieldValue === 'string') {
              // Check for empty string or whitespace-only string
              isUPPEmpty = uppFieldValue.trim() === '';
            } else {
              // Check if it's a valid number
              var parsedValue = parseFloat(uppFieldValue);
              if (isNaN(parsedValue) || parsedValue <= 0) {
                isUPPEmpty = true;
              } else {
                unitsPerPallet = parsedValue;
              }
            }
          } else {
            // null or undefined
            isUPPEmpty = true;
          }
          
          // If UPP is empty, flag it and DO NOT use it in pallet calculations
          if (isUPPEmpty) {
            hasMissingUPP = true;
            var locationName = locationRecord.getValue('name') || locationId;
            missingUPPItems.push({
              itemName: itemName,
              itemId: itemId,
              locationId: locationId,
              locationName: locationName,
              quantity: itemQuantity
            });
            log.audit('Routing Calculator - Missing UPP', 
                        'Item ' + itemName + ' (ID: ' + itemId + ') has missing/null/empty units per pallet field. ' +
                        'Location: ' + locationId + ' (' + locationName + '). ' +
                        'Item will be EXCLUDED from pallet calculations. Routing status will be set to 4 (error requesting).');
            // DO NOT add this item to itemData for pallet calculations
            // Still process it for cartons/volume/weight, but skip pallet calculation
          } else {
            // UPP is valid, calculate individual pallet fraction and add to itemData
            var individualPalletFraction = 0;
            if (unitsPerPallet > 0) {
              individualPalletFraction = itemQuantity / unitsPerPallet;
            } else {
              individualPalletFraction = itemQuantity;
            }
            
            itemData.push({
              itemId: itemId,
              itemName: itemName,
              quantity: parseFloat(itemQuantity) || 0,  // Ensure quantity is a number
              unitsPerPallet: parseFloat(unitsPerPallet) || 1,  // Ensure unitsPerPallet is a number
              individualPalletFraction: individualPalletFraction
            });
            
            log.debug('Routing Calculator - Pallet Debug', 
                      'Line ' + i + ': ' + itemName + 
                      ' - Qty: ' + itemQuantity + 
                      ', Units/Pallet: ' + unitsPerPallet +
                      ', Individual Pallet Fraction: ' + individualPalletFraction.toFixed(3));
          }
          
          totalUnits += itemQuantity;
        }
      }
      
      // Calculate pallets allowing items to share pallets
      log.debug('Routing Calculator - Pallet Debug', '=== GROUPING ITEMS FOR PALLET SHARING ===');
      log.debug('Routing Calculator - Pallet Debug', 'Total items to process: ' + itemData.length);
      
      var totalPallets = 0;
      var oldMethodTotalPallets = 0;
      
      if (itemData.length > 0) {
        // Calculate OLD METHOD for comparison
        for (var oldIdx = 0; oldIdx < itemData.length; oldIdx++) {
          oldMethodTotalPallets += itemData[oldIdx].individualPalletFraction;
        }
        oldMethodTotalPallets = Math.max(1, Math.ceil(oldMethodTotalPallets));
        log.debug('Routing Calculator - Pallet Debug', 
                  'OLD METHOD (sum individual fractions): ' + oldMethodTotalPallets.toFixed(3) + 
                  ' → ' + oldMethodTotalPallets + ' pallets');
        
        // Group items by units per pallet
        var palletGroups = {};
        for (var j = 0; j < itemData.length; j++) {
          var unitsPerPallet = parseFloat(itemData[j].unitsPerPallet) || 1;  // Ensure it's a number
          var quantity = parseFloat(itemData[j].quantity) || 0;  // Ensure it's a number
          if (!palletGroups[unitsPerPallet]) {
            palletGroups[unitsPerPallet] = {
              totalUnits: 0,
              items: []
            };
          }
          palletGroups[unitsPerPallet].totalUnits += quantity;  // Now it will add, not concatenate
          palletGroups[unitsPerPallet].items.push({
            name: itemData[j].itemName,
            quantity: itemData[j].quantity
          });
        }
        
        log.debug('Routing Calculator - Pallet Debug', 
                  'Found ' + Object.keys(palletGroups).length + ' pallet group(s)');
        
        // Calculate pallets for each group
        for (var unitsPerPalletKey in palletGroups) {
          var groupData = palletGroups[unitsPerPalletKey];
          var groupUnits = groupData.totalUnits;
          var unitsPerPalletValue = parseFloat(unitsPerPalletKey);
          
          var itemList = [];
          for (var itemIdx = 0; itemIdx < groupData.items.length; itemIdx++) {
            itemList.push(groupData.items[itemIdx].name + ' (' + groupData.items[itemIdx].quantity + ' units)');
          }
          
          if (unitsPerPalletValue > 0) {
            var groupPallets = Math.ceil(groupUnits / unitsPerPalletValue);
            totalPallets += groupPallets;
            log.debug('Routing Calculator - Pallet Debug', 
                      'GROUP: Units per pallet = ' + unitsPerPalletValue + 
                      ', Items: [' + itemList.join(', ') + ']' +
                      ', Total units: ' + groupUnits + 
                      ', Pallets: ' + groupPallets);
          } else {
            totalPallets += groupUnits;
            log.debug('Routing Calculator - Pallet Debug', 
                      'GROUP: Invalid units per pallet, treating as 1 unit/pallet. Items: [' + itemList.join(', ') + ']' +
                      ', Total units: ' + groupUnits + 
                      ', Pallets: ' + groupUnits);
          }
        }
        
        log.debug('Routing Calculator - Pallet Debug', 
                  '=== PALLET CALCULATION SUMMARY ===');
        log.debug('Routing Calculator - Pallet Debug', 
                  'NEW METHOD: ' + totalPallets + ' pallets, OLD METHOD: ' + oldMethodTotalPallets + ' pallets');
        
        // Use OLD METHOD (sum of individual fractions) for the actual field value
        totalPallets = Math.max(1, oldMethodTotalPallets);
      } else {
        totalPallets = 0;
      }
      
      // Set request type based on weight
      var requestType = (totalWeight > 285) ? 1 : 2;
      
      log.debug('Routing Calculator', 'Totals - Cartons: ' + totalCartons + 
                ', Vol: ' + totalVolume.toFixed(2) + ' cu ft' +
                ', Wt: ' + totalWeight.toFixed(2) + ' lbs' +
                ', Pallets: ' + totalPallets + ' (using OLD METHOD: sum of individual fractions)' +
                ', Request Type: ' + requestType);
      
      // Apply routing fields to IF
      ifRecord.setValue({
        fieldId: 'custbody_ship_from_location',
        value: locationId
      });
      
      ifRecord.setValue({
        fieldId: 'custbody_warehouse_location_number',
        value: amazonLocationNumber
      });
      
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
      
      ifRecord.setValue({
        fieldId: 'custbody_request_type',
        value: requestType
      });
      
      ifRecord.setValue({
        fieldId: 'custbody_total_pallets',
        value: totalPallets
      });
      
      // Calculate and set pickup date from IF MABD (2 business days before MABD)
      var pickupDateSet = false;
      var pickupDateError = false; // Track if pickup date couldn't be set
      var pickupDateErrorMessage = null; // Store pickup date error message to combine with other errors
      try {
        // Get MABD directly from Item Fulfillment
        var mabdDate = ifRecord.getValue('custbody_gbs_mabd');
        log.debug('Routing Calculator', 'MABD date from IF: ' + (mabdDate ? formatDateForLog(new Date(mabdDate)) : 'null/empty'));
        if (mabdDate) {
          var pickupDateResult = calculatePickupDateFromMABD(mabdDate);
          
          log.debug('Routing Calculator', 'Pickup date calculation result - Date: ' + (pickupDateResult.date ? formatDateForLog(pickupDateResult.date) : 'null') + ', Reason: ' + (pickupDateResult.reason || 'none'));
          
          if (pickupDateResult.date) {
            ifRecord.setValue({
              fieldId: 'custbody_sps_date_118',
              value: pickupDateResult.date
            });
            pickupDateSet = true;
            log.debug('Routing Calculator', 'Set pickup date to ' + formatDateForLog(pickupDateResult.date));
          } else {
            // Store error message to combine with other errors later
            pickupDateError = true;
            pickupDateErrorMessage = 'Pickup date could not be set. Reason: ' + pickupDateResult.reason;
            if (mabdDate) {
              pickupDateErrorMessage += ' (MABD: ' + formatDateForLog(new Date(mabdDate)) + ')';
            }
            log.debug('Routing Calculator', 'Pickup date could not be set. Reason: ' + pickupDateResult.reason + '. Will combine with other errors in error message field.');
          }
        } else {
          // Store error message to combine with other errors later
          pickupDateError = true;
          pickupDateErrorMessage = 'MABD date is missing on the Item Fulfillment';
          log.debug('Routing Calculator', 'MABD date is missing on Item Fulfillment. Will combine with other errors in error message field.');
        }
      } catch (dateError) {
        pickupDateError = true;
        log.error('Routing Calculator', 'Error setting pickup date: ' + dateError.toString());
        // Store error message to combine with other errors later
        pickupDateErrorMessage = 'Error setting pickup date: ' + dateError.toString();
      }
      
      // Build combined error message from all errors (pickup date, UPP, carton weight)
      var allErrorMessages = [];
      
      // Add pickup date error if present
      if (pickupDateErrorMessage) {
        allErrorMessages.push(pickupDateErrorMessage);
      }
      
      // Add UPP error if present
      if (hasMissingUPP) {
        var uppErrorMsg = 'Missing Units Per Pallet (UPP) fields. Location: ' + locationName + '. Items: ';
        var uppItemNames = [];
        for (var u = 0; u < missingUPPItems.length; u++) {
          uppItemNames.push(missingUPPItems[u].itemName + ' (ID: ' + missingUPPItems[u].itemId + ')');
        }
        uppErrorMsg += uppItemNames.join(', ');
        allErrorMessages.push(uppErrorMsg);
      }
      
      // Add carton weight error if present
      if (hasMissingCartonWeight) {
        var weightErrorMsg = 'Missing carton weight fields. Location: ' + locationName + '. Items: ';
        var weightItemNames = [];
        for (var w = 0; w < missingCartonWeightItems.length; w++) {
          weightItemNames.push(missingCartonWeightItems[w].itemName + ' (ID: ' + missingCartonWeightItems[w].itemId + ')');
        }
        weightErrorMsg += weightItemNames.join(', ');
        allErrorMessages.push(weightErrorMsg);
      }
      
      // Set routing status based on conditions
      if (pickupDateSet && !hasMissingUPP && !hasMissingCartonWeight) {
        // Set routing status to 1 if pickup date was set AND no items have missing UPP AND no items have missing carton weight
        ifRecord.setValue({
          fieldId: 'custbody_routing_status',
          value: 1
        });
        log.debug('Routing Calculator', 'Set routing status to 1 (ready for routing request)');
      } else {
        // Set routing status to 4 when any error occurs (pickup date, UPP, or carton weight)
        ifRecord.setValue({
          fieldId: 'custbody_routing_status',
          value: 4
        });
        
        // Set combined error message if there are any errors
        if (allErrorMessages.length > 0) {
          var combinedErrorMsg = allErrorMessages.join(' | ');
          ifRecord.setValue({
            fieldId: 'custbody_routing_request_issue',
            value: combinedErrorMsg
          });
          
          var errorTypes = [];
          if (pickupDateError) errorTypes.push('pickup date');
          if (hasMissingUPP) errorTypes.push('missing UPP');
          if (hasMissingCartonWeight) errorTypes.push('missing carton weight');
          
          log.debug('Routing Calculator', 'Set routing status to 4 due to: ' + errorTypes.join(', ') + '. Combined error message set in custbody_routing_request_issue field.');
          
          if (hasMissingUPP || hasMissingCartonWeight) {
            log.audit('Routing Calculator', 
                        'Set routing status to 4 (error requesting) because one or more items have missing/null/empty units per pallet or carton weight fields. ' +
                        'Please update item fields and recalculate routing.');
          }
        } else if (!pickupDateSet) {
          log.debug('Routing Calculator', 'NOT setting routing status to 1 because pickup date was not set');
        }
      }
      
      // Save the record
      ifRecord.save();
      
      log.audit('Routing Calculator', 'Successfully calculated and applied routing fields for IF ' + ifTranId);
      return true;
      
    } catch (e) {
      log.error('Routing Calculator Error', 'Failed to calculate and apply routing fields: ' + e.toString());
      log.error('Routing Calculator Error', 'Stack trace: ' + (e.stack || 'N/A'));
      return false;
    }
  }
  
  /**
   * Calculates the requested pickup date from SO MABD date
   * NEW LOGIC:
   * 1. Start 2 business days from today going forward (Amazon hard rule: cannot be < 2 days ahead)
   * 2. Calculate maximum pickup date = 2 business days before MABD
   * 3. If minimum <= maximum, use maximum (push as far as possible)
   * 4. If minimum > maximum (can't meet both constraints), use minimum (hard rule is 2 days from today)
   * @param {Date|string} mabdDate - The MABD date from the SO
   * @returns {Object} - Object with {date: Date|null, reason: string|null} - reason is null if date is set, contains error message if not
   */
  function calculatePickupDateFromMABD(mabdDate) {
    try {
      if (!mabdDate) {
        return {date: null, reason: 'MABD date is missing or invalid'};
      }
      
      // Get current date and MABD date for comparison
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      
      var mabdDateObj = new Date(mabdDate);
      mabdDateObj.setHours(0, 0, 0, 0);
      
      log.debug('Routing Calculator - Pickup Date Debug', '=== PICKUP DATE CALCULATION DEBUG ===');
      log.debug('Routing Calculator - Pickup Date Debug', 'Today: ' + formatDateForLog(today));
      log.debug('Routing Calculator - Pickup Date Debug', 'MABD Date: ' + formatDateForLog(mabdDateObj));
      
      // Step 1: Calculate minimum pickup date = 2 business days from today (forward)
      // This is the hard rule - Amazon does not allow requests < 2 days ahead
      var minPickupDate = calculateBusinessDaysAfter(today, 2);
      
      if (!minPickupDate) {
        return {date: null, reason: 'Unable to calculate 2 business days from today'};
      }
      
      // Ensure it's a business day (move forward if weekend)
      minPickupDate = moveToNextBusinessDay(minPickupDate);
      minPickupDate.setHours(0, 0, 0, 0);
      
      log.debug('Routing Calculator - Pickup Date Debug', 'Minimum pickup date (2 business days from today): ' + formatDateForLog(minPickupDate));
      
      // Step 2: Calculate maximum pickup date = 2 business days before MABD (backward)
      var maxPickupDate = calculateBusinessDaysBefore(mabdDateObj, 2);
      
      if (!maxPickupDate) {
        return {date: null, reason: 'Unable to calculate 2 business days before MABD'};
      }
      
      // Ensure it's a business day (move forward if weekend)
      maxPickupDate = moveToNextBusinessDay(maxPickupDate);
      maxPickupDate.setHours(0, 0, 0, 0);
      
      log.debug('Routing Calculator - Pickup Date Debug', 'Maximum pickup date (2 business days before MABD): ' + formatDateForLog(maxPickupDate));
      
      // Step 3: Determine final pickup date
      var finalPickupDate = null;
      
      if (minPickupDate <= maxPickupDate) {
        // We can meet both constraints - use maximum (push as far as possible)
        finalPickupDate = maxPickupDate;
        log.debug('Routing Calculator - Pickup Date Debug', 'Using maximum pickup date (can meet both constraints): ' + formatDateForLog(finalPickupDate));
      } else {
        // Cannot meet both constraints - use minimum (hard rule is 2 days from today)
        finalPickupDate = minPickupDate;
        log.debug('Routing Calculator - Pickup Date Debug', 'Using minimum pickup date (cannot meet both constraints, hard rule is 2 days from today): ' + formatDateForLog(finalPickupDate));
        log.debug('Routing Calculator - Pickup Date Debug', 'Note: This date may be within 2 days or on MABD, but hard rule requires minimum 2 days from today.');
      }
      
      // Final validation: Ensure pickup date is not in the past (shouldn't happen, but safety check)
      if (finalPickupDate < today) {
        var reason = 'Calculated pickup date is in the past. Date: ' + formatDateForLog(finalPickupDate) + ', Today: ' + formatDateForLog(today);
        log.debug('Routing Calculator - Pickup Date Debug', 'REJECTED: ' + reason);
        return {date: null, reason: reason};
      }
      
      log.debug('Routing Calculator - Pickup Date Debug', 'ACCEPTED: Final pickup date - ' + formatDateForLog(finalPickupDate));
      log.debug('Routing Calculator - Pickup Date Debug', '=== END PICKUP DATE CALCULATION DEBUG ===');
      
      return {date: finalPickupDate, reason: null};
      
    } catch (e) {
      var errorMsg = 'Error calculating pickup date: ' + e.toString();
      log.error('Routing Calculator', errorMsg);
      return {date: null, reason: errorMsg};
    }
  }
  
  /**
   * Moves a date forward to the next business day (Monday-Friday)
   * If the date is already a business day, returns it unchanged
   * @param {Date} dateObj - The date to move forward
   * @returns {Date} - The next business day date
   */
  function moveToNextBusinessDay(dateObj) {
    try {
      var resultDate = new Date(dateObj);
      var dayOfWeek = resultDate.getDay();
      
      // If it's Saturday (6), move to Monday (add 2 days)
      if (dayOfWeek === 6) {
        resultDate.setDate(resultDate.getDate() + 2);
      }
      // If it's Sunday (0), move to Monday (add 1 day)
      else if (dayOfWeek === 0) {
        resultDate.setDate(resultDate.getDate() + 1);
      }
      // Otherwise it's already a business day, return as-is
      
      resultDate.setHours(0, 0, 0, 0);
      return resultDate;
      
    } catch (e) {
      log.error('Routing Calculator', 'Error moving to next business day: ' + e.toString());
      return dateObj;
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
      
      if (currentDate > end) {
        var temp = currentDate;
        currentDate = end;
        end = temp;
      }
      
      while (currentDate <= end) {
        var dayOfWeek = currentDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          count++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return count;
      
    } catch (e) {
      log.error('Routing Calculator', 'Error counting business days: ' + e.toString());
      return 0;
    }
  }
  
  /**
   * Calculates a date that is N business days after the given date (forward)
   * Business days exclude Saturday (6) and Sunday (0)
   * @param {Date|string} startDate - The starting date
   * @param {number} businessDays - Number of business days to go forward
   * @returns {Date|null} - Date object, or null if calculation fails
   */
  function calculateBusinessDaysAfter(startDate, businessDays) {
    try {
      var date = new Date(startDate);
      if (isNaN(date.getTime())) {
        log.error('Routing Calculator', 'Invalid date: ' + startDate);
        return null;
      }
      
      var daysToAdd = 0;
      var businessDaysCounted = 0;
      
      while (businessDaysCounted < businessDays) {
        daysToAdd++;
        var checkDate = new Date(date);
        checkDate.setDate(date.getDate() + daysToAdd);
        
        var dayOfWeek = checkDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          businessDaysCounted++;
        }
      }
      
      var resultDate = new Date(date);
      resultDate.setDate(date.getDate() + daysToAdd);
      resultDate.setHours(0, 0, 0, 0);
      
      return resultDate;
      
    } catch (e) {
      log.error('Routing Calculator', 'Error calculating business days forward: ' + e.toString());
      return null;
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
        log.error('Routing Calculator', 'Invalid date: ' + startDate);
        return null;
      }
      
      var daysToSubtract = 0;
      var businessDaysCounted = 0;
      
      while (businessDaysCounted < businessDays) {
        daysToSubtract++;
        var checkDate = new Date(date);
        checkDate.setDate(date.getDate() - daysToSubtract);
        
        var dayOfWeek = checkDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          businessDaysCounted++;
        }
      }
      
      var resultDate = new Date(date);
      resultDate.setDate(date.getDate() - daysToSubtract);
      resultDate.setHours(0, 0, 0, 0);
      
      return resultDate;
      
    } catch (e) {
      log.error('Routing Calculator', 'Error calculating business days: ' + e.toString());
      return null;
    }
  }
  
  return {
    calculateAndApplyRoutingFields: calculateAndApplyRoutingFields
  };
});
