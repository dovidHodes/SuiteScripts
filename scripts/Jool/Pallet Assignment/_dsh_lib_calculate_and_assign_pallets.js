/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Library script to calculate optimal pallet assignments and create pallet records
 * 
 * This script:
 * 1. Gets IF location and item UPP (units per pallet) values
 * 2. Searches all SPS packages and their content
 * 3. Calculates optimal pallet assignments (minimize pallets, items can share)
 * 4. Creates pallet records
 * 5. Assigns packages to pallets
 * 6. Returns data structure for Map/Reduce to update packages and content
 */

define([
  'N/search',
  'N/record',
  'N/log',
  'N/runtime',
  'N/task'
], function (search, record, log, runtime, task) {
  
  // ============================================================================
  // MAIN FUNCTION
  // ============================================================================
  
  /**
   * Calculate pallets and create pallet records
   * @param {string} ifId - Item Fulfillment internal ID
   * @returns {Object} Result object with pallet assignments
   */
  function calculateAndAssignPallets(ifId) {
    var result = {
      success: false,
      ifId: ifId,
      palletsCreated: 0,
      palletAssignments: [], // Array of {palletId, packageIds: [], contentIds: [], items: [{itemId, quantity, cartons}], totalCartons: number}
      itemSummary: {}, // Summary by item
      errors: [],
      warnings: []
    };
    
    try {
      log.audit('calculateAndAssignPallets', 'Starting for IF: ' + ifId);
      
      // Step 1: Load IF and get location
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      
      var ifTranId = ifRecord.getValue('tranid') || ifId;
      var locationId = ifRecord.getValue('custbody_ship_from_location');
      var entityId = ifRecord.getValue('entity');
      
      if (!locationId) {
        throw new Error('No ship from location found on IF');
      }
      
      log.audit('IF Loaded', 'TranID: ' + ifTranId + ', Location: ' + locationId + ', Entity: ' + entityId);
      
      // Step 2: Determine which UPP field to use based on location (check once per IF)
      var uppFieldId = null;
      if (locationId == '38') {
        uppFieldId = 'custitemunits_per_pallet';
      } else if (locationId == '4') {
        uppFieldId = 'custitem_units_per_pallet_westmark';
      } else {
        var errorMsg = 'Location ' + locationId + ' is not supported. Supported locations: 38, 4';
        log.error('Unsupported Location', errorMsg);
        result.errors.push(errorMsg);
        return result;
      }
      
      log.debug('UPP Field Selected', 'Location: ' + locationId + ', UPP Field: ' + uppFieldId);
      
      // Step 3: Get UPP (units per pallet) for each item on IF and build VPN map
      var itemUPP = {}; // {itemId: upp}
      var itemNames = {}; // {itemId: itemName}
      var itemVpnMap = {}; // {itemId: vpn} - Map of itemId to VPN from column field on item list
      var lineCount = ifRecord.getLineCount({ sublistId: 'item' });
      
      for (var i = 0; i < lineCount; i++) {
        var itemId = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'item',
          line: i
        });
        
        if (!itemId) continue;
        
        // Get VPN from column field on item list (vendorpartnumber)
        var vpn = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'custcol_sps_vendorpartnumber',
          line: i
        }) || '';
        
        
        // Store VPN in map
        if (vpn) {
          itemVpnMap[itemId] = vpn;
        }
        
        // Load item record and get UPP based on location
        var itemRecord = record.load({
          type: 'inventoryitem',
          id: itemId,
          isDynamic: false
        });
        
        // Get item name
        var itemName = itemRecord.getValue('itemid') || itemRecord.getValue('displayname') || itemId;
        itemNames[itemId] = itemName;
        
        // Get UPP using the field determined once per IF
        var upp = itemRecord.getValue(uppFieldId) || 0;
        
        if (upp > 0) {
          itemUPP[itemId] = upp;
        } else {
          var errorMsg = 'Item ' + itemId + ' (' + itemName + ') has no UPP (units per pallet) for location ' + locationId;
          log.error('No UPP', errorMsg);
          result.errors.push(errorMsg);
        }
      }
      
      log.debug('VPN Map Built', 'Built VPN map with ' + Object.keys(itemVpnMap).length + ' item(s)');
      
      // Step 4: Search all SPS packages for IF
      var packages = [];
      var packageSearch = search.create({
        type: 'customrecord_sps_package',
        filters: [
          ['custrecord_sps_pack_asn', 'anyof', ifId]
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'custrecord_sps_package_qty' })
        ]
      });
      
      packageSearch.run().each(function (packageResult) {
        var packageId = packageResult.id;
        var packageQty = packageResult.getValue('custrecord_sps_package_qty') || 0;
        
        // Get first package content record for this package
        var contentSearch = search.create({
          type: 'customrecord_sps_content',
          filters: [
            ['custrecord_sps_content_package', 'anyof', packageId]
          ],
          columns: [
            search.createColumn({ name: 'internalid' }),
            search.createColumn({ name: 'custrecord_sps_content_item' })
          ]
        });
        
        var contentResult = contentSearch.run().getRange({ start: 0, end: 1 });
        
        if (contentResult.length > 0) {
          var contentId = contentResult[0].id;
          var itemId = contentResult[0].getValue('custrecord_sps_content_item');
          
          packages.push({
            packageId: packageId,
            packageQty: parseFloat(packageQty) || 0,
            contentId: contentId,
            itemId: itemId
          });
        }
        
        return true;
      });
      
      log.audit('Packages Found', 'Found ' + packages.length + ' packages');
      
      if (packages.length === 0) {
        var errorMsg = 'No SPS packages found for IF: ' + ifId;
        log.error('No Packages', errorMsg);
        result.errors.push(errorMsg);
        return result;
      }
      
      // Step 5: Calculate optimal pallet assignments
      var palletAssignments = calculateOptimalPallets(packages, itemUPP, result);
      
      // Step 6: Create pallet records
      var palletIds = [];
      var totalPallets = palletAssignments.length;
      
      for (var p = 0; p < palletAssignments.length; p++) {
        try {
          var palletRecord = record.create({
            type: 'customrecord_asn_pallet'
          });
          
          var palletName = 'Pallet ' + (p + 1) + ' - IF ' + ifTranId;
          palletRecord.setValue({
            fieldId: 'name',
            value: palletName
          });
          
          palletRecord.setValue({
            fieldId: 'custrecord_parent_if',
            value: ifId
          });
          
          // Set percentage used
          var usagePercentage = palletAssignments[p].usage || 0;
          palletRecord.setValue({
            fieldId: 'custrecord_percentage',
            value: usagePercentage
          });
          
          // Set pallet index (1-based)
          palletRecord.setValue({
            fieldId: 'custrecord_pallet_index',
            value: p + 1
          });
          
          // Set total pallet count
          palletRecord.setValue({
            fieldId: 'custrecord_total_pallet_count',
            value: totalPallets
          });
          
          // Set customer field LAST to prevent sourcing from clearing it
          if (entityId) {
            palletRecord.setValue({
              fieldId: 'custrecord8',
              value: parseInt(entityId, 10)
            });
          }
          
          var palletId = palletRecord.save({
            enableSourcing: false,
            ignoreMandatoryFields: true
          });
          
          palletIds.push(palletId);
          palletAssignments[p].palletId = palletId;
          
          log.debug('Pallet Created', 'Pallet ' + palletId + ' created with index ' + (p + 1) + ' of ' + totalPallets + ', usage: ' + usagePercentage.toFixed(2) + '%');
        } catch (createError) {
          var errorMsg = 'Failed to create pallet ' + (p + 1) + ': ' + createError.toString();
          log.error('Create Pallet Error', errorMsg);
          result.errors.push(errorMsg);
        }
      }
      
      if (palletIds.length === 0) {
        var errorMsg = 'Failed to create any pallet records';
        log.error('No Pallets Created', errorMsg);
        result.errors.push(errorMsg);
        return result;
      }
      
      result.palletsCreated = palletIds.length;
      result.palletAssignments = palletAssignments;
      
      // Step 7: Calculate and log summary
      var itemSummary = calculateItemSummary(palletAssignments, packages, itemUPP);
      result.itemSummary = itemSummary;
      
      // Log detailed pallet information
      logPalletDetails(palletAssignments, packages, itemUPP, itemNames, ifTranId);
      
      // Log totals
      logTotals(palletAssignments, packages, itemUPP, itemNames);
      
      // Step 8: Trigger Map/Reduce script for every 100 pallets
      if (palletAssignments.length > 0) {
        try {
          triggerMapReduceForAssignments(ifId, ifTranId, palletAssignments, itemVpnMap, result);
        } catch (mrError) {
          var errorMsg = 'Failed to trigger Map/Reduce script: ' + mrError.toString();
          log.error('Map/Reduce Trigger Error', errorMsg);
          result.errors.push(errorMsg);
          // Don't fail the whole process if MR trigger fails
        }
      }
      
      // Set success based on whether we have errors and created pallets
      if (result.errors.length > 0) {
        log.error('Errors Found', 'Completed with ' + result.errors.length + ' error(s). Check result.errors array.');
        result.success = false;
      } else {
        result.success = true;
      }
      
      // If we have warnings but no errors, still mark as success
      if (result.warnings.length > 0 && result.errors.length === 0) {
        result.success = true;
      }
      
    } catch (error) {
      log.error('calculateAndAssignPallets Error', error);
      result.errors.push(error.toString());
    }
    
    return result;
  }
  
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
  /**
   * Calculate optimal pallet assignments
   * Items can share pallets, minimize total pallets
   */
  function calculateOptimalPallets(packages, itemUPP, result) {
    // Step 1: Group packages and pre-calculate max cartons per pallet (CPP)
    var packagesByItem = {};
    var maxCppByItem = {};        // SKU → max cartons per pallet
    var percentPerCarton = {};    // SKU → % of pallet one carton uses
  
    packages.forEach(function(pkg) {
      if (!packagesByItem[pkg.itemId]) packagesByItem[pkg.itemId] = [];
      packagesByItem[pkg.itemId].push(pkg);
  
      if (!maxCppByItem[pkg.itemId]) {
        var upp = itemUPP[pkg.itemId] || 0;
        var cartonQty = pkg.packageQty;
        var maxCpp = upp > 0 ? Math.floor(upp / cartonQty) : 1;
        maxCpp = Math.max(maxCpp, 1);
  
        maxCppByItem[pkg.itemId] = maxCpp;
        percentPerCarton[pkg.itemId] = 100.0 / maxCpp;  // Key!
      }
    });
  
    // Step 2: Sort items by "difficulty" (total % needed) — hardest first
    var sortedItemIds = Object.keys(packagesByItem).sort(function(a, b) {
      var totalPercentA = packagesByItem[a].length * percentPerCarton[a];
      var totalPercentB = packagesByItem[b].length * percentPerCarton[b];
      return totalPercentB - totalPercentA;  // descending
    });
  
    // Step 3: Pallets array
    var pallets = [];  // each: { packages: [], usage: 0.0, itemCounts: {} }
  
    // Step 4: Place each carton using First-Fit with % capacity
    sortedItemIds.forEach(function(itemId) {
      var itemPackages = packagesByItem[itemId];
      var percentPer = percentPerCarton[itemId];
      var maxCpp = maxCppByItem[itemId];
  
      itemPackages.forEach(function(pkg) {
        var placed = false;
  
        // Try to place on existing pallets (First-Fit)
        for (var i = 0; i < pallets.length; i++) {
          var pallet = pallets[i];
          var currentCount = (pallet.itemCounts[itemId] || 0);
  
          // Check both: per-item limit AND total % capacity
          if (currentCount < maxCpp && 
              (pallet.usage + percentPer) <= 100.0) {   // This is the magic line
  
            pallet.packages.push(pkg);
            pallet.itemCounts[itemId] = currentCount + 1;
            pallet.usage += percentPer;
            placed = true;
            break;
          }
        }
  
        // No existing pallet has space → create new
        if (!placed) {
          pallets.push({
            packages: [pkg],
            itemCounts: { [itemId]: 1 },
            usage: percentPer
          });
        }
      });
    });
  
    // Log pallet usage after assignment
    for (var i = 0; i < pallets.length; i++) {
      var pal = pallets[i];
      log.audit('Pallet ' + (i + 1), 
        'Usage: ' + pal.usage.toFixed(2) + '% | Packages: ' + pal.packages.length);
    }
    
    // Log pallet usage after assignment
    for (var i = 0; i < pallets.length; i++) {
      var pal = pallets[i];
      log.audit('Pallet ' + (i + 1), 
        'Usage: ' + pal.usage.toFixed(2) + '% | Packages: ' + pal.packages.length);
    }
    
    // Convert to your format (preserve usage for later logging)
    return pallets.map(function(pal, idx) {
      // Calculate item summary for this pallet
      var itemsOnPallet = {};
      var totalCartons = pal.packages.length;
      
      // Group packages by item and calculate quantities
      pal.packages.forEach(function(pkg) {
        var itemId = pkg.itemId;
        if (!itemsOnPallet[itemId]) {
          itemsOnPallet[itemId] = {
            itemId: itemId,
            quantity: 0,
            cartons: 0
          };
        }
        itemsOnPallet[itemId].quantity += pkg.packageQty;
        itemsOnPallet[itemId].cartons += 1;
      });
      
      // Convert to array
      var itemsArray = [];
      for (var itemId in itemsOnPallet) {
        itemsArray.push(itemsOnPallet[itemId]);
      }
      
      return {
        palletId: null,
        packageIds: pal.packages.map(function(p) { return p.packageId; }),
        contentIds: pal.packages.map(function(p) { return p.contentId; }),
        usage: pal.usage,  // Preserve usage percentage
        items: itemsArray,  // Array of {itemId, quantity, cartons}
        totalCartons: totalCartons  // Total carton count for this pallet
      };
    });
  }
  
  /**
   * Calculate item summary for logging
   */
  function calculateItemSummary(palletAssignments, packages, itemUPP) {
    var summary = {};
    
    // Group packages by item
    var packagesByItem = {};
    packages.forEach(function (pkg) {
      if (!packagesByItem[pkg.itemId]) {
        packagesByItem[pkg.itemId] = [];
      }
      packagesByItem[pkg.itemId].push(pkg);
    });
    
    // Calculate summary for each item
    for (var itemId in packagesByItem) {
      var itemPkgs = packagesByItem[itemId];
      var totalQty = 0;
      var totalCartons = itemPkgs.length;
      
      itemPkgs.forEach(function (pkg) {
        totalQty += pkg.packageQty;
      });
      
      var upp = itemUPP[itemId] || 0;
      var cartonsPerPallet = upp > 0 && itemPkgs.length > 0 ? Math.floor(upp / itemPkgs[0].packageQty) : 0;
      
      summary[itemId] = {
        totalQty: totalQty,
        totalCartons: totalCartons,
        upp: upp,
        cartonsPerPallet: cartonsPerPallet
      };
    }
    
    return summary;
  }
  
  /**
   * Log detailed pallet information
   */
  function logPalletDetails(palletAssignments, packages, itemUPP, itemNames, ifTranId) {
    log.audit('=== PALLET ASSIGNMENTS ===', 'IF: ' + ifTranId);
    
    // Create lookup for packages
    var packageLookup = {};
    packages.forEach(function (pkg) {
      packageLookup[pkg.packageId] = pkg;
    });
    
    for (var i = 0; i < palletAssignments.length; i++) {
      var assignment = palletAssignments[i];
      var palletId = assignment.palletId || 'PENDING';
      
      var usage = assignment.usage !== undefined ? assignment.usage.toFixed(2) + '%' : 'N/A';
      log.audit('--- Pallet ' + (i + 1) + ' (ID: ' + palletId + ') ---', 
        'Usage: ' + usage + ' | Packages: ' + assignment.packageIds.length);
      
      // Group by item
      var itemsOnPallet = {};
      assignment.packageIds.forEach(function (pkgId) {
        var pkg = packageLookup[pkgId];
        if (pkg) {
          if (!itemsOnPallet[pkg.itemId]) {
            itemsOnPallet[pkg.itemId] = {
              cartons: 0,
              totalQty: 0,
              unitsPerCarton: pkg.packageQty
            };
          }
          itemsOnPallet[pkg.itemId].cartons++;
          itemsOnPallet[pkg.itemId].totalQty += pkg.packageQty;
        }
      });
      
      // Log each item on pallet
      for (var itemId in itemsOnPallet) {
        var itemData = itemsOnPallet[itemId];
        var upp = itemUPP[itemId] || 0;
        var itemName = itemNames[itemId] || itemId;
        log.audit('  Item: ' + itemId + ' (' + itemName + ')', 
          'Cartons: ' + itemData.cartons + 
          ', Units per Carton: ' + itemData.unitsPerCarton +
          ', Total Qty: ' + itemData.totalQty + 
          ', UPP: ' + upp);
      }
      
      log.audit('  Total Packages', assignment.packageIds.length.toString());
    }
  }
  
  /**
   * Trigger Map/Reduce script for pallet assignments
   * Batches assignments into groups of 100 pallets
   * @param {string} ifId - Item Fulfillment ID
   * @param {string} ifTranId - Item Fulfillment transaction ID
   * @param {Array} palletAssignments - Array of pallet assignment objects
   * @param {Object} itemVpnMap - Map of itemId to VPN
   * @param {Object} result - Result object to add MR task IDs to
   */
  function triggerMapReduceForAssignments(ifId, ifTranId, palletAssignments, itemVpnMap, result) {
    var BATCH_SIZE = 100;
    var mrScriptId = 'customscript_assign_packages_to_pallets';
    var mrDeployId = 'customdeploy1';
    
    log.audit('triggerMapReduceForAssignments', 'IF ' + ifTranId + ' - Triggering MR for ' + palletAssignments.length + ' pallet assignment(s)');
    
    // Batch assignments into groups of 100
    var batches = [];
    for (var i = 0; i < palletAssignments.length; i += BATCH_SIZE) {
      var batch = palletAssignments.slice(i, i + BATCH_SIZE);
      batches.push(batch);
    }
    
    log.debug('triggerMapReduceForAssignments', 'IF ' + ifTranId + ' - Created ' + batches.length + ' batch(es) of up to ' + BATCH_SIZE + ' pallets each');
    
    var mrTaskIds = [];
    var scheduledCount = 0;
    var errorCount = 0;
    
    // Submit MR task for each batch
    for (var b = 0; b < batches.length; b++) {
      var batch = batches[b];
      var batchNumber = b + 1;
      
      try {
        // Prepare assignment data for this batch
        var assignmentData = {
          ifId: ifId,
          ifTranId: ifTranId,
          palletAssignments: batch,
          batchNumber: batchNumber,
          totalBatches: batches.length,
          itemVpnMap: itemVpnMap  // Pass the VPN map to MR script
        };
        
        var jsonParam = JSON.stringify(assignmentData);
        
        log.debug('triggerMapReduceForAssignments', 'IF ' + ifTranId + ' - Submitting MR batch ' + batchNumber + ' of ' + batches.length + ' with ' + batch.length + ' pallet(s)');
        
        var mrTask = task.create({
          taskType: task.TaskType.MAP_REDUCE,
          scriptId: mrScriptId,
          deploymentId: mrDeployId,
          params: {
            custscriptjson: jsonParam
          }
        });
        
        var taskId = mrTask.submit();
        mrTaskIds.push(taskId);
        scheduledCount++;
        
        log.audit('triggerMapReduceForAssignments', 'IF ' + ifTranId + ' - MR batch ' + batchNumber + ' submitted. Task ID: ' + taskId);
        
      } catch (submitError) {
        errorCount++;
        var errorName = submitError.name || '';
        
        if (errorName === 'MAP_REDUCE_ALREADY_RUNNING') {
          log.audit('triggerMapReduceForAssignments', 'IF ' + ifTranId + ' - MR deployment ' + mrDeployId + ' is busy for batch ' + batchNumber + '. Will retry on next run.');
        } else {
          var errorMsg = 'IF ' + ifTranId + ' - Failed to submit MR batch ' + batchNumber + ': ' + submitError.toString();
          log.error('triggerMapReduceForAssignments', errorMsg);
          result.errors.push(errorMsg);
        }
      }
    }
    
    // Add MR task IDs to result
    if (!result.mrTaskIds) {
      result.mrTaskIds = [];
    }
    result.mrTaskIds = result.mrTaskIds.concat(mrTaskIds);
    
    log.audit('triggerMapReduceForAssignments', 'IF ' + ifTranId + ' - MR scheduling complete: ' + scheduledCount + ' scheduled, ' + errorCount + ' error(s)');
    
    if (errorCount > 0) {
      result.warnings.push('Some Map/Reduce batches failed to schedule. ' + scheduledCount + ' of ' + batches.length + ' batches scheduled successfully.');
    }
  }
  
  /**
   * Log totals
   */
  function logTotals(palletAssignments, packages, itemUPP, itemNames) {
    log.audit('=== TOTALS ===', '');
    log.audit('Total Pallets', palletAssignments.length.toString());
    log.audit('Total Packages', packages.length.toString());
    
    var totalPackages = 0;
    palletAssignments.forEach(function (a) {
      totalPackages += a.packageIds.length;
    });
    log.audit('Total Packages Assigned', totalPackages.toString());
    
    // Item totals
    var itemSummary = calculateItemSummary(palletAssignments, packages, itemUPP);
    log.audit('Items on IF', Object.keys(itemSummary).length.toString());
    
    for (var itemId in itemSummary) {
      var summary = itemSummary[itemId];
      var itemName = itemNames[itemId] || itemId;
      
      // Find units per carton for this item
      var unitsPerCarton = 0;
      for (var p = 0; p < packages.length; p++) {
        if (packages[p].itemId === itemId) {
          unitsPerCarton = packages[p].packageQty;
          break;
        }
      }
      
      log.audit('Item ' + itemId + ' (' + itemName + ')', 
        'Total Qty: ' + summary.totalQty + 
        ', Cartons: ' + summary.totalCartons + 
        ', Units per Carton: ' + unitsPerCarton +
        ', UPP: ' + summary.upp + 
        ', Cartons/Pallet: ' + summary.cartonsPerPallet);
    }
  }
  
  // ============================================================================
  // EXPORTS
  // ============================================================================
  
  return {
    calculateAndAssignPallets: calculateAndAssignPallets
  };
  
});

