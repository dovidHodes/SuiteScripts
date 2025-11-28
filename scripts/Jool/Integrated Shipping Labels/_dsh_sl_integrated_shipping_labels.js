/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Suitelet for button-triggered integrated shipping labels creation.
 * Validates same criteria as scheduled script, then calls library.
 */

define([
  'N/record',
  'N/search',
  'N/log',
  './_dsh_lib_integrated_shipping_labels'
], function (record, search, log, integratedLabelsLib) {
  
  /**
   * Handles HTTP requests
   * @param {Object} context
   */
  function onRequest(context) {
    try {
      log.audit('onRequest', '=== SUITELET REQUEST STARTED ===');
      var request = context.request;
      var response = context.response;
      
      log.debug('onRequest', 'Request method: ' + request.method);
      log.debug('onRequest', 'Request parameters: ' + JSON.stringify(request.parameters));
      
      var ifId = request.parameters.ifid;
      var doRedirect = request.parameters.redirect === 'T';
      
      log.debug('onRequest', 'Extracted IF ID: ' + ifId + ' (type: ' + typeof ifId + ')');
      log.debug('onRequest', 'Redirect flag: ' + doRedirect);
      
      if (!ifId) {
        log.error('onRequest', 'Missing Item Fulfillment ID in request parameters');
        if (doRedirect) {
          log.debug('onRequest', 'Redirecting due to missing IF ID');
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId || ''
          });
        } else {
          log.debug('onRequest', 'Returning JSON error response');
          response.write(JSON.stringify({
            success: false,
            error: 'Missing Item Fulfillment ID'
          }));
        }
        return;
      }
      
      log.audit('onRequest', 'Processing integrated shipping labels for IF: ' + ifId);
      
      // Load IF record
      log.debug('onRequest', '=== Loading IF record ===');
      log.debug('onRequest', 'Loading IF record with ID: ' + ifId);
      var ifRecord = record.load({
        type: record.Type.ITEM_FULFILLMENT,
        id: ifId,
        isDynamic: false
      });
      log.debug('onRequest', 'IF record loaded successfully');
      
      var tranId = ifRecord.getValue('tranid') || ifId;
      var entityId = ifRecord.getValue('entity');
      
      log.debug('onRequest', 'IF TranID: ' + tranId);
      log.debug('onRequest', 'IF Entity ID: ' + entityId);
      
      if (!entityId) {
        var errorMsg = 'No entity found on IF ' + tranId;
        log.error('onRequest', errorMsg);
        if (doRedirect) {
          log.debug('onRequest', 'Redirecting due to missing entity');
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          log.debug('onRequest', 'Returning JSON error response for missing entity');
          response.write(JSON.stringify({
            success: false,
            error: errorMsg
          }));
        }
        return;
      }
      
      // Validate same criteria as SCH script
      log.debug('onRequest', '=== Validating IF criteria ===');
      log.debug('onRequest', 'Calling validateIFCriteria for IF: ' + tranId + ', Entity: ' + entityId);
      var validationResult = validateIFCriteria(ifRecord, entityId);
      log.debug('onRequest', 'Validation result: ' + JSON.stringify(validationResult));
      
      if (!validationResult.valid) {
        log.error('onRequest', 'Validation failed for IF ' + tranId + ': ' + validationResult.error);
        if (doRedirect) {
          log.debug('onRequest', 'Redirecting due to validation failure');
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          log.debug('onRequest', 'Returning JSON error response for validation failure');
          response.write(JSON.stringify({
            success: false,
            error: validationResult.error
          }));
        }
        return;
      }
      log.debug('onRequest', 'Validation passed successfully');
      
      // Set workflow flag before processing (same as SCH)
      log.debug('onRequest', '=== Setting requested_integrated_packages flag ===');
      try {
        var currentRequestedValue = ifRecord.getValue('custbody_requested_integrated_packages');
        log.debug('onRequest', 'Current requested_integrated_packages value: ' + currentRequestedValue);
        log.debug('onRequest', 'Setting requested_integrated_packages to true');
        record.submitFields({
          type: record.Type.ITEM_FULFILLMENT,
          id: ifId,
          values: {
            custbody_requested_integrated_packages: true
          },
          options: {
            enableSourcing: false,
            ignoreMandatoryFields: true
          }
        });
        log.debug('onRequest', 'Successfully set requested_integrated_packages to true');
      } catch (fieldError) {
        log.error('onRequest', 'Error setting requested_integrated_packages field: ' + fieldError.toString());
        log.error('onRequest', 'Field error stack: ' + (fieldError.stack || 'N/A'));
        // Continue processing
      }
      
      // Call library function
      log.debug('onRequest', '=== Calling library function createIntegratedShippingLabels ===');
      log.debug('onRequest', 'Passing IF ID to library: ' + ifId);
      var result = integratedLabelsLib.createIntegratedShippingLabels(ifId);
      log.debug('onRequest', 'Library function returned: ' + JSON.stringify(result));
      
      if (result.success) {
        log.audit('onRequest', '=== SUCCESS ===');
        log.audit('onRequest', 'Successfully created ' + result.packagesCreated + ' package line(s) for IF: ' + tranId);
        log.debug('onRequest', 'Result details - Packages created: ' + result.packagesCreated + ', TranID: ' + result.tranId + ', IF ID: ' + result.ifId);
        
        if (doRedirect) {
          log.debug('onRequest', 'Redirecting to IF record after success');
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          log.debug('onRequest', 'Returning JSON success response');
          response.write(JSON.stringify({
            success: true,
            message: 'Successfully created ' + result.packagesCreated + ' package line(s)',
            packagesCreated: result.packagesCreated,
            tranId: tranId
          }));
        }
      } else {
        log.error('onRequest', '=== FAILURE ===');
        log.error('onRequest', 'Library function returned success: false');
        log.error('onRequest', 'Error message: ' + (result.error || 'Unknown error'));
        
        // Reset field on failure
        log.debug('onRequest', 'Resetting requested_integrated_packages field due to failure');
        try {
          record.submitFields({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId,
            values: {
              custbody_requested_integrated_packages: false
            },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          log.debug('onRequest', 'Successfully reset requested_integrated_packages to false');
        } catch (resetError) {
          log.error('onRequest', 'Error resetting field: ' + resetError.toString());
          log.error('onRequest', 'Reset error stack: ' + (resetError.stack || 'N/A'));
        }
        
        log.error('onRequest', 'Failed to create integrated shipping labels: ' + (result.error || 'Unknown error'));
        
        if (doRedirect) {
          log.debug('onRequest', 'Redirecting to IF record after failure');
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          log.debug('onRequest', 'Returning JSON error response');
          response.write(JSON.stringify({
            success: false,
            error: result.error || 'Failed to create integrated shipping labels'
          }));
        }
      }
      
    } catch (e) {
      log.error('onRequest', '=== EXCEPTION OCCURRED ===');
      log.error('onRequest', 'Error: ' + e.toString());
      log.error('onRequest', 'Error type: ' + (e.name || 'Unknown'));
      log.error('onRequest', 'Error message: ' + (e.message || 'N/A'));
      log.error('onRequest', 'Stack trace: ' + (e.stack || 'N/A'));
      
      if (doRedirect) {
        log.debug('onRequest', 'Attempting to redirect after exception');
        try {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: request.parameters.ifid || ''
          });
          log.debug('onRequest', 'Redirect successful');
        } catch (redirectError) {
          log.error('onRequest', 'Error during redirect: ' + redirectError.toString());
        }
      } else {
        log.debug('onRequest', 'Returning JSON error response for exception');
        response.write(JSON.stringify({
          success: false,
          error: 'Internal server error: ' + e.toString()
        }));
      }
    }
  }
  
  /**
   * Validates entity has integrated shipping labels enabled
   * Simplified validation for manual processing - only checks if entity has auto-create enabled
   * @param {Object} ifRecord - Item Fulfillment record
   * @param {string|number} entityId - Entity ID
   * @returns {Object} { valid: boolean, error?: string }
   */
  function validateIFCriteria(ifRecord, entityId) {
    try {
      log.debug('validateIFCriteria', '=== Starting validation ===');
      log.debug('validateIFCriteria', 'Entity ID: ' + entityId);
      
      // Load customer record
      log.debug('validateIFCriteria', 'Loading customer record with ID: ' + entityId);
      var customerRecord = record.load({
        type: record.Type.CUSTOMER,
        id: entityId,
        isDynamic: false
      });
      log.debug('validateIFCriteria', 'Customer record loaded successfully');
      
      // Only check if entity has integrated shipping labels enabled
      log.debug('validateIFCriteria', 'Checking create_packages_integrated checkbox');
      var createPackagesIntegrated = customerRecord.getValue('custentity_create_packages_integrated');
      log.debug('validateIFCriteria', 'create_packages_integrated value: ' + createPackagesIntegrated + ' (type: ' + typeof createPackagesIntegrated + ')');
      
      if (createPackagesIntegrated !== true && createPackagesIntegrated !== 'T') {
        log.debug('validateIFCriteria', 'Validation FAILED: Entity does not have integrated shipping labels enabled');
        return {
          valid: false,
          error: 'Entity does not have integrated shipping labels enabled'
        };
      }
      
      log.debug('validateIFCriteria', '=== VALIDATION PASSED ===');
      log.debug('validateIFCriteria', 'Entity has integrated shipping labels enabled');
      return { valid: true };
      
    } catch (e) {
      log.error('validateIFCriteria', '=== VALIDATION EXCEPTION ===');
      log.error('validateIFCriteria', 'Error validating criteria: ' + e.toString());
      log.error('validateIFCriteria', 'Error type: ' + (e.name || 'Unknown'));
      log.error('validateIFCriteria', 'Error message: ' + (e.message || 'N/A'));
      log.error('validateIFCriteria', 'Stack trace: ' + (e.stack || 'N/A'));
      return {
        valid: false,
        error: 'Validation error: ' + e.toString()
      };
    }
  }
  
  return {
    onRequest: onRequest
  };
});

