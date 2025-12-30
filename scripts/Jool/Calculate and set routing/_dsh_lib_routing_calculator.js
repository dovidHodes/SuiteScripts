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
          if (parseInt(locationId) === 4) { // Westmark
            uppFieldValue = itemRecord.getValue('custitem_units_per_pallet_westmark');
            unitsPerPallet = uppFieldValue || 1;
          } else if (parseInt(locationId) === 38) { // Rutgers
            uppFieldValue = itemRecord.getValue('custitemunits_per_pallet');
            unitsPerPallet = uppFieldValue || 1;
          } else {
            unitsPerPallet = 1;
          }
          
          // Check if UPP is missing/null/empty (defaulted to 1)
          if (!uppFieldValue || uppFieldValue === 0 || uppFieldValue === '') {
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
                        'Location: ' + locationId + ' (' + locationName + '), Defaulting to 1 unit per pallet. ' +
                        'Routing status will NOT be set to 1.');
          }
          
          // Calculate individual pallet fraction (for debugging)
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
          
          totalUnits += itemQuantity;
          
          log.debug('Routing Calculator - Pallet Debug', 
                    'Line ' + i + ': ' + itemName + 
                    ' - Qty: ' + itemQuantity + 
                    ', Units/Pallet: ' + unitsPerPallet +
                    ', Individual Pallet Fraction: ' + individualPalletFraction.toFixed(3));
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
            // Set error message in field instead of sending email
            pickupDateError = true;
            var errorMessage = 'Pickup date could not be set. Reason: ' + pickupDateResult.reason;
            if (mabdDate) {
              errorMessage += ' (MABD: ' + formatDateForLog(new Date(mabdDate)) + ')';
            }
            ifRecord.setValue({
              fieldId: 'custbody_routing_request_issue',
              value: errorMessage
            });
            log.debug('Routing Calculator', 'Pickup date could not be set. Reason: ' + pickupDateResult.reason + '. Set error message in custbody_routing_request_issue field.');
          }
        } else {
          // Set error message in field instead of sending email
          pickupDateError = true;
          var errorMessage = 'MABD date is missing on the Item Fulfillment';
          ifRecord.setValue({
            fieldId: 'custbody_routing_request_issue',
            value: errorMessage
          });
          log.debug('Routing Calculator', 'MABD date is missing on Item Fulfillment. Set error message in custbody_routing_request_issue field.');
        }
      } catch (dateError) {
        pickupDateError = true;
        log.error('Routing Calculator', 'Error setting pickup date: ' + dateError.toString());
        // Set error message in field instead of sending email
        var errorMessage = 'Error setting pickup date: ' + dateError.toString();
        ifRecord.setValue({
          fieldId: 'custbody_routing_request_issue',
          value: errorMessage
        });
      }
      
      // Set routing status based on conditions
      if (pickupDateSet && !hasMissingUPP && !hasMissingCartonWeight) {
        // Set routing status to 1 if pickup date was set AND no items have missing UPP AND no items have missing carton weight
        ifRecord.setValue({
          fieldId: 'custbody_routing_status',
          value: 1
        });
        log.debug('Routing Calculator', 'Set routing status to 1 (ready for routing request)');
      } else if (pickupDateError) {
        // Set routing status to 4 when pickup date cannot be set
        ifRecord.setValue({
          fieldId: 'custbody_routing_status',
          value: 4
        });
        log.debug('Routing Calculator', 'Set routing status to 4 (pickup date could not be set)');
      } else if (hasMissingUPP || hasMissingCartonWeight) {
        // Set routing status to 4 when UPP or carton weight is missing
        ifRecord.setValue({
          fieldId: 'custbody_routing_status',
          value: 4
        });
        
        // Build combined error message
        var errorMessages = [];
        
        if (hasMissingUPP) {
          var uppErrorMsg = 'Missing Units Per Pallet (UPP) fields. Location: ' + locationName + '. Items: ';
          var uppItemNames = [];
          for (var u = 0; u < missingUPPItems.length; u++) {
            uppItemNames.push(missingUPPItems[u].itemName + ' (ID: ' + missingUPPItems[u].itemId + ')');
          }
          uppErrorMsg += uppItemNames.join(', ');
          errorMessages.push(uppErrorMsg);
        }
        
        if (hasMissingCartonWeight) {
          var weightErrorMsg = 'Missing carton weight fields. Location: ' + locationName + '. Items: ';
          var weightItemNames = [];
          for (var w = 0; w < missingCartonWeightItems.length; w++) {
            weightItemNames.push(missingCartonWeightItems[w].itemName + ' (ID: ' + missingCartonWeightItems[w].itemId + ')');
          }
          weightErrorMsg += weightItemNames.join(', ');
          errorMessages.push(weightErrorMsg);
        }
        
        var combinedErrorMsg = errorMessages.join(' | ');
        ifRecord.setValue({
          fieldId: 'custbody_routing_request_issue',
          value: combinedErrorMsg
        });
        
        log.debug('Routing Calculator', 'Missing UPP or carton weight detected. Set routing status to 4 and error message in custbody_routing_request_issue field.');
        log.audit('Routing Calculator', 
                    'Set routing status to 4 (error requesting) because one or more items have missing/null/empty units per pallet or carton weight fields. ' +
                    'Please update item fields and recalculate routing.');
      } else if (!pickupDateSet) {
        log.debug('Routing Calculator', 'NOT setting routing status to 1 because pickup date was not set');
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
   * Calculates 2 business days before MABD (excluding Saturday and Sunday)
   * Requires minimum 2 business days in the future from today
   * Requires minimum 2 business days before MABD
   * If the calculated date falls on a weekend, moves it forward to the next business day
   * Only leaves blank if date is forced to be within 2 business days from today or less than 2 business days before MABD
   * @param {Date|string} mabdDate - The MABD date from the SO
   * @returns {Object} - Object with {date: Date|null, reason: string|null} - reason is null if date is set, contains error message if not
   */
  function calculatePickupDateFromMABD(mabdDate) {
    try {
      if (!mabdDate) {
        return {date: null, reason: 'MABD date is missing or invalid'};
      }
      
      // Calculate 2 business days before MABD (changed from 1 to meet requirement of at least 2 business days before MABD)
      var pickupDateObj = calculateBusinessDaysBefore(mabdDate, 2);
      
      if (!pickupDateObj) {
        return {date: null, reason: 'Unable to calculate 2 business days before MABD'};
      }
      
      // Set time to midnight for comparison
      pickupDateObj.setHours(0, 0, 0, 0);
      
      // Get current date and MABD date for comparison
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      
      var mabdDateObj = new Date(mabdDate);
      mabdDateObj.setHours(0, 0, 0, 0);
      
      log.debug('Routing Calculator - Pickup Date Debug', '=== PICKUP DATE CALCULATION DEBUG ===');
      log.debug('Routing Calculator - Pickup Date Debug', 'MABD Date: ' + formatDateForLog(mabdDateObj));
      log.debug('Routing Calculator - Pickup Date Debug', 'Initial calculated pickup date (2 business days before MABD): ' + formatDateForLog(pickupDateObj));
      log.debug('Routing Calculator - Pickup Date Debug', 'Today: ' + formatDateForLog(today));
      
      // If pickup date falls on a weekend, move it forward to the next business day
      var dayOfWeek = pickupDateObj.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        log.debug('Routing Calculator - Pickup Date Debug', 'Pickup date falls on weekend (' + (dayOfWeek === 0 ? 'Sunday' : 'Saturday') + '), moving forward to next business day');
        pickupDateObj = moveToNextBusinessDay(pickupDateObj);
        log.debug('Routing Calculator - Pickup Date Debug', 'Adjusted pickup date after weekend move: ' + formatDateForLog(pickupDateObj));
      }
      
      // CRITICAL: Check if pickup date is BEFORE today (in the past)
      if (pickupDateObj < today) {
        var reason = 'Pickup date is in the past. Calculated date: ' + formatDateForLog(pickupDateObj) + ', Today: ' + formatDateForLog(today) + '. This occurs when MABD is in the past or too close to today.';
        log.debug('Routing Calculator - Pickup Date Debug', 'REJECTED: ' + reason);
        return {date: null, reason: reason};
      }
      
      // Check if pickup date is at least 2 business days from today
      // Note: countBusinessDaysBetween is inclusive, so if today is Monday and pickup is Tuesday, count = 2
      // We need at least 2 business days in the future, so count must be > 2 (meaning at least Wednesday)
      var businessDaysFromToday = countBusinessDaysBetween(today, pickupDateObj);
      log.debug('Routing Calculator - Pickup Date Debug', 'Business days from today: ' + businessDaysFromToday + ' (needs to be > 2 for at least 2 business days in the future)');
      if (businessDaysFromToday <= 2) {
        var reason = 'Pickup date is not at least 2 business days from today. Calculated date: ' + formatDateForLog(pickupDateObj) + ', Today: ' + formatDateForLog(today);
        log.debug('Routing Calculator - Pickup Date Debug', 'REJECTED: ' + reason);
        return {date: null, reason: reason};
      }
      
      // Check if pickup date is at least 2 business days before MABD
      var businessDaysBeforeMABD = countBusinessDaysBetween(pickupDateObj, mabdDateObj);
      log.debug('Routing Calculator - Pickup Date Debug', 'Business days before MABD: ' + businessDaysBeforeMABD + ' (needs to be > 1)');
      if (businessDaysBeforeMABD <= 1) {
        var reason = 'Pickup date is not at least 2 business days before MABD. Calculated date: ' + formatDateForLog(pickupDateObj) + ', MABD: ' + formatDateForLog(mabdDateObj);
        log.debug('Routing Calculator - Pickup Date Debug', 'REJECTED: ' + reason);
        return {date: null, reason: reason};
      }
      
      log.debug('Routing Calculator - Pickup Date Debug', 'ACCEPTED: Pickup date is valid - ' + formatDateForLog(pickupDateObj));
      log.debug('Routing Calculator - Pickup Date Debug', '=== END PICKUP DATE CALCULATION DEBUG ===');
      
      return {date: pickupDateObj, reason: null};
      
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
