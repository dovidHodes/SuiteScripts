/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 * 
 * RESTlet that returns all sales order line items for entity 1716 from on or after 11/3/2025.
 * Returns: trandate, otherrefnum, and for each line item: custcol_sps_vendorpartnumber, quantity, and custcol_orig_qty
 */

define([
  'N/search',
  'N/log'
], function (search, log) {
  
  function get(requestParams) {
    try {
      // Search for sales order line items for entity 1716 from on or after 11/3/2025
      var entityId = 1716;
      var startDate = '11/3/2025';
      
      // Create transaction line search (mainline = false to get only item lines)
      var transactionLineSearch = search.create({
        type: search.Type.TRANSACTION,
        filters: [
          ['type', 'anyof', 'SalesOrd'],
          'AND',
          ['entity', 'anyof', entityId],
          'AND',
          ['trandate', 'onorafter', startDate],
          'AND',
          ['mainline', 'is', 'F'] // Only get item lines, not header
        ],
        columns: [
          search.createColumn({ name: 'trandate' }),
          search.createColumn({ name: 'otherrefnum' }),
          search.createColumn({ name: 'custcol_sps_vendorpartnumber' }),
          search.createColumn({ name: 'quantity' }),
          search.createColumn({ name: 'custcol_orig_qty' })
        ]
      });
      
      var results = [];
      
      transactionLineSearch.run().each(function (result) {
        results.push({
          trandate: result.getValue({ name: 'trandate' }) || '',
          otherrefnum: result.getValue({ name: 'otherrefnum' }) || '',
          custcol_sps_vendorpartnumber: result.getValue({ name: 'custcol_sps_vendorpartnumber' }) || '',
          quantity: result.getValue({ name: 'quantity' }) || 0,
          custcol_orig_qty: result.getValue({ name: 'custcol_orig_qty' }) || 0
        });
        
        return true; // Continue processing
      });
      
      log.audit('Sales Order Line Items Search', 'Found ' + results.length + ' line items');
      
      return {
        success: true,
        count: results.length,
        lineItems: results
      };
      
    } catch (error) {
      log.error('RESTlet Error', error);
      return {
        success: false,
        error: error.message || error.toString()
      };
    }
  }
  
  return {
    get: get
  };
});
