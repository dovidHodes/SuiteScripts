/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @description Scheduled script to automatically approve IFs for EDI transmission
 */
define(['N/search', 'N/record'], function(search, record) {

    function execute(context) {
        try {
            log.audit('Script Start', 'Beginning IF approval process');
            
            // Use existing saved search: "DSH | Auto approve IFs for EDI"
            const searchResult = search.load({
                id: 'customsearch_auto_approve_ifs_edi'
            });
            
            let searchResultCount = searchResult.runPaged().count;
            log.audit('Search Results', `Found ${searchResultCount} IFs to process`);
            
            let approvedCount = 0;
            
            searchResult.run().each(function(result) {
                try {
                    const ifId = result.id;
                    const entityId = result.getValue('entity');
                    
                    log.debug('Processing IF', `IF ID: ${ifId}, Entity ID: ${entityId}`);
                    
                    processCustomerSpecificLogic(entityId, result);
                    
                    record.submitFields({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId,
                        values: {
                            'custbody_approved_to_send_edi': true
                        }
                    });
                    
                    approvedCount++;
                    log.debug('IF Approved', `IF ${ifId} approved for EDI. Total approved: ${approvedCount}`);
                    
                    return true; 
                    
                } catch (error) {
                    log.error('Error processing IF', `IF ID: ${result.id}, Error: ${error.message}`);
                    return true; // Continue with next record
                }
            });
            
            log.audit('Script Complete', `Processed ${searchResultCount} IFs, Approved ${approvedCount} IFs for EDI transmission`);
            
        } catch (error) {
            log.error('Script Error', error.message);
            throw error;
        }
    }
    
    function processCustomerSpecificLogic(entityId, searchResult) {
        log.debug('Customer Logic Check', `Entity ID: ${entityId}, Type: ${typeof entityId}`);
        
        // Convert entityId to number for comparison
        const entityIdNum = parseInt(entityId);
        
        if (entityIdNum === 545) {
            log.debug('Menards Entity Found', `Processing Menards logic for Entity ID 545`);
            doMenards(searchResult);
        } else {
            log.debug('No Customer Logic', `Entity ID ${entityId} (${entityIdNum}) has no specific logic`);
        }
    }
    
    
    function doMenards(searchResult) {
        try {
            const ifId = searchResult.id;
            // Load the IF record to get the custbody_sps_potype field
            const ifRecord = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId
            });
            
            const poType = ifRecord.getValue('custbody_sps_potype');
            
            log.debug('Menards Logic Start', `IF ID: ${ifId}, PO Type: ${poType}, Entity ID: 545`);
            
            // Check if PO Type exists and what value it has
            if (!poType) {
                log.debug('Menards PO Type Missing', `IF ${ifId} has no PO Type value`);
                return;
            }
            
            log.debug('Menards PO Type Check', `IF ${ifId} PO Type: "${poType}" (type: ${typeof poType})`);
            
            // If PO Type is DR, set ASN status to internal ID 16
            if (poType === 'DR') {
                log.debug('Menards DR Found', `IF ${ifId} has PO Type DR, updating ASN status`);
                
                try {
                    record.submitFields({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId,
                        values: {
                            'custbody_asn_status': 16
                        }
                    });
                    log.audit('Menards ASN Status Updated', `IF ${ifId} ASN status set to 16 for PO Type DR`);
                } catch (submitError) {
                    log.error('Menards Submit Error', `IF ${ifId} failed to update ASN status: ${submitError.message}`);
                }
            } else {
                log.debug('Menards Not DR', `IF ${ifId} PO Type "${poType}" is not DR, skipping ASN update`);
            }
            
        } catch (error) {
            log.error('Menards Logic Error', `IF ${searchResult.id}: ${error.message}`);
        }
    }
    
    return {
        execute: execute
    };
}); 