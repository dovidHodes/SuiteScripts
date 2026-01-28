/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @description Map/Reduce script to generate and merge pallet labels for Item Fulfillments
 * 
 * This script:
 * 1. Searches for IFs where pallets have been assigned (with all required filters)
 * 2. Finds all pallets for those IFs in a single search
 * 3. Generates pallet labels for each pallet in the map stage
 * 4. Merges all labels per IF in the reduce stage
 * 5. Attaches merged PDF to IF and sets URL field
 */

define([
  'N/search',
  'N/record',
  'N/log',
  'N/runtime',
  'N/file',
  'N/url',
  './_dsh_lib_pallet_label_generator',
  './_dsh_lib_pdf_merger',
  './_dsh_lib_time_tracker'
], function (search, record, log, runtime, file, url, palletLabelLib, pdfMerger, timeTrackerLib) {
  
  // Configuration constants
  var PALLET_RECORD_TYPE = 'customrecord_asn_pallet';
  var PALLET_IF_FIELD = 'custrecord_parent_if';
  var PDF_FOLDER_ID = 2122;
  
  // Time Tracker Constants
  var ACTION_ID_PALLET_LABELS = 11;  // Action ID for pallet label creation
  var TIME_SAVED_PALLET_LABELS = 600;  // 10 minutes in seconds
  
  /**
   * Gets input data - searches for IFs and pallets
   * @param {Object} inputContext
   * @returns {Array} Array of pallet data objects
   */
  function getInputData(inputContext) {
    try {
      log.audit('getInputData', 'Starting to search for IFs and pallets');
      
      // Step 1: Search for entities where custentity_print_pallet_labels = true
      var entityIds = [];
      try {
        search.create({
          type: search.Type.CUSTOMER,
          filters: [['custentity_print_pallet_labels', 'is', 'T']],
          columns: [search.createColumn({ name: 'internalid' })]
        }).run().each(function(result) {
          entityIds.push(result.id);
          return true;
        });
        
        if (entityIds.length === 0) {
          log.audit('getInputData', 'No entities found, exiting');
          return [];
        }
      } catch (e) {
        log.error('getInputData', 'Error searching entities: ' + e.toString());
        return [];
      }
      
      // Step 2: Search for IFs with all filters
      var ifSearch = search.create({
        type: search.Type.ITEM_FULFILLMENT,
        filters: [
          ['mainline', 'is', 'T'],  // Only get header records
          'AND',
          ['custbody_completed_pallet_population', 'is', 'T'],  // Pallets assigned
          'AND',
          ['custbody_requested_pallet_labels', 'is', 'F'],  // Not yet requested
          'AND',
          ['custbody_routing_status', 'is', 3],  // Routing received (numeric)
          'AND',
          ['custbody_request_type', 'is', 1],  // Pallet type routing request (numeric)
          'AND',
          ['custbody_sps_carrieralphacode', 'isnot', 'AMZX'],  // Carrier is not AMZX (text field, use isnot)
          'AND',
          ['entity', 'anyof', entityIds]  // Entity in our list
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'tranid' }),
          search.createColumn({ name: 'custbody_sps_ponum_from_salesorder' }),
          search.createColumn({ name: 'custbody_ship_from_location' }),
          search.createColumn({ name: 'entity' })
        ]
      });
      
      // Collect all IF IDs
      var ifIds = [];
      var ifDataMap = {}; // {ifId: {ifTranId, poNumber, locationId, locationName, entityId}}
      
      try {
        ifSearch.run().each(function(result) {
          var ifId = result.id;
          var ifTranId = result.getValue('tranid') || ifId;
          var poNumber = result.getValue('custbody_sps_ponum_from_salesorder') || '';
          var locationId = result.getValue('custbody_ship_from_location') || '';
          var locationName = result.getText('custbody_ship_from_location') || '';
          var entityId = result.getValue('entity') || '';
          
          ifIds.push(ifId);
          ifDataMap[ifId] = {
            ifTranId: ifTranId,
            poNumber: poNumber,
            locationId: locationId,
            locationName: locationName,
            entityId: entityId
          };
          
          return true;
        });
        
        log.audit('getInputData', 'Found ' + ifIds.length + ' IF(s) matching criteria');
        
        if (ifIds.length === 0) {
          log.audit('getInputData', 'No IFs found matching criteria, exiting');
          return [];
        }
      } catch (e) {
        log.error('getInputData', 'Error searching for IFs: ' + e.toString());
        return [];
      }
      
      // Step 3: Set custbody_requested_pallet_labels = true on each IF (to prevent duplicate processing)
      // Batch update for efficiency - update all at once
      var flagsSetCount = 0;
      for (var i = 0; i < ifIds.length; i++) {
        try {
          record.submitFields({
            type: 'itemfulfillment',
            id: ifIds[i],
            values: { custbody_requested_pallet_labels: true },
            options: { enableSourcing: false, ignoreMandatoryFields: true }
          });
          flagsSetCount++;
        } catch (fieldError) {
          log.error('getInputData', 'Error setting flag on IF ' + ifIds[i] + ': ' + fieldError.toString());
        }
      }
      
      if (flagsSetCount < ifIds.length) {
        log.audit('getInputData', 'Set flags: ' + flagsSetCount + '/' + ifIds.length + ' success');
      }
      
      // Step 4: Create a single search for all pallets where custrecord_parent_if is anyof [ifIds array]
      var palletSearch = search.create({
        type: PALLET_RECORD_TYPE,
        filters: [[PALLET_IF_FIELD, 'anyof', ifIds]],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: PALLET_IF_FIELD })
        ]
      });
      
      // Step 5: For each pallet found, create pallet data object
      var palletDataArray = [];
      
      try {
        palletSearch.run().each(function(result) {
          var palletId = result.id;
          var parentIfId = result.getValue(PALLET_IF_FIELD);
          
          if (!parentIfId) return true;
          
          var ifData = ifDataMap[parentIfId];
          if (!ifData) return true;
          
          palletDataArray.push({
            palletId: palletId,
            ifId: parentIfId,
            ifTranId: ifData.ifTranId,
            poNumber: ifData.poNumber,
            locationName: ifData.locationName || '',
            entityId: ifData.entityId || ''
          });
          
          return true;
        });
        
        log.audit('getInputData', 'Found ' + palletDataArray.length + ' pallet(s) across ' + ifIds.length + ' IF(s)');
        
      } catch (e) {
        log.error('getInputData', 'Error searching for pallets: ' + e.toString());
        return [];
      }
      
      return palletDataArray;
      
    } catch (e) {
      log.error('getInputData', 'Error getting input data: ' + e.toString());
      throw e;
    }
  }
  
  /**
   * Map function - generates pallet label for each pallet
   * @param {Object} mapContext
   */
  function map(mapContext) {
    try {
      // Get the pallet data object from input data
      // NetSuite serializes array elements to JSON strings when passing to map()
      var palletData = typeof mapContext.value === 'string' 
        ? JSON.parse(mapContext.value) 
        : mapContext.value;
      
      if (!palletData || !palletData.palletId) {
        log.error('map', 'Invalid pallet data in mapContext.value: ' + JSON.stringify(mapContext.value));
        return;
      }
      
      var result = palletLabelLib.generatePalletLabel(palletData.palletId, PDF_FOLDER_ID);
      
      if (result.success && result.fileId) {
        mapContext.write({
          key: palletData.ifId,
          value: {
            fileId: result.fileId,
            ifId: palletData.ifId,
            ifTranId: palletData.ifTranId || palletData.ifId,
            poNumber: palletData.poNumber || '',
            locationName: palletData.locationName || '',
            entityId: palletData.entityId || ''
          }
        });
      } else {
        log.error('map', 'IF ' + (palletData.ifTranId || palletData.ifId) + ' - Failed to generate label for pallet ' + palletData.palletId + ': ' + (result.error || 'Unknown error'));
      }
      
    } catch (e) {
      log.error('map', 'Error processing pallet: ' + e.toString());
    }
  }
  
  /**
   * Reduce function - merges PDFs for each IF
   * @param {Object} reduceContext
   */
  function reduce(reduceContext) {
    try {
      // reduceContext.key is the ifId
      var ifId = reduceContext.key;
      
      if (!ifId) {
        log.error('reduce', 'No IF ID in reduce key');
        return;
      }
      
      if (reduceContext.values.length === 0) return;
      
      // Extract fileIds and get IF details from first value
      var fileIds = [];
      var firstValue = typeof reduceContext.values[0] === 'string' 
        ? JSON.parse(reduceContext.values[0]) 
        : reduceContext.values[0];
      
      if (!firstValue || !firstValue.fileId) return;
      
      var ifTranId = firstValue.ifTranId || ifId;
      var poNumber = firstValue.poNumber || '';
      var locationName = firstValue.locationName || '';
      var entityId = firstValue.entityId || '';
      
      for (var i = 0; i < reduceContext.values.length; i++) {
        var value = typeof reduceContext.values[i] === 'string' 
          ? JSON.parse(reduceContext.values[i]) 
          : reduceContext.values[i];
        if (value && value.fileId) fileIds.push(value.fileId);
      }
      
      if (fileIds.length === 0) return;
      
      // Build file name: All pallet labels {poNumber} - {locationName}.pdf (matches carton label format)
      var fileName = 'All pallet labels';
      if (poNumber) fileName += ' ' + poNumber;
      if (locationName) fileName += ' - ' + locationName;
      fileName += '.pdf';
      
      // Call merge library function with duplicatePages = true for pallet labels
      // Note: mergePDFs returns a Promise (PDFlib is async)
      // In SuiteScript Map/Reduce, we cannot reliably wait for Promises
      // The Promise callback may execute after reduce() exits
      // Solution: Handle all work inside the Promise callback
      var mergeResult = pdfMerger.mergePDFs(fileIds, fileName, PDF_FOLDER_ID, true);
      
      if (!mergeResult || typeof mergeResult.then !== 'function') {
        log.error('reduce', 'IF ' + ifTranId + ' - mergePDFs did not return a Promise');
        return;
      }
      
      // Handle Promise - do all work inside the callback
      mergeResult.then(function(result) {
        if (!result || !result.success) {
          log.error('reduce', 'IF ' + ifTranId + ' - Failed to merge PDFs: ' + (result ? result.error : 'Unknown error'));
          return;
        }
        
        try {
          record.attach({
            record: { type: 'file', id: result.fileId },
            to: { type: 'itemfulfillment', id: ifId }
          });
        } catch (attachError) {
          log.error('reduce', 'IF ' + ifTranId + ' - Error attaching PDF: ' + attachError.toString());
        }
        
        if (result.pdfUrl) {
          try {
            record.submitFields({
              type: 'itemfulfillment',
              id: ifId,
              values: { custbody_merged_pallet_labels: result.pdfUrl },
              options: { enableSourcing: false, ignoreMandatoryFields: true }
            });
            log.audit('reduce', 'IF ' + ifTranId + ' - Processed ' + fileIds.length + ' pallet label(s). URL: ' + result.pdfUrl);
            
            // Track time saved for pallet label creation (10 minutes per IF)
            if (entityId) {
              try {
                timeTrackerLib.addTimeTrackerLine({
                  actionId: ACTION_ID_PALLET_LABELS,
                  customerId: entityId,
                  timeSaved: TIME_SAVED_PALLET_LABELS
                });
                log.debug('reduce', 'IF ' + ifTranId + ' - Time tracked: 10 minutes for pallet label creation');
              } catch (timeError) {
                log.error('reduce', 'IF ' + ifTranId + ' - Error tracking time: ' + timeError.toString());
                // Continue - time tracking failure should not affect label processing
              }
            }
            
            try {
              reduceContext.write({ key: ifId, value: 'merged' });
            } catch (writeError) {
              // reduce() may have exited, ignore
            }
          } catch (updateError) {
            log.error('reduce', 'IF ' + ifTranId + ' - Error updating field: ' + updateError.toString());
          }
        }
      }).catch(function(error) {
        log.error('reduce', 'IF ' + ifTranId + ' - Merge error: ' + error.toString());
      });
      
    } catch (e) {
      log.error('reduce', 'Error in reduce function for IF ID ' + ifId + ': ' + e.toString());
    }
  }
  
  /**
   * Summary function - logs final statistics
   * @param {Object} summaryContext
   */
  function summarize(summaryContext) {
    try {
      var usage = summaryContext.usage;
      var output = summaryContext.output;
      var mapErrors = summaryContext.mapErrors || [];
      var reduceErrors = summaryContext.reduceErrors || [];
      
      log.audit('summarize', 'Map/Reduce script completed');
      log.audit('summarize', 'Usage: ' + usage + ' units');
      log.audit('summarize', 'Map errors: ' + mapErrors.length + ', Reduce errors: ' + reduceErrors.length);
      
      if (mapErrors.length > 0) {
        log.error('summarize', 'Map errors: ' + JSON.stringify(mapErrors));
      }
      if (reduceErrors.length > 0) {
        log.error('summarize', 'Reduce errors: ' + JSON.stringify(reduceErrors));
      }
      
      // Count IFs processed
      var ifCount = 0;
      if (output) {
        try {
          var iterator = (typeof output.iterator === 'function') ? output.iterator() : output;
          
          if (typeof iterator.hasNext === 'function') {
            while (iterator.hasNext()) {
              iterator.next();
              ifCount++;
            }
          } else if (typeof iterator.each === 'function') {
            iterator.each(function(key, value) {
              ifCount++;
              return true;
            });
          }
        } catch (outputError) {
          log.error('summarize', 'Error processing output: ' + outputError.toString());
        }
      }
      
      if (ifCount > 0) {
        log.audit('summarize', 'Processed ' + ifCount + ' IF(s)');
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

