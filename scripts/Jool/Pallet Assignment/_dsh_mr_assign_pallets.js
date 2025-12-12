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
 * 
 * REQUIRED SCRIPT PARAMETER:
 * IMPORTANT: Even though parameters are passed at runtime via task.create(),
 * the parameter FIELD must exist in the deployment for it to be accessible.
 * 
 * In the script deployment (customdeploy1), create a script parameter with:
 * - Field ID: 'json' 
 * - Type: Free-Form Text
 * - Default Value: (leave blank - will be set at runtime)
 * - The full parameter name will be: custscriptjson
 * 
 * Without this parameter field in the deployment, runtime parameters passed
 * via task.create() will not be accessible in the MR script.
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
      // When called via task.create(), parameters are accessed through inputContext.executionContext
      var jsonParam = null;
      var paramNames = [
        'custscriptjson',
        'custscript_assign_packages_to_pallets_json',
        'custscript_assign_packages_to_pallets_pallet_assignment_json',
        'custscript_pallet_assignment_json'
      ];
      
      // First try executionContext (for task.create() calls)
      if (inputContext && inputContext.executionContext) {
        try {
          var execContext = inputContext.executionContext;
          log.debug('getInputData', 'executionContext exists, trying to get parameters');
          
          // Try to get all parameters to see what's available
          try {
            // Try to get all parameters - this will help us see what's actually passed
            var allExecParams = {};
            for (var k = 0; k < paramNames.length; k++) {
              try {
                var testParam = execContext.getParameter({ name: paramNames[k] });
                if (testParam) {
                  allExecParams[paramNames[k]] = testParam.substring(0, 100) + '...'; // First 100 chars for debugging
                }
              } catch (e) {
                // Parameter doesn't exist
              }
            }
            log.debug('getInputData', 'Available parameters in executionContext: ' + JSON.stringify(allExecParams));
          } catch (e) {
            log.debug('getInputData', 'Could not enumerate executionContext parameters: ' + e.toString());
          }
          
          // Now try to get the actual parameter
          for (var j = 0; j < paramNames.length && !jsonParam; j++) {
            try {
              jsonParam = execContext.getParameter({ name: paramNames[j] });
              if (jsonParam) {
                log.debug('getInputData', 'Found parameter in executionContext with name: ' + paramNames[j]);
                log.debug('getInputData', 'Parameter value (first 200 chars): ' + jsonParam.substring(0, 200));
                break;
              }
            } catch (e) {
              log.debug('getInputData', 'Parameter ' + paramNames[j] + ' not found in executionContext: ' + e.toString());
            }
          }
        } catch (e) {
          log.error('getInputData', 'Error accessing executionContext: ' + e.toString());
        }
      } else {
        log.debug('getInputData', 'No executionContext available in inputContext');
      }
      
      // Fallback: try runtime.getCurrentScript() (for manual/deployment parameter calls)
      if (!jsonParam) {
        try {
          var scriptObj = runtime.getCurrentScript();
          var scriptId = scriptObj.id;
          log.debug('getInputData', 'Script ID: ' + scriptId);
          
          for (var i = 0; i < paramNames.length && !jsonParam; i++) {
            try {
              jsonParam = scriptObj.getParameter({ name: paramNames[i] });
              if (jsonParam) {
                log.debug('getInputData', 'Found parameter with name: ' + paramNames[i]);
                break;
              }
            } catch (e) {
              log.debug('getInputData', 'Parameter ' + paramNames[i] + ' not found: ' + e.toString());
            }
          }
          
          // Try to get all parameters for debugging (but need to specify name)
          if (!jsonParam) {
            log.debug('getInputData', 'Trying to enumerate all parameters...');
            // Try common parameter field IDs without the custscript_ prefix
            var fieldIds = ['json', 'pallet_assignment_json', 'assignment_json'];
            for (var f = 0; f < fieldIds.length; f++) {
              try {
                var testParamName = 'custscript_' + scriptId.replace('customscript_', '') + '_' + fieldIds[f];
                log.debug('getInputData', 'Trying parameter name: ' + testParamName);
                var testParam = scriptObj.getParameter({ name: testParamName });
                if (testParam) {
                  jsonParam = testParam;
                  log.debug('getInputData', 'Found parameter with constructed name: ' + testParamName);
                  break;
                }
              } catch (e) {
                // Continue
              }
            }
          }
        } catch (e) {
          log.debug('getInputData', 'Could not get script object: ' + e.toString());
        }
      }
      
      if (!jsonParam) {
        log.error('getInputData', 'No pallet assignment JSON parameter found. Tried parameter names: ' + paramNames.join(', '));
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
      // When called via task.create(), parameters are accessed through executionContext
      var jsonParam = null;
      var paramNames = [
        'custscriptjson',
        'custscript_assign_packages_to_pallets_json',
        'custscript_assign_packages_to_pallets_pallet_assignment_json',
        'custscript_pallet_assignment_json'
      ];
      
      // Try executionContext first (for task.create() calls)
      var executionContext = mapContext.executionContext;
      if (executionContext) {
        for (var j = 0; j < paramNames.length && !jsonParam; j++) {
          try {
            jsonParam = executionContext.getParameter({ name: paramNames[j] });
            if (jsonParam) {
              log.debug('map', 'Found parameter in executionContext with name: ' + paramNames[j]);
              break;
            }
          } catch (e) {
            // Continue trying
          }
        }
      }
      
      // Fallback: try runtime.getCurrentScript()
      if (!jsonParam) {
        try {
          var scriptObj = runtime.getCurrentScript();
          for (var i = 0; i < paramNames.length && !jsonParam; i++) {
            try {
              jsonParam = scriptObj.getParameter({ name: paramNames[i] });
              if (jsonParam) {
                log.debug('map', 'Found parameter with name: ' + paramNames[i]);
                break;
              }
            } catch (e) {
              // Continue trying
            }
          }
        } catch (e) {
          log.debug('map', 'Could not get script object: ' + e.toString());
        }
      }
      
      if (!jsonParam) {
        log.error('map', 'No pallet assignment JSON parameter found. Tried: ' + paramNames.join(', '));
        return;
      }
      
      var assignmentData = JSON.parse(jsonParam);
      var ifId = assignmentData.ifId;
      var ifTranId = assignmentData.ifTranId || ifId;
      var palletAssignments = assignmentData.palletAssignments || [];
      var batchNumber = assignmentData.batchNumber || 1;
      var totalBatches = assignmentData.totalBatches || 1;
      var itemVpnMap = assignmentData.itemVpnMap || {};  // Get VPN map from assignment data
      
      log.debug('map', 'IF ' + ifTranId + ' - Processing batch ' + batchNumber + ' of ' + totalBatches + ' with ' + palletAssignments.length + ' pallet assignment(s)');
      log.debug('map', 'VPN Map received with ' + Object.keys(itemVpnMap).length + ' item(s)');
      
      // Emit each pallet assignment
      for (var i = 0; i < palletAssignments.length; i++) {
        var assignment = palletAssignments[i];
        
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
          tranId: ifTranId,
          palletIndex: i,
          palletId: assignment.palletId,
          packageIds: assignment.packageIds || [],
          contentIds: assignment.contentIds || [],
          items: itemsWithVpn,  // Array of {itemId, quantity, cartons, vpn}
          totalCartons: assignment.totalCartons || 0,  // Total carton count for this pallet
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
        var palletIndex = assignment.palletIndex + 1; // 1-based index
        
        try {
          // Create pallet if not already created
          if (!palletId) {
            try {
              var palletRecord = record.create({
                type: PALLET_RECORD_TYPE
              });
              
              var palletName = 'Pallet ' + palletIndex + ' - IF ' + tranId;
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
              log.debug('reduce', 'IF ' + tranId + ' - Created pallet ' + palletId + ' (index ' + palletIndex + ')');
              
            } catch (createError) {
              var errorMsg = 'IF ' + tranId + ' - Failed to create pallet ' + (assignment.palletIndex + 1) + ': ' + createError.toString();
              log.error('reduce', errorMsg);
              errors.push(errorMsg);
              continue; // Skip this pallet assignment
            }
          } else {
            log.debug('reduce', 'IF ' + tranId + ' - Using existing pallet ' + palletId);
          }
          
          // Create JSON for pallet with items (including VPN) and total cartons
          var palletJson = {
            items: assignment.items || [],  // Items already have VPN from map phase
            totalCartons: assignment.totalCartons || 0
          };
          var palletJsonString = JSON.stringify(palletJson);
          
          // Update pallet with JSON data in custrecord17
          try {
            record.submitFields({
              type: PALLET_RECORD_TYPE,
              id: palletId,
              values: {
                custrecord17: palletJsonString
              },
              options: {
                enableSourcing: false,
                ignoreMandatoryFields: true
              }
            });
            log.debug('reduce', 'IF ' + tranId + ' - Updated pallet ' + palletId + ' with JSON data');
          } catch (jsonError) {
            var errorMsg = 'IF ' + tranId + ' - Failed to update pallet JSON field ' + palletId + ': ' + jsonError.toString();
            log.error('reduce', errorMsg);
            errors.push(errorMsg);
            // Continue processing - don't fail the whole pallet
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
      if (output && typeof output.iterator === 'function') {
        try {
          var outputIterator = output.iterator();
          var outputCount = 0;
          while (outputIterator.hasNext()) {
            var outputData = outputIterator.next();
            outputCount++;
          }
          log.audit('summarize', 'Total output records: ' + outputCount);
        } catch (outputError) {
          log.debug('summarize', 'Could not iterate output: ' + outputError.toString());
        }
      } else {
        log.debug('summarize', 'No output iterator available');
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

