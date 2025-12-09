/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Routing Calculator Library - Reusable function for calculating and applying routing fields
 * (cartons, volume, weight, pallets) for Item Fulfillments. Handles pallet sharing correctly.
 * Use this library function in all scripts that need to calculate routing information.
 */

define([
  'N/record',
  'N/log',
  'N/email',
  'N/url'
], function (record, log, email, url) {
  
  /**
   * Calculates and applies all routing fields to an Item Fulfillment
   * This is the ONLY function you need to call - it handles everything:
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
          var weightPerCarton = itemRecord.getValue('custitemweight_carton_1') || 0;
          var itemWeight = weightPerCarton * Math.max(1, itemCartons);
          totalWeight += itemWeight;
          
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
            // Send email notification when pickup date cannot be set
            pickupDateError = true;
            log.debug('Routing Calculator', 'Pickup date could not be set. Reason: ' + pickupDateResult.reason + '. Sending email notification...');
            sendPickupDateErrorEmail(ifTranId, ifId, pickupDateResult.reason, mabdDate);
          }
        } else {
          // Send email notification when MABD is missing
          pickupDateError = true;
          log.debug('Routing Calculator', 'MABD date is missing on Item Fulfillment. Sending email notification...');
          sendPickupDateErrorEmail(ifTranId, ifId, 'MABD date is missing on the Item Fulfillment', null);
        }
      } catch (dateError) {
        pickupDateError = true;
        log.error('Routing Calculator', 'Error setting pickup date: ' + dateError.toString());
        // Send email notification for unexpected errors
        sendPickupDateErrorEmail(ifTranId, ifId, 'Error setting pickup date: ' + dateError.toString(), null);
      }
      
      // Set routing status based on conditions
      if (pickupDateSet && !hasMissingUPP) {
        // Set routing status to 1 if pickup date was set AND no items have missing UPP
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
      } else if (hasMissingUPP) {
        // Send email notification when UPP is missing
        log.debug('Routing Calculator', 'Missing UPP detected. Sending email notification...');
        sendMissingUPPErrorEmail(ifTranId, ifId, missingUPPItems, locationName);
        log.audit('Routing Calculator', 
                    'NOT setting routing status to 1 because one or more items have missing/null/empty units per pallet field. ' +
                    'Please update item UPP fields and recalculate routing.');
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
  
  /**
   * Sends an email notification when pickup date cannot be set
   * @param {string} ifTranId - Item Fulfillment transaction ID
   * @param {string|number} ifId - Item Fulfillment internal ID
   * @param {string} reason - Reason why pickup date could not be set
   * @param {Date|string|null} mabdDate - MABD date if available
   */
  function sendPickupDateErrorEmail(ifTranId, ifId, reason, mabdDate) {
    try {
      log.debug('Routing Calculator - Email', '=== SENDING PICKUP DATE ERROR EMAIL ===');
      log.debug('Routing Calculator - Email', 'IF TranID: ' + ifTranId);
      log.debug('Routing Calculator - Email', 'IF ID: ' + ifId);
      log.debug('Routing Calculator - Email', 'Reason: ' + reason);
      log.debug('Routing Calculator - Email', 'MABD Date: ' + (mabdDate ? formatDateForLog(new Date(mabdDate)) : 'N/A'));
      
      // Create record URL
      var recordUrl = '';
      try {
        var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
        var relativePath = url.resolveRecord({
          recordType: 'itemfulfillment',
          recordId: ifId,
          isEditMode: false
        });
        recordUrl = 'https://' + domain + relativePath;
        log.debug('Routing Calculator - Email', 'Record URL created: ' + recordUrl);
      } catch (urlError) {
        log.error('Routing Calculator - Email', 'Error creating record URL: ' + urlError.toString());
        recordUrl = 'Unable to generate record URL (IF ID: ' + ifId + ')';
      }
      
      // Format MABD date for email
      var mabdDateStr = 'N/A';
      if (mabdDate) {
        try {
          var mabdDateObj = new Date(mabdDate);
          mabdDateStr = formatDateForLog(mabdDateObj);
        } catch (e) {
          mabdDateStr = String(mabdDate);
        }
      }
      
      // Create email subject
      var subject = 'Pickup Date Cannot Be Set - Item Fulfillment ' + ifTranId;
      
      // Create email body (using HTML line breaks since we're using HTML link)
      var body = 'The pickup date could not be automatically set on an Item Fulfillment.' + '<br><br>';
      body += 'Reason: ' + reason + '<br><br>';
      body += 'MABD Date: ' + mabdDateStr + '<br>';
      body += 'Record Link: <a href="' + recordUrl + '">Item Fulfillment ' + ifTranId + '</a><br><br>';
      body += 'Please review the Item Fulfillment and manually set the pickup date if needed.';
      
      // Send email
      log.debug('Routing Calculator - Email', 'Email subject: ' + subject);
      log.debug('Routing Calculator - Email', 'Email recipients: dhodes@joolbaby.com, Yoelg@joolbaby.com');
      log.debug('Routing Calculator - Email', 'Email author ID: 2536 (hardcoded)');
      email.send({
        author: 2536,
        recipients: ['dhodes@joolbaby.com', 'Yoelg@joolbaby.com'],  
        subject: subject,
        body: body
      });
      
      log.audit('Routing Calculator', 'Sent pickup date error email for IF ' + ifTranId);
      log.debug('Routing Calculator - Email', '=== EMAIL SENT SUCCESSFULLY ===');
      
    } catch (emailError) {
      log.error('Routing Calculator - Email', 'Error sending pickup date error email: ' + emailError.toString());
      log.error('Routing Calculator - Email', 'Error stack: ' + (emailError.stack || 'N/A'));
    }
  }
  
  /**
   * Sends an email notification when items have missing Units Per Pallet (UPP)
   * @param {string} ifTranId - Item Fulfillment transaction ID
   * @param {string|number} ifId - Item Fulfillment internal ID
   * @param {Array} missingUPPItems - Array of objects with item info that have missing UPP
   * @param {string} locationName - Location name
   */
  function sendMissingUPPErrorEmail(ifTranId, ifId, missingUPPItems, locationName) {
    try {
      log.debug('Routing Calculator - Email', '=== SENDING MISSING UPP ERROR EMAIL ===');
      log.debug('Routing Calculator - Email', 'IF TranID: ' + ifTranId);
      log.debug('Routing Calculator - Email', 'IF ID: ' + ifId);
      log.debug('Routing Calculator - Email', 'Number of items with missing UPP: ' + missingUPPItems.length);
      
      // Create record URL
      var recordUrl = '';
      try {
        var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
        var relativePath = url.resolveRecord({
          recordType: 'itemfulfillment',
          recordId: ifId,
          isEditMode: false
        });
        recordUrl = 'https://' + domain + relativePath;
        log.debug('Routing Calculator - Email', 'Record URL created: ' + recordUrl);
      } catch (urlError) {
        log.error('Routing Calculator - Email', 'Error creating record URL: ' + urlError.toString());
        recordUrl = 'Unable to generate record URL (IF ID: ' + ifId + ')';
      }
      
      // Create email subject
      var subject = 'Missing Units Per Pallet (UPP) - Item Fulfillment ' + ifTranId;
      
      // Create email body with list of items (using HTML line breaks since we're using HTML link)
      var body = 'One or more items on Item Fulfillment ' + ifTranId + ' have missing/null/empty Units Per Pallet (UPP) fields.<br><br>';
      body += 'Location: ' + (locationName || 'N/A') + '<br>';
      body += 'Number of items with missing UPP: ' + missingUPPItems.length + '<br><br>';
      body += 'Items with Missing UPP:<br>';
      body += '----------------------------------------<br>';
      
      for (var i = 0; i < missingUPPItems.length; i++) {
        var item = missingUPPItems[i];
        body += (i + 1) + '. Item: ' + item.itemName + ' (ID: ' + item.itemId + ')<br>';
        body += '&nbsp;&nbsp;&nbsp;Location: ' + item.locationName + ' (ID: ' + item.locationId + ')<br>';
        body += '&nbsp;&nbsp;&nbsp;Quantity: ' + item.quantity + '<br>';
        body += '&nbsp;&nbsp;&nbsp;UPP Field: ' + (item.locationId === '4' ? 'custitem_units_per_pallet_westmark' : 'custitemunits_per_pallet') + '<br><br>';
      }
      
      body += 'Record Link: <a href="' + recordUrl + '">Item Fulfillment ' + ifTranId + '</a><br><br>';
      body += 'Please update the Units Per Pallet fields on the items listed above and recalculate routing.';
      
      // Send email
      log.debug('Routing Calculator - Email', 'Email subject: ' + subject);
      log.debug('Routing Calculator - Email', 'Email recipients: dhodes@joolbaby.com, Yoelg@joolbaby.com');
      log.debug('Routing Calculator - Email', 'Email author ID: 2536 (hardcoded)');
      email.send({
        author: 2536,
        recipients: ['dhodes@joolbaby.com', 'Yoelg@joolbaby.com'],
        subject: subject,
        body: body
      });
      
      log.audit('Routing Calculator', 'Sent missing UPP error email for IF ' + ifTranId);
      log.debug('Routing Calculator - Email', '=== EMAIL SENT SUCCESSFULLY ===');
      
    } catch (emailError) {
      log.error('Routing Calculator - Email', 'Error sending missing UPP error email: ' + emailError.toString());
      log.error('Routing Calculator - Email', 'Error stack: ' + (emailError.stack || 'N/A'));
    }
  }
  
  return {
    calculateAndApplyRoutingFields: calculateAndApplyRoutingFields
  };
});
