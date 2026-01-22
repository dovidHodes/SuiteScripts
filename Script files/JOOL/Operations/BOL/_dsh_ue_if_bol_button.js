/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event Script to add "Generate BOL" button on Item Fulfillment record.
 */
define(['N/record', 'N/log'], function (record, log) {
  
  function beforeLoad(context) {
    try {
      // Only show button on view mode
      if (context.type !== context.UserEventType.VIEW) {
        return;
      }
      
      var rec = context.newRecord;
      var form = context.form;
      
      // Optional: Add conditions to show button only when needed
      // var status = rec.getValue('shipstatus');
      // if (status !== 'C') return; // Only show for shipped IFs
      
      // Set client script module path BEFORE adding button
      form.clientScriptModulePath = './_dsh_cs_single_bol_button.js';
      
      // Add button with function call including record ID
      form.addButton({
        id: 'custpage_generate_bol_btn',
        label: 'Generate BOL',
        functionName: 'generateBOL(' + rec.id + ')'
      });
      
    } catch (error) {
      log.error('beforeLoad Error', error);
    }
  }
  
  return {
    beforeLoad: beforeLoad
  };
});

