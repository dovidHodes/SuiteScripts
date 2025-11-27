/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 * Map/Reduce script to create integrated shipping labels from SPS packages.
 * 
 * This script:
 * - Receives IF IDs from Scheduled Script (or can search if called directly)
 * - Calls library function to process each IF
 * - Sets custbody_requested_integrated_packages = true after successful processing
 * 
 * Process:
 * 1. getInputData: Gets IF IDs from parameters (from SCH) or returns empty search if called directly
 * 2. map: Passes IF IDs to reduce stage
 * 3. reduce: Calls library function for each IF
 * 4. summarize: Logs completion stats and errors
 */

define([
  'N/search',
  'N/record',
  'N/log',
  './_dsh_lib_integrated_shipping_labels'
], function (search, record, log, integratedLabelsLib) {
  
  /**
   * Gets input data - receives IF IDs from SCH script parameters
   * @param {Object} inputContext
   * @returns {Object} Search object with IF IDs
   */
  function getInputData(inputContext) {
    try {
      // Get parameters from execution context
      var executionContext = inputContext.executionContext;
      var jsonParam = executionContext.getParameter({
        name: 'custscript_dsh_mr_integrated_labels_json'
      });
      
      if (jsonParam) {
        // Called from SCH - use provided IF IDs
        try {
          var ifData = JSON.parse(jsonParam);
          var ifIds = ifData.itemFulfillmentIds || [];
          
          if (ifIds.length === 0) {
            log.audit('getInputData', 'No IF IDs provided in parameters');
            return search.create({
              type: 'itemfulfillment',
              filters: [['internalid', 'none', '@NONE@']]
            });
          }
          
          log.audit('getInputData', 'Received ' + ifIds.length + ' IF ID(s) from scheduled script');
          
          // Create search with provided IF IDs
          return search.create({
            type: 'itemfulfillment',
            filters: [
              ['internalid', 'anyof', ifIds]
            ],
            columns: [
              search.createColumn({ name: 'internalid' }),
              search.createColumn({ name: 'tranid' })
            ]
          });
          
        } catch (parseError) {
          log.error('getInputData', 'Error parsing JSON parameter: ' + parseError.toString());
          return search.create({
            type: 'itemfulfillment',
            filters: [['internalid', 'none', '@NONE@']]
          });
        }
      } else {
        // Called directly (manual) - return empty search
        // Note: If you want MR to search for IFs directly, uncomment and customize:
        /*
        return search.create({
          type: 'itemfulfillment',
          filters: [
            ['custbody_requested_integrated_packages', 'is', 'F'],
            // Add other filters as needed
          ],
          columns: [
            search.createColumn({ name: 'internalid' }),
            search.createColumn({ name: 'tranid' })
          ]
        });
        */
        log.audit('getInputData', 'No parameters provided - returning empty search (MR should be called from SCH)');
        return search.create({
          type: 'itemfulfillment',
          filters: [['internalid', 'none', '@NONE@']]
        });
      }
      
    } catch (e) {
      log.error('getInputData', 'Error creating search: ' + e.toString());
      throw e;
    }
  }
  
  /**
   * Map function - processes each IF record
   * @param {Object} mapContext
   */
  function map(mapContext) {
    try {
      var searchResult = JSON.parse(mapContext.value);
      var ifId = searchResult.id;
      var tranId = searchResult.values ? (searchResult.values.tranid || ifId) : ifId;
      
      log.debug('map', 'Processing IF: ' + tranId + ' (ID: ' + ifId + ')');
      
      // Emit the IF ID for processing
      mapContext.write({
        key: ifId,
        value: {
          ifId: ifId,
          tranId: tranId
        }
      });
      
    } catch (e) {
      log.error('map', 'Error processing record: ' + e.toString());
    }
  }
  
  /**
   * Reduce function - calls library to create integrated shipping labels
   * @param {Object} reduceContext
   */
  function reduce(reduceContext) {
    try {
      var ifData = JSON.parse(reduceContext.values[0]);
      var ifId = ifData.ifId;
      var tranId = ifData.tranId || ifId;
      
      log.debug('reduce', 'Creating integrated shipping labels for IF: ' + tranId + ' (ID: ' + ifId + ')');
      
      // Call library function to do the heavy lifting
      var result = integratedLabelsLib.createIntegratedShippingLabels(ifId);
      
      if (result.success) {
        log.audit('reduce', 'TranID: ' + tranId + ' - Successfully created ' + result.packagesCreated + ' package line(s)');
        
        // Set custbody_requested_integrated_packages = true after successful processing
        // Note: This field is already set to true by SCH when scheduling, but we verify/set it here
        // to ensure it's marked as complete after library processing succeeds
        try {
          // Check current value first
          var ifRecord = record.load({
            type: 'itemfulfillment',
            id: ifId,
            isDynamic: false
          });
          
          var currentValue = ifRecord.getValue('custbody_requested_integrated_packages');
          if (currentValue !== true && currentValue !== 'T') {
            // Field might have been reset or not set - set it now
            record.submitFields({
              type: 'itemfulfillment',
              id: ifId,
              values: {
                custbody_requested_integrated_packages: true
              },
              options: {
                enableSourcing: false,
                ignoreMandatoryFields: true
              }
            });
            log.debug('reduce', 'TranID: ' + tranId + ' - Set requested_integrated_packages = true after successful processing');
          } else {
            log.debug('reduce', 'TranID: ' + tranId + ' - Field already set to true');
          }
        } catch (fieldError) {
          log.error('reduce', 'TranID: ' + tranId + ' - Error setting requested_integrated_packages field: ' + fieldError.toString());
          // Don't fail the whole process if field update fails
        }
        
      } else {
        log.error('reduce', 'TranID: ' + tranId + ' - Failed to create integrated shipping labels: ' + (result.error || 'Unknown error'));
        
        // Reset the field so it can be retried
        try {
          record.submitFields({
            type: 'itemfulfillment',
            id: ifId,
            values: {
              custbody_requested_integrated_packages: false
            },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          log.debug('reduce', 'TranID: ' + tranId + ' - Reset requested_integrated_packages = false for retry');
        } catch (resetError) {
          log.error('reduce', 'TranID: ' + tranId + ' - Error resetting field: ' + resetError.toString());
        }
      }
      
    } catch (e) {
      log.error('reduce', 'Error in reduce function for IF ID ' + ifId + ': ' + e.toString());
      log.error('reduce', 'Stack trace: ' + (e.stack || 'N/A'));
    }
  }
  
  /**
   * Summarize function - logs final results
   * @param {Object} summaryContext
   */
  function summarize(summaryContext) {
    try {
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
      
    } catch (e) {
      log.error('summarize', 'Error in summary: ' + e.toString());
    }
  }
  
  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize
  };
  
});

