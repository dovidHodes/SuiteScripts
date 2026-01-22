/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event Script to add "Create Integrated Shipping Labels" button on Item Fulfillment record.
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
      form.clientScriptModulePath = './_dsh_cs_integrated_labels_button.js';
      
      // Add button with function call including record ID
      form.addButton({
        id: 'custpage_create_integrated_labels_btn',
        label: 'Create Integrated Shipping Labels',
        functionName: 'createIntegratedLabels(' + rec.id + ')'
      });
      
    } catch (error) {
      log.error('beforeLoad Error', error);
    }
  }
  
  return {
    beforeLoad: beforeLoad
  };
});

