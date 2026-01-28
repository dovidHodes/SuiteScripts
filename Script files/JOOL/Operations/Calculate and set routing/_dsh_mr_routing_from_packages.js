/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @description Map/Reduce script to calculate and apply routing fields from SPS packages
 * 
 * This script runs AFTER autopack has completed (SPS packages exist) and calculates
 * routing fields (cartons, volume, weight, pallets) from REAL SPS packages instead of
 * simulated cartons. Sets routing status to 1 when successful.
 * 
 * Search criteria for eligible IFs:
 * - entity = 1716 (AVC)
 * - custbody_requested_autopack = true
 * - custbody_sps_package_notes contains "created"
 * - custbody_routing_status is empty (not yet processed)
 */

define([
  'N/search',
  'N/log',
  'N/record',
  './_dsh_lib_routing_calculator'
], function (search, log, record, routingLib) {
  
  /**
   * Defines the function that is executed at the beginning of the map/reduce process
   * Returns a search for eligible Item Fulfillments
   */
  function getInputData(inputContext) {
    log.audit('getInputData', 'Starting search for IFs needing routing from packages');
    log.debug('getInputData', 'Search criteria:');
    log.debug('getInputData', '  - entity = 1716');
    log.debug('getInputData', '  - custbody_requested_autopack = true');
    log.debug('getInputData', '  - custbody_sps_package_notes contains "created"');
    log.debug('getInputData', '  - custbody_routing_status is empty (not yet processed)');
    
    // Search for Item Fulfillments that:
    // - Are for entity 1716 (AVC)
    // - Have custbody_requested_autopack = true (autopack has been requested)
    // - Have custbody_sps_package_notes containing "created" (autopack completed)
    // - Have custbody_routing_status empty (not yet processed - avoids reprocessing any status)
    var ifSearch = search.create({
      type: search.Type.ITEM_FULFILLMENT,
      filters: [
        ['mainline', 'is', 'T'],
        'AND',
        ['entity', 'anyof', '1716'],
        'AND',
        ['custbody_requested_autopack', 'is', 'T'],
        'AND',
        ['custbody_sps_package_notes', 'contains', 'created'],
        'AND',
        ['custbody_routing_status', 'anyof', '@NONE@']  // Only process if status is empty
      ],
      columns: [
        search.createColumn({ name: 'internalid' }),
        search.createColumn({ name: 'tranid' }),
        search.createColumn({ name: 'entity' }),
        search.createColumn({ name: 'custbody_routing_status' }),
        search.createColumn({ name: 'custbody_sps_package_notes' })
      ]
    });
    
    // Log count for debugging
    try {
      var resultCount = ifSearch.runPaged().count;
      log.audit('getInputData', 'Found ' + resultCount + ' IF(s) eligible for routing from packages');
      
      if (resultCount > 0) {
        // Log first few results for debugging
        var pagedData = ifSearch.runPaged({ pageSize: 10 });
        if (pagedData.pageRanges.length > 0) {
          var firstPage = pagedData.fetch({ index: 0 });
          log.debug('getInputData', 'Sample results (first 10):');
          firstPage.data.forEach(function(result) {
            var tranId = result.getValue('tranid');
            var routingStatus = result.getValue('custbody_routing_status');
            log.debug('getInputData', '  IF ID: ' + result.id + ', TranID: ' + tranId + ', Routing Status: ' + routingStatus);
          });
        }
      } else {
        log.debug('getInputData', 'No IFs found matching criteria');
      }
    } catch (e) {
      log.error('getInputData', 'Error running search count: ' + e.toString());
    }
    
    return ifSearch;
  }
  
  /**
   * Defines the function that is executed when the map entry point is triggered
   * Processes each IF: calls the routing library to calculate and apply fields from packages
   */
  function map(mapContext) {
    var ifId = null;
    var ifTranId = null;
    
    try {
      var searchResult = JSON.parse(mapContext.value);
      ifId = searchResult.id;
      
      // Extract tranId from search result
      if (searchResult.values && searchResult.values.tranid) {
        ifTranId = searchResult.values.tranid;
      }
      
      log.debug('map', 'Processing IF: ' + (ifTranId || ifId));
      
      // Call the routing library to calculate and apply routing fields from packages
      var result = routingLib.calculateAndApplyRoutingFields(ifId);
      
      if (result.success) {
        log.audit('map', 'Successfully calculated routing for IF ' + (ifTranId || ifId) + ': ' + result.message);
        
        mapContext.write({
          key: ifId,
          value: {
            ifId: ifId,
            ifTranId: ifTranId,
            success: true,
            message: result.message
          }
        });
      } else {
        log.error('map', 'Failed to calculate routing for IF ' + (ifTranId || ifId) + ': ' + result.message);
        
        mapContext.write({
          key: ifId,
          value: {
            ifId: ifId,
            ifTranId: ifTranId,
            success: false,
            error: result.message
          }
        });
      }
      
    } catch (e) {
      log.error('map', 'Error processing IF ' + (ifTranId || ifId || 'unknown') + ': ' + e.toString());
      log.error('map', 'Stack trace: ' + (e.stack || 'N/A'));
      
      if (ifId) {
        mapContext.write({
          key: ifId,
          value: {
            ifId: ifId,
            ifTranId: ifTranId,
            success: false,
            error: e.toString()
          }
        });
      }
    }
  }
  
  /**
   * Defines the function that is executed when the reduce entry point is triggered
   * Pass-through for summary
   */
  function reduce(reduceContext) {
    try {
      // Just pass through the data for summarize
      var values = reduceContext.values;
      
      for (var i = 0; i < values.length; i++) {
        var data = JSON.parse(values[i]);
        reduceContext.write({
          key: reduceContext.key,
          value: data
        });
      }
      
    } catch (e) {
      log.error('reduce', 'Error in reduce: ' + e.toString());
    }
  }
  
  /**
   * Defines the function that is executed when the summarize entry point is triggered
   * Logs final results
   */
  function summarize(summaryContext) {
    log.audit('summarize', 'Map/Reduce script execution completed');
    
    var successCount = 0;
    var failureCount = 0;
    var processedIFs = [];
    var failedIFs = [];
    
    // Process output
    summaryContext.output.iterator().each(function(key, value) {
      try {
        var data = JSON.parse(value);
        
        if (data.success) {
          successCount++;
          processedIFs.push(data.ifTranId || data.ifId);
        } else {
          failureCount++;
          failedIFs.push({
            id: data.ifTranId || data.ifId,
            error: data.error
          });
        }
      } catch (e) {
        log.error('summarize', 'Error parsing output: ' + e.toString());
        failureCount++;
      }
      
      return true;
    });
    
    // Log map errors
    summaryContext.mapSummary.errors.iterator().each(function(key, error) {
      log.error('summarize', 'Map error for key ' + key + ': ' + error);
      failureCount++;
      return true;
    });
    
    // Log reduce errors
    summaryContext.reduceSummary.errors.iterator().each(function(key, error) {
      log.error('summarize', 'Reduce error for key ' + key + ': ' + error);
      return true;
    });
    
    log.audit('summarize', '=== FINAL SUMMARY ===');
    log.audit('summarize', 'Total IFs Processed: ' + (successCount + failureCount));
    log.audit('summarize', 'Successful: ' + successCount);
    log.audit('summarize', 'Failed: ' + failureCount);
    
    if (processedIFs.length > 0) {
      log.audit('summarize', 'Successfully processed IFs: ' + processedIFs.join(', '));
    }
    
    if (failedIFs.length > 0) {
      log.audit('summarize', 'Failed IFs:');
      failedIFs.forEach(function(item) {
        log.audit('summarize', '  - ' + item.id + ': ' + item.error);
      });
    }
  }
  
  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize
  };
});
