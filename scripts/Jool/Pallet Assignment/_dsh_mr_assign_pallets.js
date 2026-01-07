/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @description Map/Reduce script to assign packages/package contents to pallets
 * 
 * This script:
 * 1. Takes pallet assignment data from library script (via Suitelet or MR)
 * 2. Supports single-IF or multi-IF payloads 
 * 3. Updates packages with pallet IDs
 * 4. Updates package content records with pallet IDs
 * 5. sets the package JSON field on the pallet for Jitterbit ASN use

 */

define([
  'N/record',
  'N/log',
  'N/runtime'
], function (record, log, runtime) {
  
  // Configuration constants
  var PALLET_RECORD_TYPE = 'customrecord_asn_pallet';
  var PALLET_IF_FIELD = 'custrecord_parent_if';
  var PALLET_ENTITY_FIELD = 'custrecord8';
  var PACKAGE_PALLET_FIELD = 'custrecord_parent_pallet';
  var PACKAGE_CONTENT_PALLET_FIELD = 'custrecord_content_asn_pallet';
  
  /**
   * Gets input data - returns pallet assignments array directly
   * @param {Object} inputContext
   * @returns {Array} Array of pallet assignments
   */
  function getInputData(inputContext) {
    try {
      // Read parameter directly - hardcoded to 'custscriptjson'
      var jsonParam = null;
      try {
        var scriptObj = runtime.getCurrentScript();
        jsonParam = scriptObj.getParameter({ name: 'custscriptjson' });
      } catch (e) {
        log.error('getInputData', 'Error reading custscriptjson parameter: ' + e.toString());
        return [];
      }
      
      if (!jsonParam) {
        log.error('getInputData', 'No pallet assignment JSON parameter found (custscriptjson)');
        return [];
      }
      
      var payload = JSON.parse(jsonParam);
      
      // Normalize input to array of IF jobs
      // Support both single-IF payload and multi-IF payload with jobs[] wrapper
      var jobs = payload.jobs ? payload.jobs : [payload];
      
      log.audit('getInputData', 'Processing ' + jobs.length + ' IF job(s)');
      
      // Flatten all palletAssignments across all jobs into one array
      var allAssignments = [];
      
      for (var j = 0; j < jobs.length; j++) {
        var job = jobs[j];
        var ifId = job.ifId;
        var ifTranId = job.ifTranId || job.ifId;
        var palletAssignments = job.palletAssignments || [];
        var itemVpnMap = job.itemVpnMap || {};
        var totalPallets = job.totalPallets || palletAssignments.length;
        
        if (palletAssignments.length === 0) {
          log.debug('getInputData', 'IF ' + ifTranId + ' - No pallet assignments');
          continue;
        }
        
        // For each assignment in this job, stamp it with job-level data
        for (var i = 0; i < palletAssignments.length; i++) {
          var assignment = palletAssignments[i];
          
          // Stamp assignment with job-level data
          assignment.ifId = ifId;
          assignment.ifTranId = ifTranId;
          assignment.itemVpnMap = itemVpnMap;
          assignment.totalPallets = totalPallets;
          
          // Pallet numbering resets per IF (not globally across the MR run)
          assignment.mrPalletNumber = i + 1;  // 1-based index within that IF
          
          allAssignments.push(assignment);
        }
        
        log.audit('getInputData', 'IF ' + ifTranId + ' - Added ' + palletAssignments.length + ' pallet assignment(s)');
      }
      
      if (allAssignments.length === 0) {
        log.debug('getInputData', 'No pallet assignments found in any job');
        return [];
      }
      
      log.audit('getInputData', 'Total pallet assignments to process: ' + allAssignments.length);
      
      // Return flattened assignments array
      return allAssignments;
      
    } catch (e) {
      log.error('getInputData', 'Error getting input data: ' + e.toString());
      throw e;
    }
  }
  
  /**
   * Map function - processes a single pallet assignment from input data
   * @param {Object} mapContext
   */
  function map(mapContext) {
    try {
      // Get the single assignment from input data
      // NetSuite serializes array elements to JSON strings when passing to map()
      var assignment = typeof mapContext.value === 'string' 
        ? JSON.parse(mapContext.value) 
        : mapContext.value;
      
      if (!assignment || !assignment.palletId) {
        log.error('map', 'Invalid assignment data in mapContext.value: ' + JSON.stringify(mapContext.value));
        return;
      }
      
      var ifId = assignment.ifId;
      var ifTranId = assignment.ifTranId || ifId;
      var itemVpnMap = assignment.itemVpnMap || {};
      
      // Add VPN to each item in the items array using the map
      var itemsWithVpn = (assignment.items || []).map(function(item) {
        var itemWithVpn = {
          itemId: item.itemId,
          quantity: item.quantity,
          cartons: item.cartons,
          vpn: itemVpnMap[item.itemId] || ''  // Add VPN from map
        };
        return itemWithVpn;
      });
      
      var dataToEmit = {
        ifId: ifId,
        ifTranId: ifTranId,
        palletId: assignment.palletId,
        mrPalletNumber: assignment.mrPalletNumber || 1,  // 1-based index within this MR run
        totalPallets: assignment.totalPallets || 1,  // Total pallets across all batches
        packageIds: assignment.packageIds || [],
        contentIds: assignment.contentIds || [],
        items: itemsWithVpn,  // Array of {itemId, quantity, cartons, vpn}
        totalCartons: assignment.totalCartons || 0  // Total carton count for this pallet
      };
      
      // Use palletId as key to process each pallet separately
      mapContext.write({
        key: assignment.palletId,
        value: dataToEmit
      });
      
    } catch (e) {
      log.error('map', 'Error processing record: ' + e.toString());
    }
  }
  
  /**
   * Reduce function - processes a single pallet assignment
   * @param {Object} reduceContext
   */
  function reduce(reduceContext) {
    try {
      // reduceContext.key is the palletId
      var palletId = reduceContext.key;
      
      if (!palletId) {
        log.error('reduce', 'No pallet ID in reduce key');
        return;
      }
      
      // Get the single assignment for this pallet
      if (reduceContext.values.length === 0) {
        log.debug('reduce', 'Pallet ' + palletId + ' - No assignment data to process');
        return;
      }
      
      var assignment = JSON.parse(reduceContext.values[0]);
      var ifId = assignment.ifId;
      var ifTranId = assignment.ifTranId || ifId;
      var mrPalletNumber = assignment.mrPalletNumber || 1;
      var totalPallets = assignment.totalPallets || 1;
      
      var errors = [];
      
      // Create JSON for pallet with items (including VPN) and total cartons
      var palletJson = {
        items: assignment.items || [],  // Items already have VPN from map phase
        totalCartons: assignment.totalCartons || 0
      };
      var palletJsonString = JSON.stringify(palletJson);
      
      // Update pallet with JSON data in custrecord_package_json
      try {
        record.submitFields({
          type: PALLET_RECORD_TYPE,
          id: palletId,
          values: {
            custrecord_package_json: palletJsonString
          },
          options: {
            enableSourcing: false,
            ignoreMandatoryFields: true
          }
        });
      } catch (jsonError) {
        var errorMsg = 'Failed to update pallet JSON field: ' + jsonError.toString();
        log.error('reduce', errorMsg);
        errors.push(errorMsg);
        // Continue processing - don't fail the whole pallet
      }
      
      // Update packages with pallet ID
      var packageIds = assignment.packageIds || [];
      var packagesUpdated = 0;
      for (var p = 0; p < packageIds.length; p++) {
        try {
          var packageId = packageIds[p];
          
          record.submitFields({
            type: 'customrecord_sps_package',
            id: packageId,
            values: {
              [PACKAGE_PALLET_FIELD]: palletId
            },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          
          packagesUpdated++;
          
        } catch (pkgError) {
          var errorMsg = 'Failed to update package ' + packageIds[p] + ': ' + pkgError.toString();
          log.error('reduce', errorMsg);
          errors.push(errorMsg);
        }
      }
      
      // Update package contents with pallet ID
      var contentIds = assignment.contentIds || [];
      var contentsUpdated = 0;
      for (var c = 0; c < contentIds.length; c++) {
        try {
          var contentId = contentIds[c];
          
          record.submitFields({
            type: 'customrecord_sps_content',
            id: contentId,
            values: {
              [PACKAGE_CONTENT_PALLET_FIELD]: palletId
            },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          
          contentsUpdated++;
          
        } catch (contentError) {
          var errorMsg = 'Failed to update package content ' + contentIds[c] + ': ' + contentError.toString();
          log.error('reduce', errorMsg);
          errors.push(errorMsg);
        }
      }
      
      // Emit to output for tracking completion (always emit to count all pallets)
      reduceContext.write({
        key: ifId,
        value: JSON.stringify({
          ifId: ifId,
          ifTranId: ifTranId,
          palletId: palletId,
          mrPalletNumber: mrPalletNumber,
          totalPallets: totalPallets,
          packagesUpdated: packagesUpdated,
          contentsUpdated: contentsUpdated,
          status: 'populated'
        })
      });
      
      if (errors.length > 0) {
        log.error('reduce', 'IF ' + ifTranId + ', pallet ' + palletId + ' - Errors: ' + errors.length);
      }
      
    } catch (e) {
      log.error('reduce', 'Error in reduce function: ' + e.toString());
    }
  }
  
  /**
   * Summary function - logs final statistics and updates pallet notes field
   * @param {Object} summaryContext
   */
  function summarize(summaryContext) {
    try {
      var usage = summaryContext.usage;
      var output = summaryContext.output;
      var mapErrors = summaryContext.mapErrors || [];
      var reduceErrors = summaryContext.reduceErrors || [];
      
      if (mapErrors.length > 0 || reduceErrors.length > 0) {
        log.audit('summarize', 'Map usage: ' + usage + ' units, Map errors: ' + mapErrors.length + ', Reduce errors: ' + reduceErrors.length);
        if (mapErrors.length > 0) log.error('summarize', 'Map errors: ' + JSON.stringify(mapErrors));
        if (reduceErrors.length > 0) log.error('summarize', 'Reduce errors: ' + JSON.stringify(reduceErrors));
      }
      
      // Process output to track pallet population completion
      var ifPopulationMap = {}; // {ifId: {ifTranId, palletCount, totalPallets}}
      
      // Helper function to process a single output record
      function processOutputRecord(ifId, valueStr) {
        try {
          var value = JSON.parse(valueStr);
          if (value.status === 'populated' && value.ifId) {
            if (!ifPopulationMap[ifId]) {
              ifPopulationMap[ifId] = {
                ifId: value.ifId,
                ifTranId: value.ifTranId || value.ifId,
                palletCount: 0,
                totalPallets: value.totalPallets || 0
              };
            }
            ifPopulationMap[ifId].palletCount++;
            if (value.totalPallets && value.totalPallets > ifPopulationMap[ifId].totalPallets) {
              ifPopulationMap[ifId].totalPallets = value.totalPallets;
            }
          }
        } catch (e) {
          // Skip invalid records
        }
      }
      
      // Process output using iterator pattern
      if (output) {
        try {
          var iterator = (typeof output.iterator === 'function') ? output.iterator() : output;
          var outputCount = 0;
          
          if (typeof iterator.hasNext === 'function') {
            while (iterator.hasNext()) {
              var outputData = iterator.next();
              processOutputRecord(outputData.key, typeof outputData.value === 'string' ? outputData.value : JSON.stringify(outputData.value));
              outputCount++;
            }
          } else if (typeof iterator.each === 'function') {
            iterator.each(function(key, value) {
              processOutputRecord(key, typeof value === 'string' ? value : JSON.stringify(value));
              outputCount++;
              return true;
            });
          }
          
          if (outputCount > 0) {
            log.audit('summarize', 'Total output records processed: ' + outputCount);
          }
        } catch (outputError) {
          log.error('summarize', 'Error processing output: ' + outputError.toString());
        }
      }
      
      // Update pallet notes field and completion flag for each IF that had pallets populated
      var notesUpdatedCount = 0;
      var notesErrorCount = 0;
      var flagSetCount = 0;
      var flagErrorCount = 0;
      
      for (var ifId in ifPopulationMap) {
        var population = ifPopulationMap[ifId];
        var palletsPopulated = population.palletCount;
        var expectedTotal = population.totalPallets;
        var ifTranId = population.ifTranId;
        
        // Check if all pallets for this IF were populated
        var allPalletsComplete = (expectedTotal > 0 && palletsPopulated >= expectedTotal);
        
        if (!allPalletsComplete) {
          log.audit('summarize', 'IF ' + ifTranId + ' - Not all pallets populated. Expected: ' + expectedTotal + ', Actual: ' + palletsPopulated);
        }
        
        try {
          // Load current pallet notes to append to it
          var ifRecord = record.load({
            type: 'itemfulfillment',
            id: ifId,
            isDynamic: false
          });
          
          var currentNotes = ifRecord.getValue('custbody_pallet_notes') || '';
          var appendText = 'populated ' + palletsPopulated + ' pallet' + (palletsPopulated !== 1 ? 's' : '');
          var newNotes = currentNotes ? (currentNotes + '. ' + appendText) : appendText;
          
          // Prepare field updates
          var fieldUpdates = {
            custbody_pallet_notes: newNotes
          };
          
          // Only set completion flag if ALL pallets were populated
          if (allPalletsComplete) {
            fieldUpdates.custbody_completed_pallet_population = true;
          }
          
          record.submitFields({
            type: 'itemfulfillment',
            id: ifId,
            values: fieldUpdates,
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          
          notesUpdatedCount++;
          if (allPalletsComplete) {
            flagSetCount++;
          }
          
        } catch (fieldError) {
          notesErrorCount++;
          if (allPalletsComplete) {
            flagErrorCount++;
          }
          log.error('summarize', 'IF ' + ifTranId + ' (ID: ' + ifId + ') - Error updating pallet fields: ' + fieldError.toString());
          // Continue processing other IFs even if one fails
        }
      }
      
      if (Object.keys(ifPopulationMap).length > 0) {
        log.audit('summarize', 'Updated notes: ' + notesUpdatedCount + ' IF(s), Completion flags: ' + flagSetCount + ', Errors: ' + notesErrorCount);
      }
      
    } catch (e) {
      log.error('summarize', 'Error in summarize function: ' + e.toString());
    }
  }
  
  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize
  };
  
});

