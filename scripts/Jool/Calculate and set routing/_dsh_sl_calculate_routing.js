/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Suitelet to calculate and apply routing fields to an Item Fulfillment.
 * Called from Client Script button on IF record.
 * Uses library script for shared logic.
 */

define([
  'N/log',
  'N/url',
  'N/record',
  './_dsh_lib_routing_calculator'  // Library script with shared routing calculation logic
], function (log, url, record, routingLib) {
  
  function onRequest(context) {
    try {
      var request = context.request;
      var response = context.response;
      
      // Debug: Check if library loaded correctly
      if (!routingLib) {
        log.error('Library Import Error', 'routingLib is undefined - library script not loaded');
        response.write({
          output: JSON.stringify({
            success: false,
            error: 'Library script not loaded. Please verify _dsh_lib_routing_calculator.js is uploaded to NetSuite.'
          })
        });
        return;
      }
      
      if (typeof routingLib.calculateAndApplyRoutingFields !== 'function') {
        log.error('Library Function Error', 'calculateAndApplyRoutingFields is not a function. routingLib type: ' + typeof routingLib);
        log.error('Library Function Error', 'routingLib keys: ' + Object.keys(routingLib || {}).join(', '));
        response.write({
          output: JSON.stringify({
            success: false,
            error: 'Library function not available. Please verify library script is uploaded correctly.'
          })
        });
        return;
      }
      
      if (request.method === 'GET') {
        var ifId = request.parameters.ifid;
        
        if (!ifId) {
          response.write({
            output: JSON.stringify({
              success: false,
              error: 'Item Fulfillment ID is required'
            })
          });
          return;
        }
        
        log.debug('Routing Suitelet', 'Calculating routing fields for IF: ' + ifId);
        
        // Call library function - shared with User Event script!
        var result = routingLib.calculateAndApplyRoutingFields(ifId);
        
        // Check if redirect parameter is set
        var redirect = request.parameters.redirect;
        
        // Check if redirect parameter is set
        var shouldRedirect = request.parameters.redirect === 'T' || request.parameters.redirect === 'true';
        
        if (result) {
          if (shouldRedirect) {
            // Redirect back to the IF record using HTML meta refresh
            var ifRecordUrl = url.resolveRecord({
              recordType: 'itemfulfillment',
              recordId: ifId,
              isEditMode: false
            });
            response.write('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=' + ifRecordUrl + '"></head><body>Routing calculated successfully. Redirecting...</body></html>');
          } else {
            // Return JSON response
            response.write({
              output: JSON.stringify({
                success: true,
                message: 'Routing fields calculated and applied successfully!'
              })
            });
          }
        } else {
          if (shouldRedirect) {
            // Still redirect back to IF record
            var ifRecordUrl = url.resolveRecord({
              recordType: 'itemfulfillment',
              recordId: ifId,
              isEditMode: false
            });
            response.write('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=' + ifRecordUrl + '"></head><body>Processing complete. Redirecting...</body></html>');
          } else {
            response.write({
              output: JSON.stringify({
                success: false,
                error: 'Failed to calculate routing fields. Check execution logs for details.'
              })
            });
          }
        }
        
      } else {
        response.write({
          output: JSON.stringify({
            success: false,
            error: 'Only GET method is supported'
          })
        });
      }
      
    } catch (error) {
      log.error('onRequest Error', error);
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

