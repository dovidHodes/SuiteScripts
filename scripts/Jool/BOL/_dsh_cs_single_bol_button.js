/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * 
 * Client Script to handle "Generate BOL" button click on Item Fulfillment record
 * and call the Suitelet to generate and attach BOL PDF.
 */

define([
  'N/url',
  'N/ui/message',
  'N/log',
  'N/currentRecord'
], function (url, message, log, currentRecord) {
  
  function pageInit(context) {
    try {
      log.debug('ClientScript', 'Generate BOL Client Script loaded successfully.');
    } catch (e) {
      log.error('pageInit Error', e);
    }
  }
  
  function generateBOL(recordId) {
    try {
      var rec = currentRecord.get();
      var ifId = recordId || (rec && rec.id);
      
      if (!ifId) {
        alert('Item Fulfillment ID not available.');
        return;
      }
      
      var processingMsg = message.create({
        title: 'Generating BOL',
        message: 'Generating BOL PDF, please wait...',
        type: message.Type.INFORMATION
      });
      try { processingMsg.show(); } catch (e) {}
      
      var suiteletURL = url.resolveScript({
        scriptId: 'customscript_dsh_sl_single_bol',
        deploymentId: 'customdeploy_dsh_sl_single_bol',
        returnExternalUrl: false,
        params: { ifid: String(ifId) }
      });
      
      // Use fetch when available; fallback to navigation
      try {
        if (window.fetch) {
          fetch(suiteletURL, { method: 'GET', credentials: 'same-origin' })
            .then(function(res) {
              return res.text().then(function(text) {
                return { ok: res.ok, text: text };
              });
            })
            .then(function(result) {
              try { processingMsg.hide(); } catch (_) {}
              
              if (result.ok && result.text) {
                try {
                  var response = JSON.parse(result.text);
                  
                  if (response.success) {
                    var successMsg = message.create({
                      title: 'Success',
                      message: response.message || 'BOL PDF generated and attached successfully!',
                      type: message.Type.CONFIRMATION
                    });
                    try { successMsg.show(); } catch (_) {}
                    location.reload();
                  } else {
                    // Shorten error message for display
                    var errorText = response.error || 'Failed to generate BOL PDF.';
                    // Extract key part if it's a long error
                    if (errorText.length > 100) {
                      // Try to extract the most relevant part
                      if (errorText.includes('Missing required field:')) {
                        errorText = errorText.substring(errorText.indexOf('Missing required field:'));
                        // Truncate to 100 chars if still too long
                        if (errorText.length > 100) {
                          errorText = errorText.substring(0, 97) + '...';
                        }
                      } else {
                        errorText = errorText.substring(0, 97) + '...';
                      }
                    }
                    
                    var errMsg = message.create({
                      title: 'Error',
                      message: errorText,
                      type: message.Type.ERROR
                    });
                    try { errMsg.show(); } catch (_) {}
                  }
                } catch (parseError) {
                  // If response is not JSON, show as text
                  if (!result.text.includes('Error')) {
                    var successMsg = message.create({
                      title: 'Success',
                      message: result.text || 'BOL PDF generated successfully.',
                      type: message.Type.CONFIRMATION
                    });
                    try { successMsg.show(); } catch (_) {}
                    location.reload();
                  } else {
                    // Shorten error message
                    var errorText = result.text || 'Failed to generate BOL PDF.';
                    if (errorText.length > 100) {
                      if (errorText.includes('Missing required field:')) {
                        errorText = errorText.substring(errorText.indexOf('Missing required field:'));
                        if (errorText.length > 100) {
                          errorText = errorText.substring(0, 97) + '...';
                        }
                      } else {
                        errorText = errorText.substring(0, 97) + '...';
                      }
                    }
                    
                    var errMsg = message.create({
                      title: 'Error',
                      message: errorText,
                      type: message.Type.ERROR
                    });
                    try { errMsg.show(); } catch (_) {}
                  }
                }
              } else {
                // Shorten error message
                var errorText = result.text || 'Failed to generate BOL PDF.';
                if (errorText.length > 100) {
                  if (errorText.includes('Missing required field:')) {
                    errorText = errorText.substring(errorText.indexOf('Missing required field:'));
                    if (errorText.length > 100) {
                      errorText = errorText.substring(0, 97) + '...';
                    }
                  } else {
                    errorText = errorText.substring(0, 97) + '...';
                  }
                }
                
                var errMsg = message.create({
                  title: 'Error',
                  message: errorText,
                  type: message.Type.ERROR
                });
                try { errMsg.show(); } catch (_) {}
              }
            })
            .catch(function(err) {
              try { processingMsg.hide(); } catch (_) {}
              var errMsg = message.create({
                title: 'Error',
                message: 'An error occurred while generating BOL PDF.',
                type: message.Type.ERROR
              });
              try { errMsg.show(); } catch (_) {}
            });
        } else {
          window.location = suiteletURL + '&redirect=T';
        }
      } catch (_) {
        window.location = suiteletURL + '&redirect=T';
      }
      
    } catch (e) {
      try { log.error('generateBOL Error', e); } catch (_) {}
      alert('Error occurred: ' + (e && e.message ? e.message : 'Unable to generate BOL PDF.'));
    }
  }
  
  return {
    pageInit: pageInit,
    generateBOL: generateBOL
  };
});
