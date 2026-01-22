/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Suitelet to generate a single BOL PDF from Item Fulfillment and attach it directly to the IF.
 * Called from Client Script button on IF record.
 * Uses library script for shared logic - can also be used by Scheduled Script.
 */

define([
  'N/runtime',
  'N/log',
  './_dsh_lib_bol_generator'  // Library script with shared BOL generation logic
], function (runtime, log, bolLib) {
  
  function onRequest(context) {
    try {
      var request = context.request;
      var response = context.response;
      
      // Debug: Check if library loaded correctly
      if (!bolLib) {
        log.error('Library Import Error', 'bolLib is undefined - library script not loaded');
        response.write({
          output: JSON.stringify({
            success: false,
            error: 'Library script not loaded. Please verify _dsh_lib_bol_generator.js is uploaded to NetSuite.'
          })
        });
        return;
      }
      
      if (typeof bolLib.generateAndAttachBOL !== 'function') {
        log.error('Library Function Error', 'generateAndAttachBOL is not a function. bolLib type: ' + typeof bolLib);
        log.error('Library Function Error', 'bolLib keys: ' + Object.keys(bolLib || {}).join(', '));
        response.write({
          output: JSON.stringify({
            success: false,
            error: 'Library function not found. Please verify _dsh_lib_bol_generator.js is uploaded correctly.'
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
        
        // Get PDF folder ID from script parameter
        var pdfFolderId = runtime.getCurrentScript().getParameter({
          name: 'custscript_dsh_bol_folder_id'
        }) || 1373; // Default folder ID
        
        // Get template ID from script parameter (optional)
        var templateIdParam = runtime.getCurrentScript().getParameter({
          name: 'custscript_dsh_bol_template_id'
        });
        // Override old template ID if present, otherwise use parameter or default
        var templateId = templateIdParam;
        if (!templateId || templateId === '' || templateId === 'CUSTTMPL_108_6448561_565') {
          templateId = 'CUSTTMPL_DSH_SVC_BOL';
        }
        
        // Log template ID source for debugging
        log.audit('Suitelet Template ID', 'Parameter value: ' + (templateIdParam || 'NOT SET'));
        log.audit('Suitelet Template ID', 'Final template ID (after override check): ' + templateId);
        
        // Call library function - shared with Scheduled Script!
        var result = bolLib.generateAndAttachBOL(ifId, pdfFolderId, templateId);
        
        response.write({
          output: JSON.stringify(result)
        });
        
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
          error: error.message
        })
      });
    }
  }
  
  return {
    onRequest: onRequest
  };
});

