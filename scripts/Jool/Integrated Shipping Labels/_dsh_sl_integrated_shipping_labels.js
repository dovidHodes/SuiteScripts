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
      var request = context.request;
      var response = context.response;
      var ifId = request.parameters.ifid;
      var doRedirect = request.parameters.redirect === 'T';
      
      if (!ifId) {
        if (doRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId || ''
          });
        } else {
          response.write(JSON.stringify({
            success: false,
            error: 'Missing Item Fulfillment ID'
          }));
        }
        return;
      }
      
      log.audit('onRequest', 'Processing integrated shipping labels for IF: ' + ifId);
      
      // Load IF record
      var ifRecord = record.load({
        type: record.Type.ITEM_FULFILLMENT,
        id: ifId,
        isDynamic: false
      });
      
      var tranId = ifRecord.getValue('tranid') || ifId;
      var entityId = ifRecord.getValue('entity');
      
      if (!entityId) {
        var errorMsg = 'No entity found on IF ' + tranId;
        log.error('onRequest', errorMsg);
        if (doRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write(JSON.stringify({
            success: false,
            error: errorMsg
          }));
        }
        return;
      }
      
      // Validate same criteria as SCH script
      var validationResult = validateIFCriteria(ifRecord, entityId);
      
      if (!validationResult.valid) {
        log.error('onRequest', 'Validation failed for IF ' + tranId + ': ' + validationResult.error);
        if (doRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write(JSON.stringify({
            success: false,
            error: validationResult.error
          }));
        }
        return;
      }
      
      // Set workflow flag before processing (same as SCH)
      try {
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
      } catch (fieldError) {
        log.error('onRequest', 'Error setting requested_integrated_packages field: ' + fieldError.toString());
        // Continue processing
      }
      
      // Call library function
      var result = integratedLabelsLib.createIntegratedShippingLabels(ifId);
      
      if (result.success) {
        log.audit('onRequest', 'Successfully created ' + result.packagesCreated + ' package line(s) for IF: ' + tranId);
        
        if (doRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write(JSON.stringify({
            success: true,
            message: 'Successfully created ' + result.packagesCreated + ' package line(s)',
            packagesCreated: result.packagesCreated,
            tranId: tranId
          }));
        }
      } else {
        // Reset field on failure
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
        } catch (resetError) {
          log.error('onRequest', 'Error resetting field: ' + resetError.toString());
        }
        
        log.error('onRequest', 'Failed to create integrated shipping labels: ' + (result.error || 'Unknown error'));
        
        if (doRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write(JSON.stringify({
            success: false,
            error: result.error || 'Failed to create integrated shipping labels'
          }));
        }
      }
      
    } catch (e) {
      log.error('onRequest', 'Error: ' + e.toString());
      log.error('onRequest', 'Stack trace: ' + (e.stack || 'N/A'));
      
      if (doRedirect) {
        try {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: request.parameters.ifid || ''
          });
        } catch (_) {}
      } else {
        response.write(JSON.stringify({
          success: false,
          error: 'Internal server error: ' + e.toString()
        }));
      }
    }
  }
  
  /**
   * Validates IF meets same criteria as SCH script
   * @param {Object} ifRecord - Item Fulfillment record
   * @param {string|number} entityId - Entity ID
   * @returns {Object} { valid: boolean, error?: string }
   */
  function validateIFCriteria(ifRecord, entityId) {
    try {
      // Check requested field
      var requestedIntegratedPackages = ifRecord.getValue('custbody_requested_integrated_packages');
      if (requestedIntegratedPackages === true || requestedIntegratedPackages === 'T') {
        return {
          valid: false,
          error: 'Integrated shipping labels already requested for this IF'
        };
      }
      
      // Load customer record
      var customerRecord = record.load({
        type: record.Type.CUSTOMER,
        id: entityId,
        isDynamic: false
      });
      
      // Check entity checkbox
      var createPackagesIntegrated = customerRecord.getValue('custentity_create_packages_integrated');
      if (createPackagesIntegrated !== true && createPackagesIntegrated !== 'T') {
        return {
          valid: false,
          error: 'Entity does not have integrated shipping labels enabled'
        };
      }
      
      // Check routing if needed
      var needsRouting = customerRecord.getValue('custentity_needs_routing');
      if (needsRouting === true || needsRouting === 'T') {
        var routingStatus = ifRecord.getValue('custbody_routing_status');
        if (routingStatus !== 3) {
          return {
            valid: false,
            error: 'Entity requires routing but routing status is not 3 (routing received)'
          };
        }
      }
      
      // Check SCAC against small parcel list
      var scac = ifRecord.getValue('custbody_sps_carrieralphacode') || '';
      if (!scac || scac === '') {
        return {
          valid: false,
          error: 'No SCAC code found on IF'
        };
      }
      
      // Get small parcel list
      var isSmallParcelText = '';
      try {
        var textValue = customerRecord.getText({
          fieldId: 'custentity_is_small_parcel'
        });
        isSmallParcelText = (textValue ? String(textValue) : '') || '';
      } catch (textError) {
        isSmallParcelText = '';
      }
      
      // Check if SCAC is in small parcel list
      var scacInSmallParcelList = false;
      if (isSmallParcelText && typeof isSmallParcelText === 'string' && isSmallParcelText.trim() !== '') {
        var smallParcelList = isSmallParcelText.split(',').map(function(item) {
          return item.trim();
        });
        
        for (var i = 0; i < smallParcelList.length; i++) {
          if (smallParcelList[i].toUpperCase() === scac.toUpperCase()) {
            scacInSmallParcelList = true;
            break;
          }
        }
      }
      
      if (!scacInSmallParcelList) {
        return {
          valid: false,
          error: 'SCAC "' + scac + '" is not in entity\'s small parcel list'
        };
      }
      
      return { valid: true };
      
    } catch (e) {
      log.error('validateIFCriteria', 'Error validating criteria: ' + e.toString());
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

