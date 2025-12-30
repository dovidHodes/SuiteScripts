/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * @description Scheduled script to find Item Fulfillments that need pallet creation and hand off to planner MR
 * 
 * Search criteria:
 * - Entity has custentity_auto_create_pallets = true
 * - custbody_pallets_created_and_requested = false (not yet processed)
 * - custbody_request_type = 1 (pallet type routing request)
 * - custbody_sps_package_notes contains "created"
 * - custbody_requested_autopack = true
 * - trandate on or after November 1, 2025 (hardcoded date: 11/01/2025)
 * 
 * Handles up to 50 IF IDs per run to planner MR.
 */

define([
  'N/search',
  'N/log',
  'N/task',
  'N/runtime',
  'N/record'
], function (search, log, task, runtime, record) {
  
  /**
   * Executes when the scheduled script is triggered
   * @param {Object} scriptContext
   */
  function execute(scriptContext) {
    log.audit('execute', 'Starting scheduled script to find IFs for pallet creation');
    
    // Step 1: Search for entities where custentity_auto_create_pallets = true
    var entityIds = [];
    try {
      log.debug('execute', 'Step 1: Searching for entities with custentity_auto_create_pallets = true');
      var entitySearch = search.create({
        type: search.Type.CUSTOMER,
        filters: [
          ['custentity_auto_create_pallets', 'is', 'T']
        ],
        columns: [
          search.createColumn({
            name: 'internalid'
          })
        ]
      });
      
      var entitySearchResults = entitySearch.run();
      entitySearchResults.each(function(result) {
        var entityId = result.id;
        entityIds.push(entityId);
        return true;
      });
      
      log.debug('execute', 'Found ' + entityIds.length + ' entity/ies with custentity_auto_create_pallets = true');
      
      if (entityIds.length === 0) {
        log.audit('execute', 'No entities found with custentity_auto_create_pallets = true, exiting');
        return;
      }
    } catch (e) {
      log.error('execute', 'Error searching for entities: ' + e.toString());
      return;
    }
    
    // Step 2: Search for IFs with criteria
    log.debug('execute', 'Step 2: Creating IF search with ' + entityIds.length + ' entity/ies');
    
    // Use string date format for NetSuite search: MM/DD/YYYY
    // Date objects can cause UNEXPECTED_ERROR in search filters
    // Format must be exactly MM/DD/YYYY (e.g., '11/01/2025')
    var cutoffDateStr = '11/01/2025';
    log.debug('execute', 'Date filter: Only processing IFs with trandate on or after ' + cutoffDateStr);
    
    var ifSearch = search.create({
      type: search.Type.ITEM_FULFILLMENT,
      filters: [
        ['mainline', 'is', 'T'],  // Only get header records, not line items
        'AND',
        ['entity', 'anyof', entityIds],
        'AND',
        ['custbody_pallets_created_and_requested', 'is', 'F'],
        'AND',
        ['custbody_request_type', 'is', 1],  // Pallet type (numeric, not string)
        'AND',
        ['trandate', search.Operator.ONORAFTER, cutoffDateStr]  // After 11/01/2025 (MM/DD/YYYY string format)
      ],
      columns: [
        search.createColumn({
          name: 'internalid'
        }),
        search.createColumn({
          name: 'tranid'
        }),
        search.createColumn({
          name: 'custbody_sps_package_notes'
        })
      ]
    });
    
    log.debug('execute', 'IF search created successfully');
    
    // Step 3: Collect up to 50 IF IDs
    var ifIds = [];
    var processedIFIds = {}; // Track processed IF IDs to prevent duplicates
    
    try {
      log.debug('execute', 'Step 3: Running IF search');
      var pagedData = ifSearch.runPaged({ pageSize: 1000 });
      var pageRanges = pagedData.pageRanges;
      
      log.audit('execute', 'Found ' + pagedData.count + ' item fulfillment(s) matching criteria');
      log.debug('execute', 'Search returned ' + pageRanges.length + ' page(s)');
      
      // Process each page
      for (var i = 0; i < pageRanges.length && ifIds.length < 50; i++) {
        log.debug('execute', 'Processing page ' + (i + 1) + ' of ' + pageRanges.length);
        var page = pagedData.fetch({ index: i });
        log.debug('execute', 'Page ' + (i + 1) + ' has ' + page.data.length + ' result(s)');
        
        page.data.forEach(function(result) {
          // Stop if we've reached 50 IFs
          if (ifIds.length >= 50) {
            return;
          }
          
          var ifId = result.id;
          var tranId = result.getValue('tranid') || ifId;
          
          try {
            // Convert to string for consistent comparison
            var ifIdStr = String(ifId);
            
            // Check if we've already processed this IF in this execution
            if (processedIFIds[ifIdStr]) {
              log.debug('execute', 'IF ' + tranId + ' (ID: ' + ifId + ') already processed in this execution, skipping duplicate');
              return;
            }
            
            // Check if package notes contains "created" (from search result)
            var packageNotes = result.getValue('custbody_sps_package_notes') || '';
            if (packageNotes.toLowerCase().indexOf('created') === -1) {
              log.debug('execute', 'IF ' + tranId + ' - Package notes does not contain "created", skipping');
              processedIFIds[ifIdStr] = true;
              return;
            }
            
            // Double-check custbody_pallets_created_and_requested field by loading the record
            // This prevents processing IFs that were just set to true by another concurrent execution
            try {
              var ifRecordCheck = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId,
                isDynamic: false
              });
              var alreadyProcessed = ifRecordCheck.getValue('custbody_pallets_created_and_requested');
              
              if (alreadyProcessed) {
                log.debug('execute', 'IF ' + tranId + ' - Already processed (custbody_pallets_created_and_requested = true), skipping');
                processedIFIds[ifIdStr] = true;
                return;
              }
            } catch (e) {
              log.error('execute', 'Error loading IF ' + tranId + ' to check field: ' + e.toString());
              // If we can't load it, skip to be safe
              return;
            }
            
            log.debug('execute', 'Adding IF: ' + tranId + ' (ID: ' + ifId + ')');
            ifIds.push(ifId);
            processedIFIds[ifIdStr] = true;
            
          } catch (e) {
            log.error('execute', 'Error processing IF ' + tranId + ': ' + e.toString());
          }
        });
      }
      
    } catch (e) {
      log.error('execute', 'Error running IF search: ' + e.toString());
      return;
    }
    
    if (ifIds.length === 0) {
      log.audit('execute', 'No eligible IFs found, exiting');
      return;
    }
    
    log.audit('execute', 'Found ' + ifIds.length + ' eligible IF(s) to process');
    
    // Step 4: Submit planner MR with IF IDs
    try {
      log.debug('execute', 'Step 4: Submitting planner MR with ' + ifIds.length + ' IF ID(s)');
      
      var plannerTask = task.create({
        taskType: task.TaskType.MAP_REDUCE,
        scriptId: 'customscript_create_pallets_from_sch_mr',
        deploymentId: 'customdeploy1',
        params: {
          custscriptif_ids_json: JSON.stringify({ ifIds: ifIds })
        }
      });
      
      var taskId = plannerTask.submit();
      log.audit('execute', 'Planner MR submitted successfully. Task ID: ' + taskId + ', IFs: ' + ifIds.length);
      
      // Step 5: Mark IFs as processed immediately to prevent duplicate processing
      // This prevents the scheduler from picking up the same IFs again if MR takes a long time
      var markedCount = 0;
      var markErrorCount = 0;
      
      for (var i = 0; i < ifIds.length; i++) {
        var ifId = ifIds[i];
        try {
          record.submitFields({
            type: 'itemfulfillment',
            id: ifId,
            values: {
              'custbody_pallets_created_and_requested': true
            },
            options: {
              enableSourcing: false,
              ignoreMandatoryFields: true
            }
          });
          markedCount++;
          log.debug('execute', 'IF ' + ifId + ' - Marked as processed (custbody_pallets_created_and_requested = true)');
        } catch (markError) {
          markErrorCount++;
          log.error('execute', 'IF ' + ifId + ' - Failed to mark as processed: ' + markError.toString());
          // Continue - don't fail the whole batch
        }
      }
      
      log.audit('execute', 'Marked ' + markedCount + ' of ' + ifIds.length + ' IF(s) as processed. Errors: ' + markErrorCount);
      
    } catch (e) {
      log.error('execute', 'Error submitting planner MR: ' + e.toString());
      // Do NOT mark IFs as processed if MR submission fails
    }
  }
  
  return {
    execute: execute
  };
  
});

