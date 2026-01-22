/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Library script to create pallets for Item Fulfillments
 * 
 * This script is a "pure" library function that:
 * 1. Gets IF location and item UPP (units per pallet) values
 * 2. Searches all SPS packages and their content
 * 3. Uses pallet calculator library to determine optimal pallet assignments
 * 4. Creates pallet records in NetSuite
 * 5. Returns data structure with pallet assignments and summary
 * 
 * This library returns payload data only - it does NOT trigger Map/Reduce scripts.
 * Callers (Suitelet or planner MR) are responsible for submitting the package assigner MR.
 * 
 * Note: The actual pallet calculation logic is in _dsh_lib_pallet_calculator.js
 * and can be swapped out without modifying this script.
 */

define([
  'N/search',
  'N/record',
  'N/log',
  'N/runtime',
  './_dsh_lib_pallet_calculator',
  './_dsh_lib_pallet_sscc_generator'
], function (search, record, log, runtime, palletCalculator, ssccLib) {
  
  // ============================================================================
  // MAIN FUNCTION
  // ============================================================================
  
  /**
   * Calculate pallets and create pallet records
   * @param {string} ifId - Item Fulfillment internal ID
   * @returns {Object} Result object with pallet assignments
   */
  function calculateAndCreatePallets(ifId) {
    // Track governance usage
    var usageStart = runtime.getCurrentScript().getRemainingUsage();
    
    var result = {
      success: false,
      ifId: ifId,
      ifTranId: '',  // Will be set after loading IF
      palletsCreated: 0,
      totalPallets: 0,  // Same as palletsCreated, for clarity
      palletAssignments: [], // Array of {palletId, packageIds: [], contentIds: [], items: [{itemId, quantity, cartons}], totalCartons: number, sscc: string}
      itemVpnMap: {},  // Map of itemId to VPN
      itemEdiUomMap: {},  // Map of itemId to EDI UOM
      itemPoLineMap: {},  // Map of itemId to PO line number
      itemSummary: {}, // Summary by item
      errors: [],
      warnings: []
    };
    
    try {
      log.audit('calculateAndCreatePallets', 'Starting for IF: ' + ifId);
      
      // Step 1: Load IF and get location
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      
      var ifTranId = ifRecord.getValue('tranid') || ifId;
      var locationId = ifRecord.getValue('custbody_ship_from_location');
      var entityId = ifRecord.getValue('entity');
      
      // Set ifTranId in result
      result.ifTranId = ifTranId;
      
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
      var itemDisplayNames = {}; // {itemId: displayName}
      var itemDescriptions = {}; // {itemId: description}
      var itemVpnMap = {}; // {itemId: vpn} - Map of itemId to VPN from column field on item list
      var itemEdiUomMap = {}; // {itemId: ediUom} - Map of itemId to EDI UOM from column field on item list
      var itemPoLineMap = {}; // {itemId: poLineNumber} - Map of itemId to PO line number from column field on item list
      var lineCount = ifRecord.getLineCount({ sublistId: 'item' });
      
      for (var i = 0; i < lineCount; i++) {
        var itemId = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'item',
          line: i
        });
        
        if (!itemId) continue;
        
        // Get description from IF line
        var description = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'description',
          line: i
        }) || '';
        itemDescriptions[itemId] = description;
        
        // Get VPN from column field on item list (vendorpartnumber)
        var vpn = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'custcol_sps_vendorpartnumber',
          line: i
        }) || '';
        
        // Get EDI UOM from column field on item list
        var ediUom = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'custcol_sps_orderqtyuom',
          line: i
        }) || '';
        
        // Get PO line number from column field on item list
        var poLineNumber = ifRecord.getSublistValue({
          sublistId: 'item',
          fieldId: 'custcol_sps_linesequencenumber',
          line: i
        }) || '';
        
        // Store VPN in map
        if (vpn) {
          itemVpnMap[itemId] = vpn;
        }
        
        // Store EDI UOM in map
        if (ediUom) {
          itemEdiUomMap[itemId] = ediUom;
        }
        
        // Store PO line number in map
        if (poLineNumber) {
          itemPoLineMap[itemId] = poLineNumber;
        }
        
        // Load item record and get UPP based on location
        try {
          var itemRecord = record.load({
            type: 'inventoryitem',
            id: itemId,
            isDynamic: false
          });
          
          if (!itemRecord) {
            var errorMsg = 'Failed to load item record: ' + itemId;
            log.error('Item Load Error', errorMsg);
            result.errors.push(errorMsg);
            continue;
          }
          
          // Get item name
          var itemName = itemRecord.getValue('itemid') || itemRecord.getValue('displayname') || itemId;
          itemNames[itemId] = itemName;
          
          // Get display name
          var displayName = itemRecord.getValue('displayname') || '';
          itemDisplayNames[itemId] = displayName;
          
          // Get UPP using the field determined once per IF
          var upp = itemRecord.getValue(uppFieldId) || 0;
          
          if (upp > 0) {
            itemUPP[itemId] = upp;
          } else {
            var errorMsg = 'Item ' + itemId + ' (' + itemName + ') has no UPP (units per pallet) for location ' + locationId;
            log.error('No UPP', errorMsg);
            result.errors.push(errorMsg);
          }
        } catch (itemLoadError) {
          var errorMsg = 'Error loading item ' + itemId + ': ' + itemLoadError.toString();
          log.error('Item Load Error', errorMsg);
          result.errors.push(errorMsg);
        }
      }
      
      log.debug('Field Maps Built', 'Built maps - VPN: ' + Object.keys(itemVpnMap).length + ', EDI UOM: ' + Object.keys(itemEdiUomMap).length + ', PO Line: ' + Object.keys(itemPoLineMap).length + ' item(s)');
      
      // Store maps in result
      result.itemVpnMap = itemVpnMap;
      result.itemEdiUomMap = itemEdiUomMap;
      result.itemPoLineMap = itemPoLineMap;
      
      // Step 4: Search all SPS packages for IF
      log.debug('Package Search', 'About to create package search for IF: ' + ifId);
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
      
      log.debug('Package Search', 'Package search created, about to run');
      var packageSearchResult = packageSearch.run();
      log.debug('Package Search', 'Package search run completed, about to iterate');
      
      // First, collect all package IDs
      var packageIds = [];
      var packageData = {}; // {packageId: {qty: number}}
      
      packageSearchResult.each(function (packageResult) {
        var packageId = packageResult.id;
        var packageQty = packageResult.getValue('custrecord_sps_package_qty') || 0;
        
        if (packageId) {
          packageIds.push(packageId);
          packageData[packageId] = {
            qty: parseFloat(packageQty) || 0
          };
        }
        
        return true;
      });
      
      log.debug('Package Search', 'Found ' + packageIds.length + ' packages, about to bulk search content');
      
      // Bulk search for all content records at once (much more efficient)
      // Use runPaged to handle more than 4000 results
      var contentMap = {}; // {packageId: {contentId: string, itemId: string}}
      
      if (packageIds.length > 0) {
        var contentSearch = search.create({
          type: 'customrecord_sps_content',
          filters: [
            ['custrecord_sps_content_package', 'anyof', packageIds]
          ],
          columns: [
            search.createColumn({ name: 'internalid' }),
            search.createColumn({ name: 'custrecord_sps_content_package' }),
            search.createColumn({ name: 'custrecord_sps_content_item' })
          ]
        });
        
        log.debug('Content Search', 'Bulk content search created for ' + packageIds.length + ' packages');
        
        // Use runPaged to handle large result sets (>4000)
        var pagedData = contentSearch.runPaged({ pageSize: 1000 });
        var pageRanges = pagedData.pageRanges;
        var totalPages = pageRanges ? pageRanges.length : 0;
        log.debug('Content Search', 'Content search has ' + totalPages + ' page(s)');
        
        var totalContentCount = 0; // Count all content records (not just first per package)
        
        // Process each page
        for (var pageNum = 0; pageNum < totalPages; pageNum++) {
          var page = pagedData.fetch({ index: pageNum });
          
          // Count all content records on this page
          totalContentCount += page.data.length;
          
          page.data.forEach(function (contentResult) {
            var contentId = contentResult.id;
            var packageId = contentResult.getValue('custrecord_sps_content_package');
            var itemId = contentResult.getValue('custrecord_sps_content_item');
            
            // Store first content record found for each package
            if (packageId && !contentMap[packageId]) {
              contentMap[packageId] = {
                contentId: contentId,
                itemId: itemId
              };
            }
          });
          
          // Early exit: if we've found content for all packages, no need to continue
          if (Object.keys(contentMap).length >= packageIds.length) {
            log.debug('Content Search', 'Found content for all packages, stopping at page ' + (pageNum + 1) + ' (processed ' + totalContentCount + ' content records so far)');
            break;
          }
        }
        
        log.debug('Content Search', 'Bulk content search completed - Found content for ' + Object.keys(contentMap).length + ' of ' + packageIds.length + ' packages, Total content records: ' + totalContentCount);
      }
      
      // Build packages array from collected data
      for (var i = 0; i < packageIds.length; i++) {
        var packageId = packageIds[i];
        var content = contentMap[packageId];
        
        if (content && content.contentId && content.itemId) {
          packages.push({
            packageId: packageId,
            packageQty: packageData[packageId].qty,
            contentId: content.contentId,
            itemId: content.itemId
          });
        }
      }
      
      log.debug('Package Search', 'Package processing complete - Total packages: ' + packageIds.length + ', Packages with content: ' + packages.length + ', Total content records: ' + totalContentCount);
      
      log.audit('Packages Found', 'Found ' + packages.length + ' packages');
      
      if (packages.length === 0) {
        var errorMsg = 'No SPS packages found for IF: ' + ifId;
        log.error('No Packages', errorMsg);
        result.errors.push(errorMsg);
        return result;
      }
      
      // Step 5: Calculate optimal pallet assignments using calculator library
      var palletAssignments = palletCalculator.calculatePalletAssignments(packages, itemUPP);
      
      // Step 6: Create pallet records
      var palletIds = [];
      var totalPallets = palletAssignments.length;
      
      for (var p = 0; p < palletAssignments.length; p++) {
        try {
          var palletRecord = record.create({
            type: 'customrecord_asn_pallet'
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
          
          // Set customer 
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
          
          // Generate and save SSCC immediately after pallet creation
          var sscc = null;
          try {
            sscc = ssccLib.generateAndSaveSSCC(palletId);
            palletAssignments[p].sscc = sscc;
            log.debug('SSCC Generated', 'Pallet ' + palletId + ' - SSCC: ' + sscc);
          } catch (ssccError) {
            var ssccErrorMsg = 'Failed to generate SSCC for pallet ' + palletId + ': ' + ssccError.toString();
            log.error('SSCC Generation Error', ssccErrorMsg);
            result.warnings.push(ssccErrorMsg);
            // Continue processing - don't fail the whole pallet
          }
          
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
      result.totalPallets = palletIds.length;  // Set totalPallets
      result.palletAssignments = palletAssignments;
      
      // Step 7: Build and store pallet JSON on IF to be used by the packing slip template
      try {
        buildAndStorePalletJson(ifRecord, palletAssignments, itemNames, itemDisplayNames, itemDescriptions, totalPallets, itemVpnMap, itemEdiUomMap, itemPoLineMap);
      } catch (jsonError) {
        var jsonErrorMsg = 'Failed to build/store pallet JSON on IF: ' + jsonError.toString();
        log.error('Pallet JSON Error', jsonErrorMsg);
        result.warnings.push(jsonErrorMsg);
        // Don't fail the whole process - just log the error
      }
      
      // Step 8: Calculate and log summary
      var itemSummary = calculateItemSummary(palletAssignments, packages, itemUPP);
      result.itemSummary = itemSummary;
      
      // Log detailed pallet information
      logPalletDetails(palletAssignments, packages, itemUPP, itemNames, ifTranId);
      
      // Log totals
      logTotals(palletAssignments, packages, itemUPP, itemNames);
      
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
      log.error('calculateAndCreatePallets Error', error);
      result.errors.push(error.toString());
    }
    
    // Calculate and log total governance usage
    var usageEnd = runtime.getCurrentScript().getRemainingUsage();
    var totalUsage = usageStart - usageEnd;
    log.debug('Governance Usage', 'Total governance used: ' + totalUsage + ' units (Started with: ' + usageStart + ', Remaining: ' + usageEnd + ')');
    
    return result;
  }
  
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================
  
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
   * Build and store pallet JSON on IF
   * @param {Object} ifRecord - Item Fulfillment record (already loaded)
   * @param {Array} palletAssignments - Array of pallet assignments with items and SSCC
   * @param {Object} itemNames - Map of itemId to itemName
   * @param {Object} itemDisplayNames - Map of itemId to displayName
   * @param {Object} itemDescriptions - Map of itemId to description
   * @param {number} totalPallets - Total number of pallets
   * @param {Object} itemVpnMap - Map of itemId to VPN
   * @param {Object} itemEdiUomMap - Map of itemId to EDI UOM
   * @param {Object} itemPoLineMap - Map of itemId to PO line number
   */
  function buildAndStorePalletJson(ifRecord, palletAssignments, itemNames, itemDisplayNames, itemDescriptions, totalPallets, itemVpnMap, itemEdiUomMap, itemPoLineMap) {
    try {
      var ifId = ifRecord.id;
      log.audit('buildAndStorePalletJson', 'Building pallet JSON for IF: ' + ifId);
      
      // Build pallets array
      var pallets = [];
      
      for (var p = 0; p < palletAssignments.length; p++) {
        var assignment = palletAssignments[p];
        var palletId = assignment.palletId;
        var palletNumber = p + 1;
        var sscc = assignment.sscc || '';
        
        // Build items array for this pallet with enhanced fields
        var items = [];
        if (assignment.items && assignment.items.length > 0) {
          for (var i = 0; i < assignment.items.length; i++) {
            var item = assignment.items[i];
            var itemId = item.itemId;
            var itemName = itemNames[itemId] || itemId;
            var displayName = itemDisplayNames[itemId] || '';
            
            items.push({
              itemName: itemName,
              displayName: displayName,
              qty: item.quantity || 0,
              cartons: item.cartons || 0,
              vpn: itemVpnMap[itemId] || '',
              ediUom: itemEdiUomMap[itemId] || '',
              poLineNumber: itemPoLineMap[itemId] || ''
            });
          }
        }
        
        pallets.push({
          palletNumber: palletNumber,
          palletId: palletId,
          sscc: sscc,
          items: items
        });
      }
      
      // Build final JSON structure
      var palletJson = {
        totalPallets: totalPallets,
        pallets: pallets
      };
      
      var jsonString = JSON.stringify(palletJson);
      
      // Store on IF (using the already loaded record)
      ifRecord.setValue({
        fieldId: 'custbody_pallet_json',
        value: jsonString
      });
      
      ifRecord.save({
        enableSourcing: false,
        ignoreMandatoryFields: true
      });
      
      log.audit('buildAndStorePalletJson', 'Successfully stored pallet JSON on IF: ' + ifId + ' (' + pallets.length + ' pallets)');
      
    } catch (error) {
      log.error('buildAndStorePalletJson Error', error);
      throw error;
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
    calculateAndCreatePallets: calculateAndCreatePallets
  };
  
});

