/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Suitelet to generate and merge pallet labels for an Item Fulfillment.
 * Takes IF ID as parameter, searches for all related pallets, generates labels,
 * merges them into a single PDF, attaches to IF, and sets URL field.
 */

define([
  'N/record',
  'N/search',
  'N/log',
  'N/url',
  './_dsh_lib_pallet_label_generator',
  './_dsh_lib_pdf_merger'
], function (record, search, log, url, palletLabelLib, pdfMerger) {
  
  // Configuration constants
  var PALLET_RECORD_TYPE = 'customrecord_asn_pallet';
  var PALLET_IF_FIELD = 'custrecord_parent_if';
  var PDF_FOLDER_ID = 2122;
  var MERGED_LABELS_FIELD = 'custbody_merged_pallet_labels';
  
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
      
      if (request.method !== 'GET') {
        response.write({
          output: JSON.stringify({
            success: false,
            error: 'Only GET method is supported'
          })
        });
        return;
      }
      
      var ifId = request.parameters.ifid;
      var shouldRedirect = request.parameters.redirect === 'T' || request.parameters.redirect === 'true';
      
      log.debug('onRequest', 'Extracted IF ID: ' + ifId);
      log.debug('onRequest', 'Redirect flag: ' + shouldRedirect);
      
      if (!ifId) {
        log.error('onRequest', 'Missing Item Fulfillment ID in request parameters');
        if (shouldRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId || ''
          });
        } else {
          response.write({
            output: JSON.stringify({
              success: false,
              error: 'Item Fulfillment ID (ifid) is required'
            })
          });
        }
        return;
      }
      
      log.audit('onRequest', 'Processing pallet labels for IF: ' + ifId);
      
      // Load IF record to get details for file naming
      var ifRecord = record.load({
        type: record.Type.ITEM_FULFILLMENT,
        id: ifId,
        isDynamic: false
      });
      
      var ifTranId = ifRecord.getValue('tranid') || ifId;
      var poNumber = ifRecord.getValue('custbody_sps_ponum_from_salesorder') || '';
      var locationId = ifRecord.getValue('custbody_ship_from_location') || '';
      
      // Get location name
      var locationName = '';
      if (locationId) {
        try {
          var locationRecord = record.load({
            type: 'location',
            id: locationId,
            isDynamic: false
          });
          locationName = locationRecord.getValue('name') || locationRecord.getValue('location') || '';
        } catch (e) {
          log.debug('onRequest', 'Could not load location: ' + e.toString());
        }
      }
      
      log.debug('onRequest', 'IF TranID: ' + ifTranId + ', PO: ' + poNumber + ', Location: ' + locationName);
      
      // Search for all pallets related to this IF
      log.debug('onRequest', 'Searching for pallets where ' + PALLET_IF_FIELD + ' = ' + ifId);
      var palletSearch = search.create({
        type: PALLET_RECORD_TYPE,
        filters: [
          [PALLET_IF_FIELD, 'anyof', ifId]
        ],
        columns: [
          search.createColumn({ name: 'internalid' })
        ]
      });
      
      var palletIds = [];
      try {
        palletSearch.run().each(function(result) {
          palletIds.push(result.id);
          return true;
        });
      } catch (e) {
        log.error('onRequest', 'Error searching for pallets: ' + e.toString());
        if (shouldRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write({
            output: JSON.stringify({
              success: false,
              error: 'Error searching for pallets: ' + e.toString()
            })
          });
        }
        return;
      }
      
      log.audit('onRequest', 'Found ' + palletIds.length + ' pallet(s) for IF: ' + ifTranId);
      
      if (palletIds.length === 0) {
        var errorMsg = 'No pallets found for Item Fulfillment ' + ifTranId;
        log.error('onRequest', errorMsg);
        if (shouldRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write({
            output: JSON.stringify({
              success: false,
              error: errorMsg
            })
          });
        }
        return;
      }
      
      // Generate pallet label for each pallet
      log.debug('onRequest', 'Generating labels for ' + palletIds.length + ' pallet(s)');
      var fileIds = [];
      var errors = [];
      
      for (var i = 0; i < palletIds.length; i++) {
        var palletId = palletIds[i];
        try {
          log.debug('onRequest', 'Generating label for pallet: ' + palletId);
          var result = palletLabelLib.generatePalletLabel(palletId, PDF_FOLDER_ID);
          
          if (result.success && result.fileId) {
            fileIds.push(result.fileId);
            log.debug('onRequest', 'Pallet label generated successfully, fileId: ' + result.fileId);
          } else {
            var errorMsg = 'Failed to generate label for pallet ' + palletId + ': ' + (result.error || 'Unknown error');
            log.error('onRequest', errorMsg);
            errors.push(errorMsg);
          }
        } catch (e) {
          var errorMsg = 'Error generating label for pallet ' + palletId + ': ' + e.toString();
          log.error('onRequest', errorMsg);
          errors.push(errorMsg);
        }
      }
      
      if (fileIds.length === 0) {
        var errorMsg = 'Failed to generate any pallet labels. Errors: ' + errors.join('; ');
        log.error('onRequest', errorMsg);
        if (shouldRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write({
            output: JSON.stringify({
              success: false,
              error: errorMsg
            })
          });
        }
        return;
      }
      
      log.audit('onRequest', 'Generated ' + fileIds.length + ' pallet label(s) out of ' + palletIds.length + ' pallet(s)');
      if (errors.length > 0) {
        log.warning('onRequest', 'Some pallets failed to generate labels: ' + errors.join('; '));
      }
      
      // Build file name: {poNumber}_{locationName}_all_pallet_labels.pdf
      var fileName = '';
      if (poNumber) {
        fileName += poNumber;
      }
      if (locationName) {
        if (fileName) {
          fileName += '_' + locationName;
        } else {
          fileName += locationName;
        }
      }
      fileName += '_all_pallet_labels.pdf';
      
      // Remove invalid characters for file names
      fileName = fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
      
      log.debug('onRequest', 'Merging ' + fileIds.length + ' PDF(s) into: ' + fileName);
      
      // Merge PDFs using PDF merger library
      // Note: mergePDFs returns a Promise - handle all response writing inside the callback
      var mergeResult = pdfMerger.mergePDFs(fileIds, fileName, PDF_FOLDER_ID);
      
      if (!mergeResult || typeof mergeResult.then !== 'function') {
        var errorMsg = 'PDF merger did not return a Promise';
        log.error('onRequest', errorMsg);
        if (shouldRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write({
            output: JSON.stringify({
              success: false,
              error: errorMsg
            })
          });
        }
        return;
      }
      
      // Handle Promise - do all work inside the callback
      mergeResult.then(function(result) {
        if (!result || !result.success) {
          var errorMsg = 'Failed to merge PDFs: ' + (result ? result.error : 'Unknown error');
          log.error('onRequest', errorMsg);
          if (shouldRedirect) {
            response.sendRedirect({
              type: record.Type.ITEM_FULFILLMENT,
              id: ifId
            });
          } else {
            response.write({
              output: JSON.stringify({
                success: false,
                error: errorMsg
              })
            });
          }
          return;
        }
        
        var mergedFileId = result.fileId;
        var mergedPdfUrl = result.pdfUrl || '';
        
        log.debug('onRequest', 'PDFs merged successfully, file ID: ' + mergedFileId);
        
        // Attach merged PDF to IF
        try {
          record.attach({
            record: {
              type: 'file',
              id: mergedFileId
            },
            to: {
              type: 'itemfulfillment',
              id: ifId
            }
          });
          log.debug('onRequest', 'Successfully attached merged PDF to IF');
        } catch (attachError) {
          log.error('onRequest', 'Error attaching merged PDF: ' + attachError.toString());
          // Continue - attachment failure shouldn't stop the process
        }
        
        // Set custbody_merged_pallet_labels field with URL
        if (mergedPdfUrl) {
          try {
            record.submitFields({
              type: 'itemfulfillment',
              id: ifId,
              values: {
                custbody_merged_pallet_labels: mergedPdfUrl
              },
              options: {
                enableSourcing: false,
                ignoreMandatoryFields: true
              }
            });
            log.audit('onRequest', 'Successfully processed ' + fileIds.length + ' pallet label(s). Merged PDF URL: ' + mergedPdfUrl);
          } catch (updateError) {
            log.error('onRequest', 'Error updating IF field with merged PDF URL: ' + updateError.toString());
            // Continue - field update failure shouldn't stop the process
          }
        }
        
        // Return success response
        log.audit('onRequest', '=== SUCCESS ===');
        log.audit('onRequest', 'Successfully generated and merged ' + fileIds.length + ' pallet label(s) for IF: ' + ifTranId);
        
        if (shouldRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write({
            output: JSON.stringify({
              success: true,
              message: 'Successfully generated and merged ' + fileIds.length + ' pallet label(s)',
              fileId: mergedFileId,
              pdfUrl: mergedPdfUrl,
              palletsProcessed: fileIds.length,
              totalPallets: palletIds.length,
              tranId: ifTranId
            })
          });
        }
      }).catch(function(error) {
        log.error('onRequest', 'Error in merge Promise: ' + error.toString());
        if (shouldRedirect) {
          response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } else {
          response.write({
            output: JSON.stringify({
              success: false,
              error: 'Error merging PDFs: ' + error.toString()
            })
          });
        }
      });
      
    } catch (e) {
      log.error('onRequest', '=== EXCEPTION OCCURRED ===');
      log.error('onRequest', 'Error: ' + e.toString());
      log.error('onRequest', 'Stack trace: ' + (e.stack || 'N/A'));
      
      var shouldRedirect = context.request.parameters.redirect === 'T' || context.request.parameters.redirect === 'true';
      var ifId = context.request.parameters.ifid;
      
      if (shouldRedirect && ifId) {
        try {
          context.response.sendRedirect({
            type: record.Type.ITEM_FULFILLMENT,
            id: ifId
          });
        } catch (redirectError) {
          log.error('onRequest', 'Error during redirect: ' + redirectError.toString());
        }
      } else {
        context.response.write({
          output: JSON.stringify({
            success: false,
            error: 'Internal server error: ' + e.toString()
          })
        });
      }
    }
  }
  
  return {
    onRequest: onRequest
  };
});

