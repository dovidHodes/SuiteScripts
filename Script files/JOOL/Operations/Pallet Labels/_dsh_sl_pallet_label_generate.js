/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Suitelet to generate pallet label PDF for a pallet record.
 * Called with pallet ID as parameter.
 * Uses library script for shared logic.
 
 */

define([
  'N/log',
  'N/url',
  'N/runtime',
  './_dsh_lib_pallet_label_generator'
], function (log, url, runtime, palletLabelLib) {
  
  function onRequest(context) {
    try {
      var request = context.request;
      var response = context.response;
      
      if (request.method === 'GET') {
        var palletId = request.parameters.palletid;
        
        if (!palletId) {
          response.write({
            output: JSON.stringify({
              success: false,
              error: 'Pallet ID is required'
            })
          });
          return;
        }
        
        log.debug('Pallet Label Suitelet', 'Generating label for pallet: ' + palletId);
        
        // Get PDF folder ID from script parameter
        var pdfFolderId = runtime.getCurrentScript().getParameter({
          name: 'custscript_dsh_pallet_label_folder_id'
        }) || 1373; // Default folder ID
        
        // Get template ID from script parameter (optional)
        var templateIdParam = runtime.getCurrentScript().getParameter({
          name: 'custscript_dsh_pallet_label_template_id'
        });
        var templateId = templateIdParam || 'CUSTTMPL_DSH_PALLET_LABEL';
        
        // Call library function
        var result = palletLabelLib.generatePalletLabel(palletId, pdfFolderId, templateId);
        
        // Check if redirect parameter is set
        var shouldRedirect = request.parameters.redirect === 'T' || request.parameters.redirect === 'true';
        
        if (result.success) {
          if (shouldRedirect) {
            // Redirect back to the pallet record
            var palletRecordUrl = url.resolveRecord({
              recordType: 'customrecord_asn_pallet',
              recordId: palletId,
              isEditMode: false
            });
            response.write('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=' + palletRecordUrl + '"></head><body>Pallet label generated successfully. Redirecting...</body></html>');
          } else {
            // Return JSON response
            response.write({
              output: JSON.stringify(result)
            });
          }
        } else {
          if (shouldRedirect) {
            // Still redirect back to pallet record
            var palletRecordUrl = url.resolveRecord({
              recordType: 'customrecord_asn_pallet',
              recordId: palletId,
              isEditMode: false
            });
            response.write('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=' + palletRecordUrl + '"></head><body>Processing complete. Redirecting...</body></html>');
          } else {
            response.write({
              output: JSON.stringify(result)
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

