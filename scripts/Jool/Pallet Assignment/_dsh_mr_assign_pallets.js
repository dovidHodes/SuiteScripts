/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @description Map/Reduce script to create pallets and assign packages/package contents to pallets
 * 
 * This script:
 * 1. Takes pallet assignment data from the library script
 * 2. Creates pallet records for each batch
 * 3. Updates packages with pallet IDs
 * 4. Updates package content records with pallet IDs
 */

define([
  'N/search',
  'N/record',
  'N/log',
  'N/runtime'
], function (search, record, log, runtime) {
  
  // Configuration constants
  var PALLET_RECORD_TYPE = 'customrecord_asn_pallet';
  var PALLET_IF_FIELD = 'custrecord_parent_if';
  var PALLET_ENTITY_FIELD = 'custrecord8';
  var PACKAGE_PALLET_FIELD = 'custrecord_parent_pallet';
  var PACKAGE_CONTENT_PALLET_FIELD = 'custrecord_content_asn_pallet';
  
  /**
   * Gets input data - creates a search for the IF record
   * The actual assignment data is read from script parameter in map function
   * @param {Object} inputContext
   * @returns {Object} Search object with IF ID
   */
  function getInputData(inputContext) {
    try {
      // Get assignment data from script parameter to extract IF ID
      var scriptObj = runtime.getCurrentScript();
      var jsonParam = scriptObj.getParameter({ name: 'custscript_assign_packages_to_pallets_json' });
      
      if (!jsonParam) {
        log.error('getInputData', 'No pallet assignment JSON parameter found');
        // Return empty search to prevent processing (using non-existent ID)
        return search.create({
          type: 'itemfulfillment',
          filters: [['internalid', 'is', '-1']]
        });
      }
      
      var assignmentData = JSON.parse(jsonParam);
      var ifId = assignmentData.ifId;
      var ifTranId = assignmentData.ifTranId || ifId;
      var palletAssignments = assignmentData.palletAssignments || [];
      var batchNumber = assignmentData.batchNumber || 1;
      var totalBatches = assignmentData.totalBatches || 1;
      
      log.audit('getInputData', 'IF ' + ifTranId + ' - Processing batch ' + batchNumber + ' of ' + totalBatches + ' with ' + palletAssignments.length + ' pallet assignment(s)');
      
      if (palletAssignments.length === 0) {
        log.warning('getInputData', 'IF ' + ifTranId + ' - No pallet assignments in batch');
        // Return empty search to prevent processing (using non-existent ID)
        return search.create({
          type: 'itemfulfillment',
          filters: [['internalid', 'is', '-1']]
        });
      }
      
      // Return a search for the IF record - map will read the parameter
      return search.create({
        type: 'itemfulfillment',
        filters: [
          ['internalid', 'anyof', ifId]
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'tranid' })
        ]
      });
      
    } catch (e) {
      log.error('getInputData', 'Error getting input data: ' + e.toString());
      throw e;
    }
  }
  
  /**
   * Map function - reads assignment data from script parameter and emits each assignment
   * @param {Object} mapContext
   */
  function map(mapContext) {
    try {
      // Read assignment data from script parameter
      var scriptObj = runtime.getCurrentScript();
      var jsonParam = scriptObj.getParameter({ name: 'custscript_assign_packages_to_pallets_json' });
      
      if (!jsonParam) {
        log.error('map', 'No pallet assignment JSON parameter found');
        return;
      }
      
      var assignmentData = JSON.parse(jsonParam);
      var ifId = assignmentData.ifId;
      var ifTranId = assignmentData.ifTranId || ifId;
      var palletAssignments = assignmentData.palletAssignments || [];
      var batchNumber = assignmentData.batchNumber || 1;
      var totalBatches = assignmentData.totalBatches || 1;
      
      log.debug('map', 'IF ' + ifTranId + ' - Processing batch ' + batchNumber + ' of ' + totalBatches + ' with ' + palletAssignments.length + ' pallet assignment(s)');
      
      // Emit each pallet assignment
      for (var i = 0; i < palletAssignments.length; i++) {
        var assignment = palletAssignments[i];
        
        var dataToEmit = {
          ifId: ifId,
          tranId: ifTranId,
          palletIndex: i,
          palletId: assignment.palletId,
          packageIds: assignment.packageIds || [],
          contentIds: assignment.contentIds || [],
          batchNumber: batchNumber,
          totalBatches: totalBatches
        };
        
        // Use IF ID as key to group all pallets for same IF together
        mapContext.write({
          key: ifId,
          value: dataToEmit
        });
      }
      
      log.debug('map', 'IF ' + ifTranId + ' - Emitted ' + palletAssignments.length + ' pallet assignment(s)');
      
    } catch (e) {
      log.error('map', 'Error processing record: ' + e.toString());
    }
  }
  
  /**
   * Reduce function - creates pallets and updates packages/contents for each batch
   * @param {Object} reduceContext
   */
  function reduce(reduceContext) {
    try {
      var ifId = reduceContext.key;
      var assignments = [];
      
      // Collect all assignments for this IF
      for (var i = 0; i < reduceContext.values.length; i++) {
        var assignmentData = JSON.parse(reduceContext.values[i]);
        assignments.push(assignmentData);
      }
      
      if (assignments.length === 0) {
        log.warning('reduce', 'IF ' + ifId + ' - No assignments to process');
        return;
      }
      
      var tranId = assignments[0].tranId || ifId;
      log.audit('reduce', 'IF ' + tranId + ' - Processing ' + assignments.length + ' pallet assignment(s)');
      
      // Load IF record once to get entity ID if needed
      var entityId = null;
      try {
        var ifRecord = record.load({
          type: 'itemfulfillment',
          id: ifId,
          isDynamic: false
        });
        entityId = ifRecord.getValue('entity');
      } catch (e) {
        log.warning('reduce', 'IF ' + tranId + ' - Could not load IF record: ' + e.toString());
      }
      
      var palletsCreated = 0;
      var packagesUpdated = 0;
      var contentsUpdated = 0;
      var errors = [];
      
      // Process each pallet assignment
      for (var a = 0; a < assignments.length; a++) {
        var assignment = assignments[a];
        var palletId = assignment.palletId;
        
        try {
          // Create pallet if not already created
          if (!palletId) {
            try {
              var palletRecord = record.create({
                type: PALLET_RECORD_TYPE
              });
              
              var palletName = 'Pallet ' + (assignment.palletIndex + 1) + ' - IF ' + tranId;
              palletRecord.setValue({
                fieldId: 'name',
                value: palletName
              });
              
              palletRecord.setValue({
                fieldId: PALLET_IF_FIELD,
                value: ifId
              });
              
              if (entityId) {
                palletRecord.setValue({
                  fieldId: PALLET_ENTITY_FIELD,
                  value: entityId
                });
              }
              
              palletId = palletRecord.save({
                enableSourcing: false,
                ignoreMandatoryFields: true
              });
              
              palletsCreated++;
              log.debug('reduce', 'IF ' + tranId + ' - Created pallet ' + palletId);
              
            } catch (createError) {
              var errorMsg = 'IF ' + tranId + ' - Failed to create pallet ' + (assignment.palletIndex + 1) + ': ' + createError.toString();
              log.error('reduce', errorMsg);
              errors.push(errorMsg);
              continue; // Skip this pallet assignment
            }
          } else {
            log.debug('reduce', 'IF ' + tranId + ' - Using existing pallet ' + palletId);
          }
          
          // Update packages with pallet ID
          var packageIds = assignment.packageIds || [];
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
              var errorMsg = 'IF ' + tranId + ' - Failed to update package ' + packageIds[p] + ': ' + pkgError.toString();
              log.error('reduce', errorMsg);
              errors.push(errorMsg);
            }
          }
          
          // Update package contents with pallet ID
          var contentIds = assignment.contentIds || [];
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
              var errorMsg = 'IF ' + tranId + ' - Failed to update package content ' + contentIds[c] + ': ' + contentError.toString();
              log.error('reduce', errorMsg);
              errors.push(errorMsg);
            }
          }
          
          log.debug('reduce', 'IF ' + tranId + ' - Pallet ' + palletId + ': Updated ' + packageIds.length + ' package(s) and ' + contentIds.length + ' content record(s)');
          
        } catch (assignmentError) {
          var errorMsg = 'IF ' + tranId + ' - Error processing pallet assignment ' + (a + 1) + ': ' + assignmentError.toString();
          log.error('reduce', errorMsg);
          errors.push(errorMsg);
        }
      }
      
      // Log summary
      if (errors.length > 0) {
        log.error('reduce', 'IF ' + tranId + ' - Completed with errors: ' + errors.length + ' error(s)');
        log.error('reduce', 'IF ' + tranId + ' - Errors: ' + JSON.stringify(errors));
      } else {
        log.audit('reduce', 'IF ' + tranId + ' - Successfully processed: ' + 
          palletsCreated + ' pallet(s) created, ' + 
          packagesUpdated + ' package(s) updated, ' + 
          contentsUpdated + ' content record(s) updated');
      }
      
    } catch (e) {
      log.error('reduce', 'Error in reduce function: ' + e.toString());
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
      var mapErrors = summaryContext.mapErrors;
      var reduceErrors = summaryContext.reduceErrors;
      
      log.audit('summarize', 'Map usage: ' + usage + ' units');
      log.audit('summarize', 'Map errors: ' + mapErrors.length);
      log.audit('summarize', 'Reduce errors: ' + reduceErrors.length);
      
      if (mapErrors.length > 0) {
        log.error('summarize', 'Map errors: ' + JSON.stringify(mapErrors));
      }
      
      if (reduceErrors.length > 0) {
        log.error('summarize', 'Reduce errors: ' + JSON.stringify(reduceErrors));
      }
      
      // Process any output from reduce phase
      var outputIterator = output.iterator();
      var outputCount = 0;
      while (outputIterator.hasNext()) {
        var outputData = outputIterator.next();
        outputCount++;
      }
      
      log.audit('summarize', 'Total output records: ' + outputCount);
      
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

