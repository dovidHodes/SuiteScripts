/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 * Map/Reduce script to add packages to the package sublist on Item Fulfillment records.
 * 
 * This script demonstrates how to programmatically add packages with weight and dimensions
 * to Item Fulfillment records. The package sublist fields that can be set include:
 * - packageweight: Package weight in the unit of measure configured in NetSuite
 * - packagelength: Package length
 * - packagewidth: Package width  
 * - packageheight: Package height
 * 
 * Note: These fields may not be visible in the UI but can be set programmatically.
 * 
 * Process:
 * 1. Search for Item Fulfillment records (customize filters as needed)
 * 2. For each IF, add packages to the package sublist with weight and dimensions
 * 3. Save the record
 */

define([
  'N/search',
  'N/record',
  'N/log'
], function (search, record, log) {
  
  /**
   * Gets input data - searches for Item Fulfillment records
   * Customize the search filters based on your requirements
   * @param {Object} inputContext
   * @returns {Object} Search object with IF IDs
   */
  function getInputData(inputContext) {
    try {
      // Example: Search for Item Fulfillment records
      // Customize filters based on your needs
      var ifSearch = search.create({
        type: 'itemfulfillment',
        filters: [
          // Add your filters here
          // Example: ['status', 'anyof', ['Fulfilled', 'Partially Fulfilled']]
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'tranid' })
        ]
      });
      
      log.audit('getInputData', 'Created Item Fulfillment search');
      return ifSearch;
      
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
      var tranId = searchResult.values.tranid;
      
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
   * Reduce function - adds packages to each IF
   * @param {Object} reduceContext
   */
  function reduce(reduceContext) {
    try {
      var ifData = JSON.parse(reduceContext.values[0]);
      var ifId = ifData.ifId;
      var tranId = ifData.tranId;
      
      log.debug('reduce', 'Adding packages to IF: ' + tranId + ' (ID: ' + ifId + ')');
      
      // Load the Item Fulfillment record
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: true
      });
      
      // Get current package count
      var currentPackageCount = ifRecord.getLineCount({
        sublistId: 'package'
      });
      
      log.debug('reduce', 'Current package count: ' + currentPackageCount);
      
      // Example: Add a new package
      // You can customize this to add multiple packages or get package data from another source
      var packageData = {
        weight: 10.5,      // Weight in pounds (or your configured unit)
        length: 12,        // Length in inches (or your configured unit)
        width: 8,          // Width in inches
        height: 6          // Height in inches
      };
      
      // Insert a new line in the package sublist
      var lineIndex = currentPackageCount;
      ifRecord.insertLine({
        sublistId: 'package',
        line: lineIndex
      });
      
      // Set package weight
      ifRecord.setSublistValue({
        sublistId: 'package',
        fieldId: 'packageweight',
        line: lineIndex,
        value: packageData.weight
      });
      
      // Set package dimensions
      // Note: These fields may not be visible in UI but can be set programmatically
      ifRecord.setSublistValue({
        sublistId: 'package',
        fieldId: 'packagelength',
        line: lineIndex,
        value: packageData.length
      });
      
      ifRecord.setSublistValue({
        sublistId: 'package',
        fieldId: 'packagewidth',
        line: lineIndex,
        value: packageData.width
      });
      
      ifRecord.setSublistValue({
        sublistId: 'package',
        fieldId: 'packageheight',
        line: lineIndex,
        value: packageData.height
      });
      
      // Optional: Set package type if you have package types configured
      // ifRecord.setSublistValue({
      //   sublistId: 'package',
      //   fieldId: 'packagetype',
      //   line: lineIndex,
      //   value: packageTypeId  // Internal ID of package type
      // });
      
      // Save the record
      try {
        ifRecord.save({
          enableSourcing: false,
          ignoreMandatoryFields: false
        });
        
        log.audit('reduce', 'Successfully added package to IF: ' + tranId + 
                  ' - Weight: ' + packageData.weight + 
                  ', Dimensions: ' + packageData.length + 'x' + packageData.width + 'x' + packageData.height);
        
      } catch (saveError) {
        log.error('reduce', 'Error saving IF ' + tranId + ': ' + saveError.toString());
        throw saveError;
      }
      
    } catch (e) {
      log.error('reduce', 'Error processing package addition: ' + e.toString());
    }
  }
  
  /**
   * Summary function - logs summary information
   * @param {Object} summaryContext
   */
  function summarize(summaryContext) {
    try {
      var mapErrors = summaryContext.mapSummary.errors;
      var reduceErrors = summaryContext.reduceSummary.errors;
      
      log.audit('summarize', 'Map errors: ' + mapErrors.length);
      log.audit('summarize', 'Reduce errors: ' + reduceErrors.length);
      
      if (mapErrors.length > 0) {
        mapErrors.forEach(function(error) {
          log.error('summarize - Map Error', error);
        });
      }
      
      if (reduceErrors.length > 0) {
        reduceErrors.forEach(function(error) {
          log.error('summarize - Reduce Error', error);
        });
      }
      
      log.audit('summarize', 'Script execution completed');
      
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

