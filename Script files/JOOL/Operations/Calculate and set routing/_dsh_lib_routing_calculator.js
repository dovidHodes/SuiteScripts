/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Routing Calculator Library - Calculates and applies routing fields
 * (cartons, volume, weight, pallets) for Item Fulfillments using real SPS packages.
 */

define([
  'N/record',
  'N/log',
  'N/search',
  './_dsh_lib_pallet_calculator'
], function (record, log, search, palletCalculator) {
  

  var REQUEST_TYPE_PALLET = 1;  // LTL shipment (weight > 285 lbs)
  var REQUEST_TYPE_CARTON = 2;  // Parcel shipment (weight <= 285 lbs)
  
  // ============================================================================
  // MAIN FUNCTION
  // ============================================================================
  
  // Calculates and sets routing fields using real SPS packages
  // Returns {success, message, noPackages?, routingStatus?} for SL notification handling
  function calculateAndApplyRoutingFields(ifId) {
    try {
      if (!ifId) {
        return { success: false, message: 'Missing Item Fulfillment ID' };
      }
      
      log.debug('Routing Calculator', 'Starting routing calculation for IF: ' + ifId);
      
      // Load IF record
      var ifRecord = record.load({ type: 'itemfulfillment', id: ifId, isDynamic: true });
      var ifTranId = ifRecord.getValue('tranid') || ifId;
      
      // Get location
      var locationId = ifRecord.getValue('custbody_ship_from_location');
      if (!locationId) {
        var lineCount = ifRecord.getLineCount({ sublistId: 'item' });
        if (lineCount > 0) {
          locationId = ifRecord.getSublistValue({ sublistId: 'item', fieldId: 'location', line: 0 });
        }
      }
      
      var locationData = loadLocationData(locationId);
      if (!locationData) {
        return { success: false, message: 'Could not load location data or Amazon location number missing' };
      }
      
      // Load SPS packages - set error status if none exist
      var packages = loadSPSPackages(ifId);
      if (packages.length === 0) {
        var noPackagesMsg = 'No SPS packages exist for this Item Fulfillment. Please run autopack first.';
        log.audit('Routing Calculator', 'No SPS packages found for IF: ' + ifTranId);
        ifRecord.setValue({ fieldId: 'custbody_routing_status', value: 4 });
        ifRecord.setValue({ fieldId: 'custbody_routing_request_issue', value: noPackagesMsg });
        ifRecord.save();
        return { 
          success: false, 
          message: noPackagesMsg,
          noPackages: true,
          routingStatus: 4
        };
      }
      
      log.debug('Routing Calculator', 'Found ' + packages.length + ' SPS packages');
      
      // Load item data for all unique items
      var uniqueItemIds = {};
      packages.forEach(function(pkg) { uniqueItemIds[pkg.itemId] = true; });
      
      var itemDataCache = {};
      var itemUPP = {};
      var missingUPPItems = [], missingWeightItems = [];
      
      Object.keys(uniqueItemIds).forEach(function(itemId) {
        var data = loadItemData(itemId, locationId);
        if (data) {
          itemDataCache[itemId] = data;
          itemUPP[itemId] = data.unitsPerPallet;
          if (data.missingUPP) missingUPPItems.push({ itemId: itemId, name: data.name });
          if (data.missingWeight) missingWeightItems.push({ itemId: itemId, name: data.name });
        }
      });
      
      // Calculate totals from real packages
      var totalCartons = packages.length;
      var totalVolume = 0, totalWeight = 0;
      
      packages.forEach(function(pkg) {
        var data = itemDataCache[pkg.itemId];
        if (data) {
          totalVolume += data.volumePerCarton;
          totalWeight += data.weightPerCarton;
        }
      });
      
      // Calculate pallets and request type
      var totalPallets = calculatePallets(packages, itemUPP);
      var requestType = (totalWeight > 285) ? REQUEST_TYPE_PALLET : REQUEST_TYPE_CARTON;
      
      log.debug('Routing Calculator', 'Totals - Cartons: ' + totalCartons + ', Vol: ' + totalVolume.toFixed(2) + 
                ', Wt: ' + totalWeight.toFixed(2) + ', Pallets: ' + totalPallets);
      
      // Calculate pickup date
      var mabdDate = ifRecord.getValue('custbody_gbs_mabd');
      var pickupResult = calculatePickupDate(mabdDate);
      
      // Apply routing fields
      applyRoutingFields(ifRecord, {
        locationId: locationId,
        amazonLocationNumber: locationData.amazonLocationNumber,
        cartons: totalCartons,
        volume: totalVolume,
        weight: totalWeight,
        pallets: totalPallets,
        requestType: requestType,
        pickupDate: pickupResult.date
      });
      
      // Build error messages and set status
      var errors = [];
      if (!pickupResult.date) {
        errors.push('Pickup date: ' + pickupResult.reason);
      }
      var uppError = buildMissingItemsError(missingUPPItems, locationData.name, 'UPP');
      if (uppError) errors.push(uppError);
      var weightError = buildMissingItemsError(missingWeightItems, locationData.name, 'weight');
      if (weightError) errors.push(weightError);
      
      var hasErrors = !pickupResult.date || missingUPPItems.length > 0 || missingWeightItems.length > 0;
      setRoutingStatus(ifRecord, !hasErrors, errors);
      
      ifRecord.save();
      
      if (hasErrors) {
        log.audit('Routing Calculator', 'Completed with errors for IF ' + ifTranId);
        return { 
          success: false, 
          message: 'Routing calculated with errors: ' + errors.join(' | '),
          routingStatus: 4
        };
      }
      
      log.audit('Routing Calculator', 'Successfully completed routing for IF ' + ifTranId);
      return { 
        success: true, 
        message: 'Routing calculated successfully. Cartons: ' + totalCartons + ', Pallets: ' + totalPallets,
        routingStatus: 1
      };
      
    } catch (e) {
      log.error('Routing Calculator', 'Error: ' + e.toString() + '\n' + (e.stack || ''));
      return { success: false, message: 'Error calculating routing: ' + e.toString() };
    }
  }
  
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
  // Loads location data including Amazon location number
  function loadLocationData(locationId) {
    if (!locationId) return null;
    
    try {
      var locRecord = record.load({ type: 'location', id: locationId });
      var name = locRecord.getValue('name');
      var amazonNum = locRecord.getValue('custrecord_amazon_location_number');
      
      if (!amazonNum) {
        log.audit('Routing Calculator', 'Amazon location number not found for ' + name);
        return null;
      }
      
      return { id: locationId, name: name, amazonLocationNumber: amazonNum };
    } catch (e) {
      log.error('Routing Calculator', 'Error loading location ' + locationId + ': ' + e.toString());
      return null;
    }
  }
  
  // Loads item master data for routing calculations
  function loadItemData(itemId, locationId) {
    try {
      var itemRec = record.load({ type: 'inventoryitem', id: itemId });
      var name = itemRec.getValue('itemid') || itemId;
      var volumePerCarton = parseFloat(itemRec.getValue('custitemcustitem_carton_cbf')) || 0;
      var weightPerCarton = parseFloat(itemRec.getValue('custitemweight_carton_1')) || 0;
      var unitsPerPallet = getItemUPP(itemRec, locationId);
      
      return {
        itemId: itemId,
        name: name,
        volumePerCarton: volumePerCarton,
        weightPerCarton: weightPerCarton,
        unitsPerPallet: unitsPerPallet,
        missingUPP: unitsPerPallet === 0,
        missingWeight: weightPerCarton === 0
      };
    } catch (e) {
      log.error('Routing Calculator', 'Error loading item ' + itemId + ': ' + e.toString());
      return null;
    }
  }
  
  // Loads SPS packages and their content for an Item Fulfillment
  function loadSPSPackages(ifId) {
    var packageSearch = search.create({
      type: 'customrecord_sps_package',
      filters: [['custrecord_sps_pack_asn', 'anyof', ifId]],
      columns: ['internalid', 'custrecord_sps_package_qty']
    });
    
    var packageIds = [];
    var packageData = {};
    
    packageSearch.run().each(function(result) {
      var id = result.id;
      packageIds.push(id);
      packageData[id] = { qty: parseFloat(result.getValue('custrecord_sps_package_qty')) || 0 };
      return true;
    });
    
    if (packageIds.length === 0) return [];
    
    var contentSearch = search.create({
      type: 'customrecord_sps_content',
      filters: [['custrecord_sps_content_package', 'anyof', packageIds]],
      columns: ['internalid', 'custrecord_sps_content_package', 'custrecord_sps_content_item']
    });
    
    var contentMap = {};
    contentSearch.run().each(function(result) {
      var pkgId = result.getValue('custrecord_sps_content_package');
      if (pkgId && !contentMap[pkgId]) {
        contentMap[pkgId] = { itemId: result.getValue('custrecord_sps_content_item') };
      }
      return true;
    });
    
    var packages = [];
    packageIds.forEach(function(pkgId) {
      var content = contentMap[pkgId];
      if (content && content.itemId) {
        packages.push({
          packageId: pkgId,
          packageQty: packageData[pkgId].qty,
          itemId: content.itemId
        });
      }
    });
    
    return packages;
  }
  
  // Calculates pallets from packages using pallet calculator library
  function calculatePallets(packages, itemUPP) {
    if (!packages || packages.length === 0) return 0;
    
    var validPackages = packages.filter(function(pkg) {
      return itemUPP[pkg.itemId] > 0;
    });
    
    if (validPackages.length === 0) {
      return Math.max(1, Math.ceil(packages.length / 50));
    }
    
    try {
      var assignments = palletCalculator.calculatePalletAssignments(validPackages, itemUPP);
      return Math.max(1, assignments.length);
    } catch (e) {
      log.error('Routing Calculator', 'Pallet calc error: ' + e.toString());
      return Math.max(1, Math.ceil(packages.length / 50));
    }
  }
  
  // Calculates pickup date from MABD (2 business days before, min 2 days from today)
  function calculatePickupDate(mabdDate) {
    if (!mabdDate) {
      return { date: null, reason: 'MABD date is missing' };
    }
    
    try {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      
      var mabd = new Date(mabdDate);
      mabd.setHours(0, 0, 0, 0);
      
      var minDate = addBusinessDays(today, 2);
      if (!minDate) return { date: null, reason: 'Unable to calculate min date' };
      minDate = ensureBusinessDay(minDate);
      
      var maxDate = subtractBusinessDays(mabd, 2);
      if (!maxDate) return { date: null, reason: 'Unable to calculate max date' };
      maxDate = ensureBusinessDay(maxDate);
      
      var finalDate = (minDate <= maxDate) ? maxDate : minDate;
      
      if (finalDate < today) {
        return { date: null, reason: 'Pickup date would be in the past' };
      }
      
      return { date: finalDate, reason: null };
    } catch (e) {
      return { date: null, reason: 'Error: ' + e.toString() };
    }
  }
  
  // Applies routing fields to IF record (does not save)
  function applyRoutingFields(ifRecord, data) {
    ifRecord.setValue({ fieldId: 'custbody_ship_from_location', value: data.locationId });
    ifRecord.setValue({ fieldId: 'custbody_warehouse_location_number', value: data.amazonLocationNumber });
    ifRecord.setValue({ fieldId: 'custbody_total_cartons', value: data.cartons });
    ifRecord.setValue({ fieldId: 'custbody_total_volume', value: data.volume });
    ifRecord.setValue({ fieldId: 'custbody_total_weight', value: data.weight });
    ifRecord.setValue({ fieldId: 'custbody_request_type', value: data.requestType });
    ifRecord.setValue({ fieldId: 'custbody_total_pallets', value: data.pallets });
    
    if (data.pickupDate) {
      ifRecord.setValue({ fieldId: 'custbody_sps_date_118', value: data.pickupDate });
    }
  }
  
  // Sets routing status and error message on IF record (does not save)
  function setRoutingStatus(ifRecord, success, errorMessages) {
    if (success) {
      ifRecord.setValue({ fieldId: 'custbody_routing_status', value: 1 });
    } else {
      ifRecord.setValue({ fieldId: 'custbody_routing_status', value: 4 });
      if (errorMessages && errorMessages.length > 0) {
        ifRecord.setValue({ fieldId: 'custbody_routing_request_issue', value: errorMessages.join(' | ') });
      }
    }
  }
  
  // Builds error messages for missing item data
  function buildMissingItemsError(missingItems, locationName, errorType) {
    if (!missingItems || missingItems.length === 0) return null;
    
    var prefix = errorType === 'UPP' 
      ? 'Missing Units Per Pallet (UPP). Location: ' 
      : 'Missing carton weight. Location: ';
    
    var items = missingItems.map(function(i) { return i.name + ' (ID: ' + i.itemId + ')'; });
    return prefix + locationName + '. Items: ' + items.join(', ');
  }
  
  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  // Gets UPP field value for an item based on location
  function getItemUPP(itemRecord, locationId) {
    var locId = parseInt(locationId);
    var uppValue = null;
    
    if (locId === 4) { // Westmark
      uppValue = itemRecord.getValue('custitem_units_per_pallet_westmark');
    } else if (locId === 38) { // Rutgers
      uppValue = itemRecord.getValue('custitemunits_per_pallet');
    } else {
      return 1; // Default for other locations
    }
    
    if (uppValue === null || uppValue === undefined) return 0;
    if (typeof uppValue === 'string' && uppValue.trim() === '') return 0;
    
    var parsed = parseFloat(uppValue);
    return (isNaN(parsed) || parsed <= 0) ? 0 : parsed;
  }
  
  function addBusinessDays(startDate, days) {
    var date = new Date(startDate);
    var added = 0;
    while (added < days) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0 && date.getDay() !== 6) added++;
    }
    return date;
  }
  
  function subtractBusinessDays(startDate, days) {
    var date = new Date(startDate);
    var subtracted = 0;
    while (subtracted < days) {
      date.setDate(date.getDate() - 1);
      if (date.getDay() !== 0 && date.getDay() !== 6) subtracted++;
    }
    return date;
  }
  
  function ensureBusinessDay(date) {
    var d = new Date(date);
    while (d.getDay() === 0 || d.getDay() === 6) {
      d.setDate(d.getDate() + 1);
    }
    d.setHours(0, 0, 0, 0);
    return d;
  }
  
  return {
    calculateAndApplyRoutingFields: calculateAndApplyRoutingFields
  };
});
