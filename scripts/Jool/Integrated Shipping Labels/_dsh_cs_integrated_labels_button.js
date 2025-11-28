/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * 
 * Client Script to handle "Create Integrated Shipping Labels" button click
 * and call the Suitelet to create package lines from SPS packages.
 */

define([
  'N/url',
  'N/ui/message',
  'N/log',
  'N/currentRecord'
], function (url, message, log, currentRecord) {
  
  function pageInit(context) {
    try {
      log.debug('ClientScript', 'Create Integrated Shipping Labels Client Script loaded successfully.');
    } catch (e) {
      log.error('pageInit Error', e);
    }
  }
  
  function createIntegratedLabels(recordId) {
    try {
      var rec = currentRecord.get();
      var ifId = recordId || (rec && rec.id);
      
      if (!ifId) {
        alert('Item Fulfillment ID not available.');
        return;
      }
      
      var processingMsg = message.create({
        title: 'Creating Integrated Shipping Labels',
        message: 'Creating package lines from SPS packages, please wait...',
        type: message.Type.INFORMATION
      });
      try { processingMsg.show(); } catch (e) {}
      
      var suiteletURL = url.resolveScript({
        scriptId: 'customscript_dsh_sl_integrated_labels',
        deploymentId: 'customdeploy_dsh_sl_integrated_labels',
        returnExternalUrl: false,
        params: { ifid: String(ifId) }
      });
      
      // Use fetch when available
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
                      message: response.message || 'Integrated shipping labels created successfully!',
                      type: message.Type.CONFIRMATION
                    });
                    try { successMsg.show(); } catch (_) {}
                    location.reload();
                  } else {
                    var errorText = response.error || 'Failed to create integrated shipping labels.';
                    if (errorText.length > 100) {
                      errorText = errorText.substring(0, 97) + '...';
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
                      message: result.text || 'Integrated shipping labels created successfully.',
                      type: message.Type.CONFIRMATION
                    });
                    try { successMsg.show(); } catch (_) {}
                    location.reload();
                  } else {
                    var errorText = result.text || 'Failed to create integrated shipping labels.';
                    if (errorText.length > 100) {
                      errorText = errorText.substring(0, 97) + '...';
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
                var errorText = result.text || 'Failed to create integrated shipping labels.';
                if (errorText.length > 100) {
                  errorText = errorText.substring(0, 97) + '...';
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
                message: 'An error occurred while creating integrated shipping labels.',
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
      try { log.error('createIntegratedLabels Error', e); } catch (_) {}
      alert('Error occurred: ' + (e && e.message ? e.message : 'Unable to create integrated shipping labels.'));
    }
  }
  
  return {
    pageInit: pageInit,
    createIntegratedLabels: createIntegratedLabels
  };
});

