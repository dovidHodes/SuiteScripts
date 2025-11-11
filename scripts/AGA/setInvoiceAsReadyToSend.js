/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @description Scheduled script to automatically approve invoices for EDI transmission
 */
define(['N/search', 'N/record'], function(search, record) {
    
    function execute(context) {
        try {
            log.audit('Script Start', 'Beginning invoice approval process');
            
            // Use existing saved search: "DSH | Auto approve invoices for EDI"
            const searchResult = search.load({
                id: 'customsearch_auto_approve_invoices_edi'
            });
            
            let searchResultCount = searchResult.runPaged().count;
            log.audit('Search Results', `Found ${searchResultCount} invoices to process`);
            
            searchResult.run().each(function(result) {
                try {
                    const invoiceId = result.id;
                    const entityId = parseInt(result.getValue('entity'));
                    
                    // Process customer-specific logic BEFORE sibling check
                    processCustomerSpecificLogic(entityId, result);
                    
                    // Skip sibling check for TP Target (entity 546) - they don't need invoice sending
                    if (entityId === 546) {
                        log.audit('TP Target Invoice Skipped', `Invoice ${invoiceId} - TP Target doesn't require invoice sending`);
                        return true;
                    }
                    
                    // Check if all sibling IFs are shipped before approving invoice
                    if (checkSiblingIFsShipped(invoiceId, entityId)) {
                        record.submitFields({
                            type: record.Type.INVOICE,
                            id: invoiceId,
                            values: {
                                'custbody_approved_to_send_edi': true
                            }
                        });
                        
                        log.audit('Invoice Approved', `Invoice ${invoiceId} approved for EDI transmission`);
                    } else {
                        log.audit('Invoice Skipped', `Invoice ${invoiceId} skipped - sibling IFs not all shipped`);
                    }
                    
                    return true; 
                    
                } catch (error) {
                    log.error('Error processing invoice', `Invoice ID: ${result.id}, Error: ${error.message}`);
                    
                    // Create EDI error record for failed invoice
                    createEDIErrorRecord(result.id, error.message, parseInt(result.getValue('entity')));
                    
                    return true; // Continue with next record
                }
            });
            
            log.audit('Script Complete', 'Invoice approval process completed');
            
        } catch (error) {
            log.error('Script Error', error.message);
            throw error;
        }
    }
    
    function checkSiblingIFsShipped(invoiceId, entityId) {
        try {
            // First, get the Sales Order from the invoice's createdfrom field
            const invoiceRecord = record.load({
                type: record.Type.INVOICE,
                id: invoiceId
            });
            
            const salesOrderId = invoiceRecord.getValue('createdfrom');
            
            if (!salesOrderId) {
                log.debug('No Sales Order', `Invoice ${invoiceId} has no createdfrom Sales Order`);
                return false;
            }
            
            log.debug('Sales Order Found', `Invoice ${invoiceId} created from Sales Order ${salesOrderId}`);
            
            // Search for all IFs created from the same Sales Order
            const siblingIFSearch = search.create({
                type: search.Type.ITEM_FULFILLMENT, // Directly specify Item Fulfillment
                filters: [
                    ['mainline', 'is', 'T'],
                    'AND',
                    ['createdfrom', 'is', salesOrderId]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'custbody_asn_status' })
                ]
            });
            
            log.debug('IF Search Debug', `Searching for IFs with createdfrom: ${salesOrderId}`);
            
            let allShipped = true;
            let ifCount = 0;
            
            log.debug('IF Search Results', `Starting to process IF search results for Sales Order: ${salesOrderId}`);
            
            siblingIFSearch.run().each(function(ifResult) {
                ifCount++;
                const asnStatus = ifResult.getValue('custbody_asn_status');
                
                log.debug('Sibling IF Check', `IF ${ifResult.id}, ASN Status: ${asnStatus}`);
                
                // Check if ASN status is not equal to 2 or 16 (shipped)
                if (asnStatus !== '2' && asnStatus !== '16') {
                    allShipped = false;
                    log.debug('IF Not Shipped', `IF ${ifResult.id} has ASN status ${asnStatus}, not shipped`);
                }
                
                return true; // Continue processing
            });
            
            log.debug('Sibling IF Summary', `Invoice ${invoiceId}: ${ifCount} sibling IFs, all shipped: ${allShipped}`);
            
            if (ifCount === 0) {
                log.debug('No IFs Found', `No Item Fulfillments found for Sales Order: ${salesOrderId}`);
            }
            
            return allShipped;
            
        } catch (error) {
            log.error('Error checking sibling IFs', `Invoice ID: ${invoiceId}, Error: ${error.message}`);
            // Create EDI error record for sibling check failure
            createEDIErrorRecord(invoiceId, `Sibling IF check failed: ${error.message}`, entityId);
            // If there's an error checking sibling IFs, don't approve the invoice
            return false;
        }
    }
    
    function processCustomerSpecificLogic(entityId, searchResult) {
        try {
            // TP Target logic for entity ID 546
            if (entityId === 546) {
                const invoiceId = searchResult.id;
                
                record.submitFields({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    values: {
                        'custbodyintegrationstatus': 9,
                        'custbody_approved_to_send_edi': true
                    }
                });
                
                log.audit('TP Target Logic Applied', `Invoice ${invoiceId} - custbodyintegrationstatus set to 9 and EDI approved for entity ${entityId}`);
            }
            
            // Additional customer-specific logic can be added here
            // Example: if (entityId === 123) { processCustomer123Logic(searchResult); }
            
        } catch (error) {
            log.error('Error in customer-specific logic', `Entity ID: ${entityId}, Error: ${error.message}`);
            // Create EDI error record for customer logic failure
            createEDIErrorRecord(searchResult.id, `Customer-specific logic failed: ${error.message}`, entityId);
        }
    }
    
    function createEDIErrorRecord(invoiceId, errorMessage, tradingPartnerId) {
        try {
            const ediErrorRecord = record.create({
                type: 'customrecord_edi_error'
            });
            
            ediErrorRecord.setValue({
                fieldId: 'custrecord_edi_error_record',
                value: invoiceId
            });
            
            ediErrorRecord.setValue({
                fieldId: 'custrecord233', // Action field
                value: 8
            });
            
            ediErrorRecord.setValue({
                fieldId: 'custrecord234', // Error Message field
                value: errorMessage
            });

            ediErrorRecord.setValue({
                fieldId: 'custrecord235', // Status field
                value: 1 // New
            });

            if (tradingPartnerId) {
                ediErrorRecord.setValue({
                    fieldId: 'custrecord232', // Trading Partner field
                    value: tradingPartnerId
                });
            }
            
            const ediErrorId = ediErrorRecord.save();
            log.audit('EDI Error Record Created', `EDI Error ID: ${ediErrorId} for Invoice: ${invoiceId}`);
            
        } catch (error) {
            log.error('Error creating EDI error record', `Invoice ID: ${invoiceId}, Error: ${error.message}`);
        }
    }
    
    return {
        execute: execute
    };
}); 