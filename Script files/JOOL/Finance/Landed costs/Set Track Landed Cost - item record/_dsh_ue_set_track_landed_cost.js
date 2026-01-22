/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event script that automatically sets the 'tracklandedcost' field to true
 * when an Item record is created.
 * 
 * Deployment: Set "Applies To" to Item
 */

define([
    'N/record',
    'N/log'
], function(record, log) {
    
    /**
     * Function executed before record is submitted
     * Sets tracklandedcost field to true on item create
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record being created
     * @param {string} scriptContext.type - Trigger type (create, edit, etc.)
     */
    function beforeSubmit(scriptContext) {
        try {
            var newRecord = scriptContext.newRecord;
            var recordType = newRecord.type;
            
            // Only process Item records
            if (recordType !== record.Type.INVENTORY_ITEM && 
                recordType !== record.Type.NON_INVENTORY_ITEM &&
                recordType !== record.Type.SERVICE_ITEM &&
                recordType !== record.Type.KIT_ITEM &&
                recordType !== record.Type.ASSEMBLY_ITEM) {
                return;
            }
            
            var itemId = newRecord.id;
            var itemName = newRecord.getValue('itemid') || newRecord.getValue('name') || itemId;
            
            // Set tracklandedcost to true
            newRecord.setValue({
                fieldId: 'tracklandedcost',
                value: true
            });
            
            log.audit('beforeSubmit', 'Set tracklandedcost to true for Item: ' + itemName + ' (ID: ' + itemId + ')');
            
        } catch (e) {
            log.error('beforeSubmit', 'Error setting tracklandedcost: ' + e.toString());
            log.error('beforeSubmit', 'Stack trace: ' + e.stack);
        }
    }
    
    return {
        beforeSubmit: beforeSubmit
    };
});


