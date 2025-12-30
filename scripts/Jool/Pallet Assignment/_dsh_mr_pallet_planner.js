/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @description Map/Reduce script to orchestrate pallet creation for multiple IFs
 * 
 * This script:
 * 1. Receives up to 50 IF IDs from scheduler
 * 2. Splits IFs into chunks of 5
 * 3. For each chunk:
 *    - Calls library for all IFs in chunk to create pallets
 *    - Submits all IFs together to package assigner MR using jobs[] format
 *    - Uses deployments customdeploy10-19 for MR based on chunk number
 */

define([
  'N/runtime',
  'N/log',
  'N/task',
  'N/record',
  './_dsh_lib_create_and_link_pallets'
], function (runtime, log, task, record, palletLib) {
  
  /**
   * Gets input data - receives IF IDs, splits into chunks of 5 IFs each
   * @param {Object} inputContext
   * @returns {Array} Array of chunk objects with chunk index, each containing up to 5 IF IDs
   */
  function getInputData(inputContext) {
    try {
      var jsonParam = runtime.getCurrentScript().getParameter({ name: 'custscriptif_ids_json' });
      
      if (!jsonParam) {
        log.error('getInputData', 'No IF IDs parameter found (custscriptif_ids_json)');
        return [];
      }
      
      var payload = JSON.parse(jsonParam);
      var ifIds = payload.ifIds || [];
      
      log.audit('getInputData', 'Received ' + ifIds.length + ' IF ID(s)');
      
      if (ifIds.length === 0) {
        log.debug('getInputData', 'No IF IDs provided');
        return [];
      }
      
      // Split into chunks of 5
      var chunks = [];
      for (var i = 0; i < ifIds.length; i += 5) {
        var chunkIndex = Math.floor(i / 5);  // 0-based chunk index
        var chunk = {
          ifIds: ifIds.slice(i, i + 5),
          chunkIndex: chunkIndex
        };
        chunks.push(chunk);
        log.debug('getInputData', 'Created chunk ' + (chunkIndex + 1) + ' with ' + chunk.ifIds.length + ' IF(s)');
      }
      
      log.audit('getInputData', 'Split into ' + chunks.length + ' chunk(s) of up to 5 IFs each');
      return chunks;
      
    } catch (e) {
      log.error('getInputData', 'Error getting input data: ' + e.toString());
      throw e;
    }
  }
  
  /**
   * Map function - processes one chunk (up to 5 IFs), batches all IFs together
   * @param {Object} mapContext
   */
  function map(mapContext) {
    try {
      // Get chunk from input data
      var chunk = typeof mapContext.value === 'string' 
        ? JSON.parse(mapContext.value) 
        : mapContext.value;
      
      if (!chunk || !chunk.ifIds || chunk.ifIds.length === 0) {
        log.error('map', 'Invalid chunk data: ' + JSON.stringify(mapContext.value));
        return;
      }
      
      var ifIds = chunk.ifIds;
      var chunkIndex = chunk.chunkIndex || 0;
      var deploymentId = 'customdeploy' + (10 + chunkIndex);  // customdeploy10 through customdeploy19
      
      log.audit('map', 'Processing chunk ' + (chunkIndex + 1) + ' with ' + ifIds.length + ' IF(s), deployment: ' + deploymentId);
      
      // Step 1: Process all IFs in chunk and collect results
      var jobs = [];
      var processedIfIds = [];
      
      for (var i = 0; i < ifIds.length; i++) {
        var ifId = ifIds[i];
        
        try {
          log.audit('map', 'Processing IF: ' + ifId);
          
          // Call library to create pallets and receive payload
          var result = palletLib.calculateAndCreatePallets(ifId);
          
          // Check for errors
          if (!result.success || result.errors.length > 0) {
            log.error('map', 'IF ' + ifId + ' - Library call failed. Errors: ' + JSON.stringify(result.errors));
            // Continue to next IF - don't include in batch
            continue;
          }
          
          if (result.palletAssignments.length === 0) {
            log.debug('map', 'IF ' + ifId + ' - No pallets created, skipping');
            continue;
          }
          
          // Add to jobs array for batch submission
          jobs.push({
            ifId: result.ifId,
            ifTranId: result.ifTranId,
            palletAssignments: result.palletAssignments,
            itemVpnMap: result.itemVpnMap,
            totalPallets: result.totalPallets
          });
          
          processedIfIds.push(ifId);
          // Emit to output for tracking completion
          mapContext.write({
            key: result.ifId,
            value: JSON.stringify({
              ifId: result.ifId,
              ifTranId: result.ifTranId,
              palletsCreated: result.palletsCreated || result.totalPallets || 0,
              status: 'created'
            })
          });
          
        } catch (ifError) {
          log.error('map', 'Error processing IF ' + ifId + ': ' + ifError.toString());
          // Continue to next IF
        }
      }
      
      if (jobs.length === 0) {
        return;
      }
      
      try {
        // Submit all IFs in this chunk together using jobs[] format
        var assignmentData = {
          jobs: jobs
        };
        
        var mrTask = task.create({
          taskType: task.TaskType.MAP_REDUCE,
          scriptId: 'customscript_assign_packages_to_pallets',
          deploymentId: deploymentId,
          params: {
            custscriptjson: JSON.stringify(assignmentData)
          }
        });
        
        var taskId = mrTask.submit();
        log.audit('map', 'Chunk ' + (chunkIndex + 1) + ' - Package assigner MR submitted. Task ID: ' + taskId + ', Deployment: ' + deploymentId + ', IFs: ' + jobs.length);
        
        
      } catch (submitError) {
        var errorName = submitError.name || '';
        
        if (errorName === 'MAP_REDUCE_ALREADY_RUNNING') {
          log.audit('map', 'Chunk ' + (chunkIndex + 1) + ' - Deployment ' + deploymentId + ' busy, will retry on next scheduler run');
          // Do NOT mark any IFs as processed - let them retry
          // All IFs in this chunk will be retried on the next scheduler run
        } else {
          log.error('map', 'Chunk ' + (chunkIndex + 1) + ' - Failed to submit MR: ' + submitError.toString());
          // Do NOT mark any IFs as processed - let them retry
        }
      }
      
    } catch (e) {
      log.error('map', 'Error in map function: ' + e.toString());
    }
  }
  
  /**
   * Reduce function - passes through map output to final output for summarize
   * @param {Object} reduceContext
   */
  function reduce(reduceContext) {
    try {
      // Pass through the map output to final output so summarize can read it
      // The key is the IF ID, value is the completion data
      if (reduceContext.values && reduceContext.values.length > 0) {
        // Get the first value (should be the same for all values with same key)
        var value = reduceContext.values[0];
        reduceContext.write({
          key: reduceContext.key,
          value: value
        });
      }
    } catch (e) {
      log.error('reduce', 'Error in reduce function: ' + e.toString());
    }
  }
  
  /**
   * Summary function - logs final statistics and sets pallet notes field
   * @param {Object} summaryContext
   */
  function summarize(summaryContext) {
    try {
      var usage = summaryContext.usage;
      var mapErrors = summaryContext.mapErrors || [];
      var reduceErrors = summaryContext.reduceErrors || [];
      var output = summaryContext.output;
      
      if (mapErrors.length > 0 || reduceErrors.length > 0) {
        log.audit('summarize', 'Map usage: ' + usage + ' units, Map errors: ' + mapErrors.length + ', Reduce errors: ' + reduceErrors.length);
        if (mapErrors.length > 0) log.error('summarize', 'Map errors: ' + JSON.stringify(mapErrors));
        if (reduceErrors.length > 0) log.error('summarize', 'Reduce errors: ' + JSON.stringify(reduceErrors));
      }
      
      // Process output to track pallet creation completion
      // Collect all IFs that had pallets created successfully
      var ifCompletionMap = {}; // {ifId: {ifTranId, palletsCreated}}
      
      if (output) {
        try {
          var outputIterator = null;
          if (typeof output.iterator === 'function') {
            outputIterator = output.iterator();
          } else if (output && typeof output === 'object') {
            outputIterator = output;
          }
          
          if (outputIterator && typeof outputIterator.hasNext === 'function') {
            while (outputIterator.hasNext()) {
              var outputData = outputIterator.next();
              var ifId = outputData.key;
              var valueStr = outputData.value;
              
              try {
                var value = JSON.parse(valueStr);
                if (value.status === 'created' && value.ifId && value.palletsCreated > 0) {
                  // Store the IF completion data (use latest if duplicate)
                  ifCompletionMap[ifId] = {
                    ifId: value.ifId,
                    ifTranId: value.ifTranId || value.ifId,
                    palletsCreated: value.palletsCreated
                  };
                }
              } catch (parseError) {
                log.debug('summarize', 'Error parsing output value for IF ' + ifId + ': ' + parseError.toString());
              }
            }
          }
        } catch (outputError) {
          log.error('summarize', 'Error processing output: ' + outputError.toString());
        }
      }
      
      // Set pallet notes field for each IF that had pallets created
      var notesSetCount = 0;
      var notesErrorCount = 0;
      
      for (var ifId in ifCompletionMap) {
        var completion = ifCompletionMap[ifId];
        var palletsCreated = completion.palletsCreated;
        var ifTranId = completion.ifTranId;
        
        try {
          // Set pallet notes field: "X pallets created. Finished pallet creation"
          var palletNotes = palletsCreated + ' pallet' + (palletsCreated !== 1 ? 's' : '') + ' created. Finished pallet creation';
          
          record.submitFields({
            type: 'itemfulfillment',
            id: ifId,
            values: {
              custbody_pallet_notes: palletNotes
            },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          
          notesSetCount++;
          
        } catch (fieldError) {
          notesErrorCount++;
          log.error('summarize', 'IF ' + ifTranId + ' (ID: ' + ifId + ') - Error setting pallet notes field: ' + fieldError.toString());
          // Continue processing other IFs even if one fails
        }
      }
      
      if (Object.keys(ifCompletionMap).length > 0) {
        log.audit('summarize', 'Set pallet notes: ' + notesSetCount + ' IF(s), Errors: ' + notesErrorCount);
      }
      
    } catch (e) {
      log.error('summarize', 'Error in summarize function: ' + e.toString());
    }
  }
  
  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize
  };
  
});

