/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event script that sets custbody_shipped datetime field on Item Fulfillments
 * when the record is marked as shipped and the field is empty.
 * 
 * Sets the field to the current datetime when the edit was made (when record was saved).
 * 
 * Deployment: Set "Applies To" to Item Fulfillment
 */

define([
    'N/record',
    'N/log'
], function(record, log) {
    
    /**
     * Function executed after record is saved
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record that was saved
     * @param {string} scriptContext.type - Trigger type (create, edit, etc.)
     */
    function afterSubmit(scriptContext) {
        try {
            var newRecord = scriptContext.newRecord;
            var recordType = newRecord.type;
            
            // Only process Item Fulfillments
            if (recordType !== record.Type.ITEM_FULFILLMENT) {
                return;
            }
            
            var ifId = newRecord.id;
            var tranId = newRecord.getValue('tranid') || ifId;
            
            // Check if record is shipped
            var shipDate = newRecord.getValue('shipdate');
            var shipStatus = newRecord.getValue('shipstatus');
            var customShippedDate = newRecord.getValue('custbody_shipped');
            
            // Debug: Log the values to see what we're getting
            log.debug('afterSubmit', 'IF ' + tranId + ' - shipDate: ' + shipDate + ' (type: ' + typeof shipDate + ')');
            log.debug('afterSubmit', 'IF ' + tranId + ' - shipStatus: ' + shipStatus + ' (type: ' + typeof shipStatus + ')');
            log.debug('afterSubmit', 'IF ' + tranId + ' - customShippedDate: ' + customShippedDate + ' (type: ' + typeof customShippedDate + ')');
            
            // Only process if shipped AND custom field is empty
            // shipStatus 'C' = Closed/Shipped in NetSuite
            if ((shipDate || shipStatus === 'C') && !customShippedDate) {
                log.debug('afterSubmit', 'IF ' + tranId + ' is shipped and custbody_shipped is empty, setting datetime');
                
                // Get current datetime (when this edit was made)
                var currentDateTime = new Date();
                
                // Load and update the record
                var ifRecord = record.load({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ifId,
                    isDynamic: true
                });
                
                // Set the custom shipped datetime field
                ifRecord.setValue({
                    fieldId: 'custbody_shipped',
                    value: currentDateTime
                });
                
                // Save the record
                ifRecord.save({
                    enableSourcing: false,
                    ignoreMandatoryFields: true
                });
                
                log.audit('afterSubmit', 'Set custbody_shipped datetime for IF ' + tranId + ' to ' + currentDateTime);
            } else {
                if (customShippedDate) {
                    log.debug('afterSubmit', 'IF ' + tranId + ' already has custbody_shipped set, skipping');
                } else {
                    log.debug('afterSubmit', 'IF ' + tranId + ' is not shipped - shipDate: ' + shipDate + ', shipStatus: ' + shipStatus + ', skipping');
                }
            }
            
        } catch (e) {
            log.error('afterSubmit', 'Error in afterSubmit: ' + e.toString());
            log.error('afterSubmit', 'Stack trace: ' + e.stack);
        }
    }
    
    return {
        afterSubmit: afterSubmit
    };
});

