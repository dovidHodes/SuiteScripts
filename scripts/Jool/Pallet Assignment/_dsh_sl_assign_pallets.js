/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @description Suitelet to calculate and assign pallets to SPS packages
 * 
 * Takes IF ID as parameter and calls library to calculate pallets and create records
 */

define([
  'N/log',
  './_dsh_lib_calculate_and_assign_pallets'
], function (log, palletLib) {
  
  function onRequest(context) {
    try {
      var request = context.request;
      var response = context.response;
      
      if (request.method === 'GET') {
        var ifId = request.parameters.ifid;
        
        if (!ifId) {
          response.write({
            output: JSON.stringify({
              success: false,
              error: 'Item Fulfillment ID (ifid) is required'
            })
          });
          return;
        }
        
        log.audit('Suitelet Started', 'Processing IF: ' + ifId);
        
        // Call library function
        var result = palletLib.calculateAndAssignPallets(ifId);
        
        // Return result
        response.write({
          output: JSON.stringify(result, null, 2)
        });
        
        log.audit('Suitelet Complete', 'IF: ' + ifId + ', Success: ' + result.success);
        
      } else {
        response.write({
          output: JSON.stringify({
            success: false,
            error: 'Only GET method is supported'
          })
        });
      }
      
    } catch (error) {
      log.error('Suitelet Error', error);
      context.response.write({
        output: JSON.stringify({
          success: false,
          error: error.message || error.toString()
        })
      });
    }
  }
  
  return {
    onRequest: onRequest
  };
});

