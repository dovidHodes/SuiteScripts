/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @description Suitelet to calculate and assign pallets to SPS packages
 * 
 * Takes IF ID as parameter, calls library to calculate pallets and create records,
 * then submits package assigner MR to link packages to pallets.
 */

define([
  'N/log',
  'N/record',
  'N/runtime',
  'N/http',
  'N/task',
  './_dsh_lib_create_and_link_pallets'
], function (log, record, runtime, http, task, palletLib) {
  
  function onRequest(context) {
    // Track governance usage for entire Suitelet
    var suiteletUsageStart = runtime.getCurrentScript().getRemainingUsage();
    
    try {
      var request = context.request;
      var response = context.response;
      
      if (request.method === 'GET') {
        var ifId = request.parameters.ifid;
        var shouldRedirect = request.parameters.redirect === 'T' || request.parameters.redirect === 'true';
        
        if (!ifId) {
          // Always return JSON error if IF ID is missing (can't redirect without ID)
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
        var result = palletLib.calculateAndCreatePallets(ifId);
        
        // Submit package assigner MR if library call was successful
        var mrTaskId = null;
        if (result.success && result.errors.length === 0 && result.palletAssignments.length > 0) {
          // Round-robin through deployments customdeploy20-29 (10 deployments)
          var startDeploy = 20;
          var endDeploy = 29;
          var numDeployments = endDeploy - startDeploy + 1;
          
          // Use hash of current time to cycle through deployments
          var now = new Date();
          var timeHash = (now.getTime() % numDeployments);
          var startIndex = timeHash;
          
          var mrScriptId = 'customscript_assign_packages_to_pallets';
          var assignmentData = {
            ifId: result.ifId,
            ifTranId: result.ifTranId,
            palletAssignments: result.palletAssignments,
            itemVpnMap: result.itemVpnMap,
            totalPallets: result.totalPallets
          };
          
          var submitted = false;
          var lastError = null;
          
          // Try deployments in round-robin order
          for (var attempt = 0; attempt < numDeployments && !submitted; attempt++) {
            var deployIndex = (startIndex + attempt) % numDeployments;
            var mrDeployId = 'customdeploy' + (startDeploy + deployIndex);
            
            try {
              var mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: mrScriptId,
                deploymentId: mrDeployId,
                params: {
                  custscriptjson: JSON.stringify(assignmentData)
                }
              });
              
              mrTaskId = mrTask.submit();
              log.audit('Suitelet', 'IF ' + ifId + ' - Package assigner MR submitted. Task ID: ' + mrTaskId + ', Deployment: ' + mrDeployId);
              submitted = true;
              
            } catch (submitError) {
              var errorName = submitError.name || '';
              lastError = submitError;
              
              if (errorName === 'MAP_REDUCE_ALREADY_RUNNING') {
                log.debug('Suitelet', 'IF ' + ifId + ' - Deployment ' + mrDeployId + ' busy, trying next deployment');
                // Continue to next deployment
              } else {
                log.debug('Suitelet', 'IF ' + ifId + ' - Deployment ' + mrDeployId + ' error: ' + submitError.toString() + ', trying next deployment');
                // Continue to next deployment
              }
            }
          }
          
          if (!submitted) {
            // All deployments failed
            var errorName = lastError ? (lastError.name || '') : '';
            if (errorName === 'MAP_REDUCE_ALREADY_RUNNING') {
              log.audit('Suitelet', 'IF ' + ifId + ' - All package assigner MR deployments (customdeploy20-29) are busy');
              result.warnings.push('All package assigner MR deployments are busy. Pallets created but MR not submitted.');
            } else {
              var errorMsg = 'Failed to submit package assigner MR to any deployment (customdeploy20-29): ' + (lastError ? lastError.toString() : 'Unknown error');
              log.error('Suitelet', errorMsg);
              result.errors.push(errorMsg);
              result.success = false;
            }
          }
        } else if (result.palletAssignments.length === 0) {
          log.warning('Suitelet', 'IF ' + ifId + ' - No pallets created, skipping MR submission');
        }
        
        log.audit('Suitelet Complete', 'IF: ' + ifId + ', Success: ' + result.success);
        
        // If redirect parameter is T, redirect to IF; otherwise return JSON
        if (shouldRedirect) {
          // Use result.ifId (the ID actually used by library) or fall back to original ifId
          var redirectId = result.ifId || ifId;
          
          // Convert to number - NetSuite internal IDs must be numbers
          if (redirectId) {
            if (typeof redirectId === 'string') {
              redirectId = redirectId.trim();
              if (/^\d+$/.test(redirectId)) {
                redirectId = parseInt(redirectId, 10);
              }
            }
            
            // Ensure it's a valid positive number
            if (typeof redirectId === 'number' && !isNaN(redirectId) && redirectId > 0) {
              try {
                response.sendRedirect({
                  type: http.RedirectType.RECORD,
                  identifier: record.Type.ITEM_FULFILLMENT,
                  id: redirectId,
                  editMode: false
                });
                return; // Exit function after redirect
              } catch (redirectError) {
                log.error('Redirect Error', 'Failed to redirect to IF ' + redirectId + ': ' + redirectError.toString());
                // Fall through to return JSON instead
              }
            } else {
              log.error('Redirect Failed', 'Invalid IF ID: ' + String(redirectId) + ' (type: ' + typeof redirectId + ', isNaN: ' + isNaN(redirectId) + ')');
            }
          } else {
            log.error('Redirect Failed', 'No IF ID available for redirect');
          }
        }
        
        // Return JSON result (when redirect=F or no redirect parameter)
        var sanitizedResult = {
          success: result.success || false,
          ifId: result.ifId || '',
          ifTranId: result.ifTranId || '',
          palletsCreated: result.palletsCreated || 0,
          totalPallets: result.totalPallets || 0,
          palletAssignments: result.palletAssignments || [],
          itemSummary: result.itemSummary || {},
          errors: result.errors || [],
          warnings: result.warnings || [],
          mrTaskId: mrTaskId || null
        };
        
        response.write({
          output: JSON.stringify(sanitizedResult, null, 2)
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
      log.error('Suitelet Error', error);
      response.write({
        output: JSON.stringify({
          success: false,
          error: error.message || error.toString()
        })
      });
    } finally {
      // Log total Suitelet governance usage
      var suiteletUsageEnd = runtime.getCurrentScript().getRemainingUsage();
      var suiteletTotalUsage = suiteletUsageStart - suiteletUsageEnd;
      log.audit('Suitelet Governance', 'Total Suitelet governance used: ' + suiteletTotalUsage + ' units (Started with: ' + suiteletUsageStart + ', Remaining: ' + suiteletUsageEnd + ')');
    }
  }
  
  return {
    onRequest: onRequest
  };
});

