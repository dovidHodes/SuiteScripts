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
      log.audit('getInputData', 'Starting search for Item Fulfillment records');
      
      // Search for Item Fulfillment records where:
      // - entity.custentity_generate_and_attach_bols = true
      // - custbody_requested_bol = false
      var ifSearch = search.create({
        type: 'itemfulfillment',
        filters: [
          ['entity.custentity_generate_and_attach_bols', 'is', 'T'],
          'AND',
          ['custbody_requested_bol', 'is', 'F']
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'tranid' }),
          search.createColumn({ name: 'entity' }),
          search.createColumn({ name: 'custbody_sps_carrieralphacode' })
        ]
      });
      
      log.audit('getInputData', 'Search created, returning search object');
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
      
      log.debug('map', 'TranID: ' + tranId + ' - Processing IF (ID: ' + ifId + '), Entity: ' + entityId + ', SCAC: ' + scac);
      
      // If no SCAC, skip this IF
      if (!scac || scac === '') {
        log.debug('map', 'TranID: ' + tranId + ' - Skipping IF: no SCAC code');
        return;
      }
      
      // If no entity, skip this IF
      if (!entityId) {
        log.debug('map', 'TranID: ' + tranId + ' - Skipping IF: no entity');
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
        // getText() returns a comma-separated string of text values for multi-select fields
        var dontGenerateBOLsText = '';
        try {
          dontGenerateBOLsText = customerRecord.getText({
            fieldId: 'custentity_dont_generate_bols'
          }) || '';
        } catch (textError) {
          log.debug('map', 'TranID: ' + tranId + ' - Error getting exclusion list text: ' + textError.toString());
        }
        
        log.debug('map', 'TranID: ' + tranId + ' - Customer exclusion list: ' + (dontGenerateBOLsText || 'empty'));
        
        // Check if SCAC is in the exclusion list
        // getText() returns a comma-separated string of text values for multi-select fields
        if (dontGenerateBOLsText && dontGenerateBOLsText.trim() !== '') {
          // Split by comma and clean up each item
          var exclusionList = dontGenerateBOLsText.split(',').map(function(item) {
            return item.trim();
          });
          
          // Check if SCAC is in the exclusion list (case-insensitive comparison)
          var scacInExclusionList = false;
          for (var i = 0; i < exclusionList.length; i++) {
            if (exclusionList[i].toUpperCase() === scac.toUpperCase()) {
              scacInExclusionList = true;
              break;
            }
          }
          
          if (scacInExclusionList) {
            log.debug('map', 'TranID: ' + tranId + ' - Skipping IF: SCAC "' + scac + '" is in exclusion list');
            return;
          }
        }
        
        // All checks passed - write to reduce for processing
        log.debug('map', 'TranID: ' + tranId + ' - IF passed all checks, writing to reduce');
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
      
      log.audit('reduce', 'TranID: ' + tranId + ' - Starting BOL generation for IF (ID: ' + ifId + ')');
      
      // Call library function to generate and attach BOL
      // Library will use default folder ID (1373) and template ID (CUSTTMPL_DSH_SVC_BOL)
      var result = bolLib.generateAndAttachBOL(ifId, null, null);
      
      if (result.success) {
        log.audit('reduce', 'TranID: ' + tranId + ' - BOL generated and attached successfully. File ID: ' + result.fileId);
        
        // Set custbody_requested_bol to true after successful BOL generation
        try {
          record.submitFields({
            type: 'itemfulfillment',
            id: ifId,
            values: {
              custbody_requested_bol: true
            },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          log.debug('reduce', 'TranID: ' + tranId + ' - Set custbody_requested_bol to true');
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
    log.audit('summarize', 'Map/Reduce script completed');
    log.audit('summarize', 'Usage: ' + summaryContext.usage);
    log.audit('summarize', 'Yields: ' + summaryContext.yields);
    
    if (summaryContext.output) {
      log.audit('summarize', 'Output stage completed');
    }
    
    if (summaryContext.mapSummary) {
      log.audit('summarize', 'Map errors: ' + (summaryContext.mapSummary.errors || 0));
    }
    
    if (summaryContext.reduceSummary) {
      log.audit('summarize', 'Reduce errors: ' + (summaryContext.reduceSummary.errors || 0));
    }
  }
  
  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize
  };
});

