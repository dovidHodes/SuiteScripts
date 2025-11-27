/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 * Map/Reduce script to automatically generate and attach BOLs for Item Fulfillment records
 * where the customer has custentity_generate_and_attach_bols = true and the SCAC code
 * is not in the customer's custentity_dont_generate_bols multi-select field.
 * 
 * Process:
 * 1. Search for Item Fulfillment records where entity has custentity_generate_and_attach_bols = true
 * 2. For each IF, get SCAC from custbody_sps_carrieralphacode
 * 3. Check if SCAC is NOT in customer's custentity_dont_generate_bols field (checking text values)
 * 4. If conditions are met, call library code to generate and attach BOL
 */

define([
  'N/search',
  'N/record',
  'N/log',
  './_dsh_lib_bol_generator'
], function (search, record, log, bolLib) {
  
  /**
   * Gets input data - searches for Item Fulfillment records where
   * the customer has custentity_generate_and_attach_bols = true
   * @param {Object} inputContext
   * @returns {Object} Search object with IF IDs
   */
  function getInputData(inputContext) {
    try {
      // First, search for customers where custentity_generate_and_attach_bols = true
      var entityIds = [];
      try {
        var entitySearch = search.create({
          type: 'customer',
          filters: [
            ['custentity_generate_and_attach_bols', 'is', 'T']
          ],
          columns: [
            search.createColumn({ name: 'internalid' })
          ]
        });
        
        var entitySearchResults = entitySearch.run();
        entitySearchResults.each(function(result) {
          entityIds.push(result.id);
          return true;
        });
      } catch (e) {
        log.error('getInputData', 'Error searching for customers: ' + e.toString());
        return search.create({
          type: 'itemfulfillment',
          filters: [['internalid', 'none', '@NONE@']]
        });
      }
      
      if (entityIds.length === 0) {
        log.audit('getInputData', 'No customers found with custentity_generate_and_attach_bols = true');
        return search.create({
          type: 'itemfulfillment',
          filters: [['internalid', 'none', '@NONE@']]
        });
      }
      
      // Search for Item Fulfillment records with the required criteria
      var ifSearch = search.create({
        type: 'itemfulfillment',
        filters: [
          ['entity', 'anyof', entityIds],
          'AND',
          ['custbody_requested_bol', 'is', 'F'],
          'AND',
          ['custbody_routing_status', 'is', 3]
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'tranid' }),
          search.createColumn({ name: 'entity' }),
          search.createColumn({ name: 'custbody_sps_carrieralphacode' })
        ]
      });
      
      log.audit('getInputData', 'Found ' + entityIds.length + ' customer(s), created IF search');
      return ifSearch;
      
    } catch (e) {
      log.error('getInputData', 'Error creating search: ' + e.toString());
      throw e;
    }
  }
  
  /**
   * Map function - processes each IF record
   * Checks if SCAC is in the customer's exclusion list
   * @param {Object} mapContext
   */
  function map(mapContext) {
    try {
      var searchResult = JSON.parse(mapContext.value);
      var ifId = searchResult.id;
      
      // Extract values from search result
      // Search result values are objects with 'value' and 'text' properties, or just values
      var entityId = null;
      var scac = '';
      var tranId = ifId;
      
      if (searchResult.values) {
        if (searchResult.values.entity) {
          entityId = searchResult.values.entity.value || searchResult.values.entity;
        }
        
        // custbody_sps_carrieralphacode is a text field - returns value directly as string
        if (searchResult.values.custbody_sps_carrieralphacode) {
          scac = searchResult.values.custbody_sps_carrieralphacode || '';
        }
        
        if (searchResult.values.tranid) {
          tranId = searchResult.values.tranid.value || 
                   searchResult.values.tranid || ifId;
        }
      }
      
      // If no SCAC or entity, skip this IF
      if (!scac || scac === '' || !entityId) {
        return;
      }
      
      // Load customer record to check exclusion list
      try {
        var customerRecord = record.load({
          type: 'customer',
          id: entityId,
          isDynamic: false
        });
        
        // Get the multi-select field text values
        var dontGenerateBOLsText = '';
        try {
          var textValue = customerRecord.getText({
            fieldId: 'custentity_dont_generate_bols'
          });
          dontGenerateBOLsText = (textValue ? String(textValue) : '') || '';
        } catch (textError) {
          dontGenerateBOLsText = '';
        }
        
        // Check if SCAC is in the exclusion list
        if (dontGenerateBOLsText && typeof dontGenerateBOLsText === 'string' && dontGenerateBOLsText.trim() !== '') {
          var exclusionList = dontGenerateBOLsText.split(',').map(function(item) {
            return item.trim();
          });
          
          log.debug('map', 'TranID: ' + tranId + ' - Comparing SCAC "' + scac + '" against exclusion list: ' + exclusionList.join(', '));
          
          var scacInExclusionList = false;
          for (var i = 0; i < exclusionList.length; i++) {
            if (exclusionList[i].toUpperCase() === scac.toUpperCase()) {
              scacInExclusionList = true;
              log.debug('map', 'TranID: ' + tranId + ' - Match found: SCAC "' + scac + '" is in exclusion list');
              break;
            }
          }
          
          if (scacInExclusionList) {
            log.debug('map', 'TranID: ' + tranId + ' - Skipping: SCAC "' + scac + '" in exclusion list');
            return;
          } else {
            log.debug('map', 'TranID: ' + tranId + ' - SCAC "' + scac + '" not in exclusion list, proceeding');
          }
        } else {
          log.debug('map', 'TranID: ' + tranId + ' - No exclusion list found, proceeding');
        }
        
        // All checks passed - write to reduce for processing
        mapContext.write(ifId, {
          ifId: ifId,
          tranId: tranId,
          entityId: entityId,
          scac: scac
        });
        
      } catch (customerError) {
        log.error('map', 'TranID: ' + tranId + ' - Error loading customer record: ' + customerError.toString());
        return;
      }
      
    } catch (e) {
      log.error('map', 'Error in map function: ' + e.toString());
    }
  }
  
  /**
   * Reduce function - generates and attaches BOL for each IF
   * @param {Object} reduceContext
   */
  function reduce(reduceContext) {
    try {
      // Get IF data from the first value (all values should be the same for the same IF ID)
      var ifData = JSON.parse(reduceContext.values[0]);
      var ifId = ifData.ifId;
      var tranId = ifData.tranId;
      
      // Check if this IF has already been processed (prevent duplicate processing)
      try {
        var ifRecord = record.load({
          type: 'itemfulfillment',
          id: ifId,
          isDynamic: false
        });
        if (ifRecord.getValue('custbody_requested_bol')) {
          log.debug('reduce', 'TranID: ' + tranId + ' - Already processed, skipping');
          return;
        }
      } catch (checkError) {
        // Continue processing if we can't check
      }
      
      // Call library function to generate and attach BOL
      log.audit('reduce', 'TranID: ' + tranId + ' - Generating BOL for IF (ID: ' + ifId + ')');
      var result = bolLib.generateAndAttachBOL(ifId, null, null);
      
      if (result.success) {
        log.audit('reduce', 'TranID: ' + tranId + ' - BOL generated successfully. File ID: ' + result.fileId);
        
        // Set custbody_requested_bol to true after successful BOL generation
        try {
          record.submitFields({
            type: 'itemfulfillment',
            id: ifId,
            values: { custbody_requested_bol: true },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          
          // Verify the checkbox was actually set
          try {
            var verifyRecord = record.load({
              type: 'itemfulfillment',
              id: ifId,
              isDynamic: false
            });
            if (!verifyRecord.getValue('custbody_requested_bol')) {
              log.error('reduce', 'TranID: ' + tranId + ' - WARNING: custbody_requested_bol still false after setting!');
            }
          } catch (verifyError) {
            // Verification failed, but field was set
          }
        } catch (fieldError) {
          log.error('reduce', 'TranID: ' + tranId + ' - Error setting custbody_requested_bol: ' + fieldError.toString());
        }
      } else {
        log.error('reduce', 'TranID: ' + tranId + ' - BOL generation failed: ' + (result.error || 'Unknown error'));
      }
      
    } catch (e) {
      log.error('reduce', 'Error in reduce function for IF ID ' + ifId + ': ' + e.toString());
    }
  }
  
  /**
   * Summarize function - logs final results
   * @param {Object} summaryContext
   */
  function summarize(summaryContext) {
    log.audit('summarize', 'Map/Reduce script completed - Usage: ' + summaryContext.usage + ', Yields: ' + summaryContext.yields);
    
    if (summaryContext.mapSummary && summaryContext.mapSummary.errors) {
      var mapErrors = summaryContext.mapSummary.errors;
      if (Array.isArray(mapErrors)) {
        log.audit('summarize', 'Map errors: ' + mapErrors.length);
        mapErrors.forEach(function(error, index) {
          log.error('summarize', 'Map error ' + (index + 1) + ': ' + (error.toString ? error.toString() : JSON.stringify(error)));
        });
      } else {
        log.audit('summarize', 'Map errors: ' + (typeof mapErrors === 'object' ? JSON.stringify(mapErrors) : mapErrors));
      }
    } else {
      log.audit('summarize', 'Map errors: 0');
    }
    
    if (summaryContext.reduceSummary && summaryContext.reduceSummary.errors) {
      var reduceErrors = summaryContext.reduceSummary.errors;
      if (Array.isArray(reduceErrors)) {
        log.audit('summarize', 'Reduce errors: ' + reduceErrors.length);
        reduceErrors.forEach(function(error, index) {
          log.error('summarize', 'Reduce error ' + (index + 1) + ': ' + (error.toString ? error.toString() : JSON.stringify(error)));
        });
      } else {
        log.audit('summarize', 'Reduce errors: ' + (typeof reduceErrors === 'object' ? JSON.stringify(reduceErrors) : reduceErrors));
      }
    } else {
      log.audit('summarize', 'Reduce errors: 0');
    }
  }
  
  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize
  };
});

