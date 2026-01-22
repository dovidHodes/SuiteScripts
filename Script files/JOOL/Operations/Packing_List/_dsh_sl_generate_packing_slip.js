/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Suitelet to generate packing slip PDF for an Item Fulfillment with pallet-level detail.
 * Takes IF ID as parameter, generates PDF using Advanced PDF/HTML template,
 * attaches to IF, and redirects to the file.
 */

define([
    'N/record',
    'N/render',
    'N/file',
    'N/log',
    'N/url'
  ], function (record, render, file, log, url) {
    
  var TEMPLATE_ID = '223';
  var PDF_FOLDER_ID = 2122; 
    
    /**
     * Handles HTTP requests
     * @param {Object} context
     */
    function onRequest(context) {
      try {
        log.audit('onRequest', '=== PACKING SLIP GENERATION STARTED ===');
        var request = context.request;
        var response = context.response;
        
        log.debug('onRequest', 'Request method: ' + request.method);
        log.debug('onRequest', 'Request parameters: ' + JSON.stringify(request.parameters));
        
        var ifId = request.parameters.ifid;
        
        log.debug('onRequest', 'Extracted IF ID: ' + ifId);
        
        if (!ifId) {
          log.error('onRequest', 'Missing Item Fulfillment ID in request parameters');
          response.write({
            output: JSON.stringify({
              success: false,
              error: 'Item Fulfillment ID (ifid) is required'
            })
          });
          return;
        }
        
        log.audit('onRequest', 'Processing packing slip for IF: ' + ifId);
        log.debug('onRequest', '=== STEP 1: Loading IF Record ===');
        
        // Load IF record
        var ifRecord = record.load({
          type: record.Type.ITEM_FULFILLMENT,
          id: ifId,
          isDynamic: false
        });
        log.debug('onRequest', 'IF record loaded successfully. Record ID: ' + ifRecord.id);
        
        var ifTranId = ifRecord.getValue('tranid') || ifId;
        var poNumber = ifRecord.getValue('custbody_sps_ponum_from_salesorder') || '';
        log.debug('onRequest', 'IF TranID: ' + ifTranId);
        log.debug('onRequest', 'PO Number: ' + (poNumber || 'EMPTY'));
        
        // Validate routing type - must be pallet type (1) for pallet packing slip
        var requestType = ifRecord.getValue('custbody_request_type');
        log.debug('onRequest', 'Routing Type (custbody_request_type): ' + (requestType !== null && requestType !== undefined ? requestType : 'NULL/EMPTY'));
        
        // Convert to number for comparison (handles both string "1" and number 1)
        var requestTypeNum = parseInt(requestType, 10);
        if (isNaN(requestTypeNum) || requestTypeNum !== 1) {
          var errorMsg = 'This packing slip is designed for pallet routing, but the Item Fulfillment has carton routing.';
          log.error('onRequest', errorMsg);
          log.error('onRequest', 'IF ' + ifTranId + ' (ID: ' + ifId + ') cannot generate pallet packing slip with routing type: ' + requestType);
          
          // Return simple error message
          response.write({
            output: JSON.stringify({
              success: false,
              error: errorMsg
            })
          });
          
          // Redirect back to IF record
          if (ifId) {
            try {
              response.sendRedirect({
                type: record.Type.ITEM_FULFILLMENT,
                identifier: ifId
              });
            } catch (redirectError) {
              log.error('onRequest', 'Error redirecting after routing type validation: ' + redirectError.toString());
            }
          }
          return;
        }
        
        log.debug('onRequest', 'Routing type validation passed: pallet type (1) confirmed');
        
        // Get entity/customer name as string
        var entityId = ifRecord.getValue('entity');
        var entityTextValue = ifRecord.getText('entity');
        var shipName = ifRecord.getValue('shipname');
        var shipToCompany = ifRecord.getValue('shiptocompany');
        var entityText = entityTextValue || entityId || shipName || shipToCompany || '';
        log.debug('onRequest', '=== Entity Debug ===');
        log.debug('onRequest', 'Entity ID: ' + (entityId || 'NULL'));
        log.debug('onRequest', 'Entity Text: ' + (entityTextValue || 'NULL'));
        log.debug('onRequest', 'Ship Name: ' + (shipName || 'NULL'));
        log.debug('onRequest', 'Ship To Company: ' + (shipToCompany || 'NULL'));
        log.debug('onRequest', 'Final Entity Text: ' + entityText);
        
        // Get pallet data from custbody_pallet_json field
        log.debug('onRequest', '=== STEP 2: Loading Pallet JSON ===');
        var palletJsonString = ifRecord.getValue('custbody_pallet_json') || '{}';
        log.debug('onRequest', 'Pallet JSON string length: ' + (palletJsonString ? palletJsonString.length : 0));
        log.debug('onRequest', 'Pallet JSON string (first 500 chars): ' + (palletJsonString ? palletJsonString.substring(0, 500) : 'EMPTY'));
        var palletData = {};
        
        try {
          palletData = JSON.parse(palletJsonString);
          log.debug('onRequest', 'Pallet JSON parsed successfully');
          log.debug('onRequest', 'Pallet data top-level keys: ' + Object.keys(palletData).join(', '));
          log.debug('onRequest', 'Total pallets in data: ' + (palletData.pallets ? palletData.pallets.length : 0));
          if (palletData.pallets && palletData.pallets.length > 0) {
            log.debug('onRequest', 'First pallet number: ' + (palletData.pallets[0].palletNumber || 'N/A'));
            log.debug('onRequest', 'First pallet items count: ' + (palletData.pallets[0].items ? palletData.pallets[0].items.length : 0));
          }
        } catch (jsonError) {
          log.error('onRequest', 'Failed to parse pallet JSON: ' + jsonError.toString());
          log.error('onRequest', 'JSON Error stack: ' + jsonError.stack);
          log.warning('onRequest', 'Using empty pallet data.');
          palletData = { pallets: [] };
        }
        
        // Create renderer
        log.debug('onRequest', '=== STEP 3: Creating Renderer ===');
        var renderer = render.create();
        log.debug('onRequest', 'Renderer created successfully');
        
        // Set template by ID
        log.debug('onRequest', 'Setting template ID: ' + TEMPLATE_ID);
        try {
          renderer.setTemplateById(TEMPLATE_ID);
          log.debug('onRequest', 'Template set successfully: ' + TEMPLATE_ID);
        } catch (templateError) {
          var errorMsg = 'Failed to set template ' + TEMPLATE_ID + ': ' + templateError.toString();
          log.error('onRequest', errorMsg);
          log.error('onRequest', 'Template error stack: ' + templateError.stack);
          // Redirect to IF on error (no file created)
          if (ifId) {
            response.sendRedirect({
              type: record.Type.ITEM_FULFILLMENT,
              identifier: ifId
            });
          }
          return;
        }
        
        // Add IF record so ${record} works in template
        log.debug('onRequest', 'Adding IF record to renderer...');
        renderer.addRecord('record', ifRecord);
        log.debug('onRequest', 'IF record added to renderer successfully');
        
        // Add custom pallet data source
        log.debug('onRequest', '=== STEP 4: Adding Custom Data Sources ===');
        // Structure: { pallets: { pallets: [...] } } so template accesses ${pallets.pallets}
        var palletsArray = palletData.pallets || [];
        log.debug('onRequest', 'Preparing pallet data source with ' + palletsArray.length + ' pallet(s)');
        renderer.addCustomDataSource({
          format: render.DataSource.OBJECT,
          alias: 'pallets',
          data: {
            pallets: palletsArray
          }
        });
        log.debug('onRequest', 'Pallet data source added successfully');
        log.debug('onRequest', 'Pallet data source structure: { pallets: [' + palletsArray.length + ' pallets] }');
        
        // Add entity/customer name as custom data source
        renderer.addCustomDataSource({
          format: render.DataSource.OBJECT,
          alias: 'custom',
          data: {
            entityName: entityText
          }
        });
        log.debug('onRequest', 'Added entity name to custom data source. Entity: ' + entityText);
        
        // Render PDF
        var pdf;
        try {
          pdf = renderer.renderAsPdf();
          log.debug('onRequest', 'PDF rendered successfully');
        } catch (renderError) {
          var errorMsg = 'Failed to render PDF: ' + renderError.toString();
          log.error('onRequest', errorMsg);
          // Redirect to IF on error (no file created)
          if (ifId) {
            response.sendRedirect({
              type: record.Type.ITEM_FULFILLMENT,
              identifier: ifId
            });
          }
          return;
        }
        
        // Set folder and file name
        pdf.folder = PDF_FOLDER_ID;
        
        // File name: Packing_Slip_{PO}_{TranID}.pdf or Packing_Slip_{TranID}.pdf
        var fileName = '';
        if (poNumber) {
          fileName = 'Packing_Slip_' + poNumber.replace(/[^a-zA-Z0-9]/g, '_') + '_' + ifTranId + '.pdf';
        } else {
          fileName = 'Packing_Slip_' + ifTranId + '.pdf';
        }
        pdf.name = fileName;
        
        // Save PDF to file cabinet
        var fileId;
        try {
          fileId = pdf.save();
          log.audit('onRequest', 'PDF saved to file cabinet. File ID: ' + fileId + ', Name: ' + fileName);
        } catch (saveError) {
          var errorMsg = 'Failed to save PDF: ' + saveError.toString();
          log.error('onRequest', errorMsg);
          // Redirect to IF on error (no file created)
          if (ifId) {
            response.sendRedirect({
              type: record.Type.ITEM_FULFILLMENT,
              identifier: ifId
            });
          }
          return;
        }
        
        // Attach PDF to IF
        try {
          record.attach({
            record: {
              type: record.Type.FILE,
              id: fileId
            },
            to: {
              type: record.Type.ITEM_FULFILLMENT,
              id: ifId
            }
          });
          log.debug('onRequest', 'Successfully attached PDF to IF');
        } catch (attachError) {
          log.error('onRequest', 'Error attaching PDF to IF: ' + attachError.toString());
          // Continue - attachment failure shouldn't stop the redirect
        }
        
        // Always redirect to the PDF file using HTML meta refresh
        if (fileId) {
          try {
            var pdfFile = file.load({ id: fileId });
            var fileUrl = pdfFile.url;
            var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
            var fullFileUrl = 'https://' + domain + fileUrl;
            log.audit('onRequest', 'Redirecting to file URL: ' + fullFileUrl);
            
            // Use HTML meta refresh to redirect to the file
            response.setHeader({
              name: 'Content-Type',
              value: 'text/html'
            });
            response.write('<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=' + fullFileUrl + '"></head><body>Redirecting to packing slip...</body></html>');
          } catch (fileError) {
            log.error('onRequest', 'Error loading file for redirect: ' + fileError.toString());
            // Fallback: redirect to IF if file can't be loaded
            if (ifId) {
              response.sendRedirect({
                type: record.Type.ITEM_FULFILLMENT,
                identifier: ifId
              });
            }
          }
        } else {
          // Fallback: redirect to IF if fileId is somehow missing
          log.error('onRequest', 'File ID is missing, redirecting to IF');
          if (ifId) {
            response.sendRedirect({
              type: record.Type.ITEM_FULFILLMENT,
              identifier: ifId
            });
          }
        }
        
      } catch (error) {
        log.error('onRequest', 'Unexpected error: ' + error.toString());
        log.error('onRequest', 'Stack: ' + error.stack);
        
        var request = context.request;
        var response = context.response;
        var ifId = request.parameters.ifid;
        
        // Only redirect if we have a valid IF ID
        if (ifId) {
          try {
            response.sendRedirect({
              type: record.Type.ITEM_FULFILLMENT,
              identifier: ifId
            });
            return;
          } catch (redirectError) {
            log.error('onRequest', 'Error redirecting: ' + redirectError.toString());
          }
        }
        
        // Fallback: return JSON error
        response.write({
          output: JSON.stringify({
            success: false,
            error: 'Unexpected error: ' + error.toString()
          })
        });
      }
    }
    
    return {
      onRequest: onRequest
    };
    
  });
  
  