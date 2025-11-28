/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event script that syncs Item Fulfillment transaction dates with Invoice dates
 * when an invoice is created and the invoice date is in a different month than the IF date.
 * 
 * When an invoice is created:
 * - Gets the Sales Order from the invoice's createdfrom field
 * - Finds all Item Fulfillments created from that Sales Order
 * - If invoice date is in a different month than the IF trandate, updates IF trandate to match invoice date
 * 
 * Deployment: Set "Applies To" to Invoice
 */

define([
    'N/record',
    'N/search',
    'N/log'
], function(record, search, log) {
    
    /**
     * Function executed after invoice is saved
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New invoice record that was saved
     * @param {string} scriptContext.type - Trigger type (create, edit, etc.)
     */
    function afterSubmit(scriptContext) {
        try {
            var newRecord = scriptContext.newRecord;
            var recordType = newRecord.type;
            
            // Only process Invoices
            if (recordType !== record.Type.INVOICE) {
                return;
            }
            
            // Only process on create (not edit)
            if (scriptContext.type !== 'create') {
                log.debug('afterSubmit', 'Invoice is not a create operation, skipping');
                return;
            }
            
            var invoiceId = newRecord.id;
            var invoiceTranId = newRecord.getValue('tranid') || invoiceId;
            
            // Get invoice date
            var invoiceDate = newRecord.getValue('trandate');
            if (!invoiceDate) {
                log.debug('afterSubmit', 'Invoice ' + invoiceTranId + ' has no trandate, skipping');
                return;
            }
            
            // Convert to Date object for month comparison
            var invoiceDateObj = new Date(invoiceDate);
            var invoiceMonth = invoiceDateObj.getMonth(); // 0-11
            var invoiceYear = invoiceDateObj.getFullYear();
            
            log.debug('afterSubmit', 'Invoice ' + invoiceTranId + ' date: ' + invoiceDate + ' (Month: ' + (invoiceMonth + 1) + ', Year: ' + invoiceYear + ')');
            
            // Get Sales Order from invoice's createdfrom field
            var salesOrderId = newRecord.getValue('createdfrom');
            if (!salesOrderId) {
                log.debug('afterSubmit', 'Invoice ' + invoiceTranId + ' has no createdfrom Sales Order, skipping');
                return;
            }
            
            log.debug('afterSubmit', 'Invoice ' + invoiceTranId + ' created from Sales Order: ' + salesOrderId);
            
            // Search for all IFs created from the same Sales Order
            var ifSearch = search.create({
                type: search.Type.ITEM_FULFILLMENT,
                filters: [
                    ['mainline', 'is', 'T'],
                    'AND',
                    ['createdfrom', 'is', salesOrderId]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'tranid' }),
                    search.createColumn({ name: 'trandate' })
                ]
            });
            
            log.debug('afterSubmit', 'Searching for IFs with createdfrom: ' + salesOrderId);
            
            var ifCount = 0;
            var updatedCount = 0;
            
            ifSearch.run().each(function(ifResult) {
                ifCount++;
                var ifId = ifResult.id;
                var ifTranId = ifResult.getValue('tranid') || ifId;
                var ifTranDate = ifResult.getValue('trandate');
                
                if (!ifTranDate) {
                    log.debug('afterSubmit', 'IF ' + ifTranId + ' has no trandate, skipping');
                    return true; // Continue to next IF
                }
                
                // Convert IF date to Date object for month comparison
                var ifDateObj = new Date(ifTranDate);
                var ifMonth = ifDateObj.getMonth(); // 0-11
                var ifYear = ifDateObj.getFullYear();
                
                log.debug('afterSubmit', 'IF ' + ifTranId + ' date: ' + ifTranDate + ' (Month: ' + (ifMonth + 1) + ', Year: ' + ifYear + ')');
                
                // Check if invoice date is in a different month than IF date
                if (invoiceMonth !== ifMonth || invoiceYear !== ifYear) {
                    log.debug('afterSubmit', 'IF ' + ifTranId + ' date is in different month/year than invoice. Updating IF trandate to ' + invoiceDate);
                    
                    try {
                        // Load and update the IF record
                        var ifRecord = record.load({
                            type: record.Type.ITEM_FULFILLMENT,
                            id: ifId,
                            isDynamic: true
                        });
                        
                        // Set trandate to invoice date
                        ifRecord.setValue({
                            fieldId: 'trandate',
                            value: invoiceDate
                        });
                        
                        // Save the record
                        ifRecord.save({
                            enableSourcing: false,
                            ignoreMandatoryFields: true
                        });
                        
                        updatedCount++;
                        log.audit('afterSubmit', 'Updated IF ' + ifTranId + ' trandate from ' + ifTranDate + ' to ' + invoiceDate);
                        
                    } catch (updateError) {
                        log.error('afterSubmit', 'Error updating IF ' + ifTranId + ' trandate: ' + updateError.toString());
                    }
                } else {
                    log.debug('afterSubmit', 'IF ' + ifTranId + ' date is in same month/year as invoice, no update needed');
                }
                
                return true; // Continue processing
            });
            
            log.audit('afterSubmit', 'Invoice ' + invoiceTranId + ' processing complete. Found ' + ifCount + ' IF(s), updated ' + updatedCount + ' IF(s)');
            
            if (ifCount === 0) {
                log.debug('afterSubmit', 'No Item Fulfillments found for Sales Order: ' + salesOrderId);
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

