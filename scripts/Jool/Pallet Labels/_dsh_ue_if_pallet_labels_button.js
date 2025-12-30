/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event Script to add "Generate Pallet Labels" button on Item Fulfillment record.
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
      
      // Set client script module path BEFORE adding button
      form.clientScriptModulePath = './_dsh_cs_pallet_labels_button.js';
      
      // Add button with function call including record ID
      form.addButton({
        id: 'custpage_generate_pallet_labels_btn',
        label: 'Generate Pallet Labels',
        functionName: 'generatePalletLabels(' + rec.id + ')'
      });
      
    } catch (error) {
      log.error('beforeLoad Error', error);
    }
  }
  
  return {
    beforeLoad: beforeLoad
  };
});

