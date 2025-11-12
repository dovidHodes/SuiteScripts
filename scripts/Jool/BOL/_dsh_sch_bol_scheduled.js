/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * 
 * RECOMMENDED: Scheduled script using library script for BOL generation.
 * This is the best approach - no HTTP calls, direct function calls.
 */

define([
  'N/search',
  'N/runtime',
  'N/log',
  './_dsh_lib_bol_generator'  // Library script with shared logic
], function (search, runtime, log, bolLib) {
  
  function execute(context) {
    try {
      // Get PDF folder ID from script parameter
      var pdfFolderId = runtime.getCurrentScript().getParameter({
        name: 'custscript_dsh_bol_folder_id'
      }) || 1373;
      
      // Get template ID from script parameter (optional)
      var templateId = runtime.getCurrentScript().getParameter({
        name: 'custscript_dsh_bol_template_id'
      }) || 'CUSTTMPL_DSH_SVC_BOL';
      
      // Find IFs that need BOL generation
      var ifSearch = search.create({
        type: 'itemfulfillment',
        filters: [
          ['custbody_sps_billofladingnumber', 'isempty', ''],
          'AND',
          ['shipstatus', 'anyof', 'C'] // Shipped
        ],
        columns: ['internalid']
      });
      
      var results = ifSearch.run().getRange({ start: 0, end: 100 });
      
      log.audit('BOL Scheduled', 'Found ' + results.length + ' IFs to process');
      
      var successCount = 0;
      var errorCount = 0;
      
      // Process each IF
      for (var i = 0; i < results.length; i++) {
        try {
          var ifId = results[i].id;
          
          log.audit('BOL Scheduled', 'Processing IF: ' + ifId);
          
          // Call library function directly - no HTTP needed!
          var result = bolLib.generateAndAttachBOL(ifId, pdfFolderId, templateId);
          
          if (result.success) {
            successCount++;
            log.audit('BOL Scheduled', 'Successfully generated BOL for IF: ' + ifId + ', File ID: ' + result.fileId);
          } else {
            errorCount++;
            log.error('BOL Scheduled', 'Failed for IF ' + ifId + ': ' + result.error);
          }
          
        } catch (error) {
          errorCount++;
          log.error('BOL Scheduled', 'Error processing IF ' + results[i].id + ': ' + error.message);
        }
      }
      
      log.audit('BOL Scheduled', 'Complete. Success: ' + successCount + ', Errors: ' + errorCount);
      
    } catch (error) {
      log.error('BOL Scheduled Error', error);
    }
  }
  
  return {
    execute: execute
  };
});

