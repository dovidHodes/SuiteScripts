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
        log.warning('Routing Calculator', 'Amazon location number not found for location ' + locationId + ' (' + locationName + '), skipping routing field population');
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
            log.warning('Routing Calculator - Missing UPP', 
                        'Item ' + itemName + ' (ID: ' + itemId + ') has missing/null/empty units per pallet field. ' +
                        'Location: ' + locationId + ', Defaulting to 1 unit per pallet. ' +
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
            quantity: itemQuantity,
            unitsPerPallet: unitsPerPallet,
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
          var unitsPerPallet = itemData[j].unitsPerPallet;
          if (!palletGroups[unitsPerPallet]) {
            palletGroups[unitsPerPallet] = {
              totalUnits: 0,
              items: []
            };
          }
          palletGroups[unitsPerPallet].totalUnits += itemData[j].quantity;
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
        
        totalPallets = Math.max(1, totalPallets);
      } else {
        totalPallets = 0;
      }
      
      // Set request type based on weight
      var requestType = (totalWeight > 285) ? 1 : 2;
      
      log.debug('Routing Calculator', 'Totals - Cartons: ' + totalCartons + 
                ', Vol: ' + totalVolume.toFixed(2) + ' cu ft' +
                ', Wt: ' + totalWeight.toFixed(2) + ' lbs' +
                ', Pallets: ' + totalPallets +
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
      
      // Calculate and set pickup date from SO MABD (1 business day before MABD)
      var pickupDateSet = false;
      try {
        var soId = ifRecord.getValue('createdfrom');
        if (soId) {
          var soRecord = record.load({
            type: 'salesorder',
            id: soId,
            isDynamic: false
          });
          
          var mabdDate = soRecord.getValue('custbody_gbs_mabd');
          if (mabdDate) {
            var requestedPickupDate = calculatePickupDateFromMABD(mabdDate);
            
            if (requestedPickupDate) {
              ifRecord.setValue({
                fieldId: 'custbody_sps_date_118',
                value: requestedPickupDate
              });
              pickupDateSet = true;
              log.debug('Routing Calculator', 'Set pickup date to ' + formatDateForLog(requestedPickupDate));
            }
          }
        }
      } catch (dateError) {
        log.error('Routing Calculator', 'Error setting pickup date: ' + dateError.toString());
      }
      
      // Set routing status to 1 ONLY if pickup date was set AND no items have missing UPP
      if (pickupDateSet && !hasMissingUPP) {
        ifRecord.setValue({
          fieldId: 'custbody_routing_status',
          value: 1
        });
        log.debug('Routing Calculator', 'Set routing status to 1 (ready for routing request)');
      } else {
        if (hasMissingUPP) {
          log.warning('Routing Calculator', 
                      'NOT setting routing status to 1 because one or more items have missing/null/empty units per pallet field. ' +
                      'Please update item UPP fields and recalculate routing.');
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
   * Calculates 1 business day before MABD (excluding Saturday and Sunday)
   * If the calculated date is within 1 business day from today, returns null
   * @param {Date|string} mabdDate - The MABD date from the SO
   * @returns {Date|null} - Date object, or null if should be left blank
   */
  function calculatePickupDateFromMABD(mabdDate) {
    try {
      if (!mabdDate) {
        return null;
      }
      
      // Calculate 1 business day before MABD
      var pickupDateObj = calculateBusinessDaysBefore(mabdDate, 1);
      
      if (!pickupDateObj) {
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
        log.debug('Routing Calculator', 'Pickup date is within 1 business day, leaving field blank');
        return null;
      }
      
      return pickupDateObj;
      
    } catch (e) {
      log.error('Routing Calculator', 'Error calculating pickup date: ' + e.toString());
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
