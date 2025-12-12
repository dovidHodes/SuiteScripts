/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @description Scheduled script that takes a JSON array of Item Fulfillment internal IDs
 * and sets the ASN status field (custbody_asn_status) to 1 for each IF.
 */
define(['N/record', 'N/runtime', 'N/log'], 
    function(record, runtime, log) {

    function execute(context) {
        try {
            log.audit('Set ASN Status', '=== SCRIPT STARTED ===');
            log.debug('Set ASN Status', 'Script execution context: ' + JSON.stringify(context));
            
            // Get the JSON array parameter
            log.debug('Set ASN Status', 'Attempting to get parameter: custscript_if_ids');
            const ifIdsParam = runtime.getCurrentScript().getParameter({name: 'custscript_if_ids'});
            
            log.debug('Set ASN Status', 'Parameter retrieved, type: ' + typeof ifIdsParam);
            log.debug('Set ASN Status', 'Parameter is null/undefined: ' + (ifIdsParam == null));
            
            if (!ifIdsParam) {
                log.error('Set ASN Status Error', 'IF IDs parameter not found in script parameters');
                log.audit('Set ASN Status', '=== SCRIPT FAILED - NO PARAMETER ===');
                return;
            }
            
            log.debug('Set ASN Status', 'Raw parameter value: ' + ifIdsParam);
            log.debug('Set ASN Status', 'Parameter length: ' + (ifIdsParam ? ifIdsParam.length : 0));
            
            // Parse the JSON array
            let ifIds = [];
            try {
                log.debug('Set ASN Status', 'Attempting to parse JSON...');
                ifIds = JSON.parse(ifIdsParam);
                log.debug('Set ASN Status', 'JSON parsed successfully, type: ' + typeof ifIds);
                log.debug('Set ASN Status', 'Is array: ' + Array.isArray(ifIds));
                
                if (!Array.isArray(ifIds)) {
                    // If it's a single value, convert to array
                    log.debug('Set ASN Status', 'Converting single value to array');
                    ifIds = [ifIds];
                }
                
                log.debug('Set ASN Status', 'Parsed IF IDs: ' + JSON.stringify(ifIds));
                log.debug('Set ASN Status', 'Number of IF IDs: ' + ifIds.length);
                
            } catch (parseError) {
                log.error('Set ASN Status Error', 'Failed to parse JSON parameter: ' + parseError.message);
                log.error('Set ASN Status Error', 'Parse error stack: ' + (parseError.stack || 'N/A'));
                log.debug('Set ASN Status Error', 'Failed JSON string: ' + ifIdsParam);
                log.audit('Set ASN Status', '=== SCRIPT FAILED - INVALID JSON ==='); 
                return;
            }
            
            if (ifIds.length === 0) {
                log.debug('Set ASN Status', 'IF IDs array is empty after parsing');
                log.audit('Set ASN Status', 'No IF IDs provided in parameter');
                log.audit('Set ASN Status', '=== SCRIPT COMPLETED - NO IDs ===');
                return;
            }
            
            log.audit('Set ASN Status', `Processing ${ifIds.length} Item Fulfillment(s)`);
            log.debug('Set ASN Status', 'Starting to process IF IDs...');
            
            let successCount = 0;
            let errorCount = 0;
            let skippedCount = 0;
            
            // Process each IF ID
            for (let i = 0; i < ifIds.length; i++) {
                try {
                    log.debug('Set ASN Status', `=== Processing IF ${i + 1}/${ifIds.length} ===`);
                    log.debug('Set ASN Status', `Raw IF ID value: ${ifIds[i]}, type: ${typeof ifIds[i]}`);
                    
                    const ifId = String(ifIds[i]).trim();
                    log.debug('Set ASN Status', `Trimmed IF ID: "${ifId}"`);
                    
                    if (!ifId) {
                        log.debug('Set ASN Status', `Skipping empty IF ID at index ${i}`);
                        skippedCount++;
                        continue;
                    }
                    
                    log.debug('Set ASN Status', `Processing IF ${i + 1}/${ifIds.length}: ${ifId}`);
                    
                    // Load the Item Fulfillment record
                    let ifRecord;
                    try {
                        log.debug('Set ASN Status', `Attempting to load IF record: ${ifId}`);
                        ifRecord = record.load({
                            type: record.Type.ITEM_FULFILLMENT,
                            id: ifId,
                            isDynamic: true
                        });
                        log.debug('Set ASN Status', `Successfully loaded IF record: ${ifId}`);
                        
                        // Get current ASN status before changing it
                        const currentASNStatus = ifRecord.getValue('custbody_asn_status');
                        log.debug('Set ASN Status', `Current ASN status for IF ${ifId}: ${currentASNStatus}`);
                        
                        // Get IF tranid for logging
                        const ifTranId = ifRecord.getValue('tranid');
                        log.debug('Set ASN Status', `IF ${ifId} tranid: ${ifTranId}`);
                        
                    } catch (loadError) {
                        log.error('Set ASN Status Error', `Failed to load IF ${ifId}: ${loadError.message}`);
                        log.error('Set ASN Status Error', `Load error stack: ${loadError.stack || 'N/A'}`);
                        errorCount++;
                        continue;
                    }
                    
                    // Set ASN status to 1
                    log.debug('Set ASN Status', `Setting ASN status to 1 for IF ${ifId}`);
                    try {
                        ifRecord.setValue({
                            fieldId: 'custbody_asn_status',
                            value: 1
                        });
                        log.debug('Set ASN Status', `Successfully set field value for IF ${ifId}`);
                        
                        // Verify the value was set
                        const verifyValue = ifRecord.getValue('custbody_asn_status');
                        log.debug('Set ASN Status', `Verified ASN status value after setValue: ${verifyValue}`);
                        
                    } catch (setValueError) {
                        log.error('Set ASN Status Error', `Failed to set ASN status for IF ${ifId}: ${setValueError.message}`);
                        log.error('Set ASN Status Error', `setValue error stack: ${setValueError.stack || 'N/A'}`);
                        errorCount++;
                        continue;
                    }
                    
                    // Save the record
                    try {
                        log.debug('Set ASN Status', `Attempting to save IF ${ifId}...`);
                        const savedId = ifRecord.save({
                            enableSourcing: true,
                            ignoreMandatoryFields: true
                        });
                        
                        log.debug('Set ASN Status', `IF ${ifId} saved successfully, saved ID: ${savedId}`);
                        log.audit('Set ASN Status', `Successfully set ASN status to 1 for IF ${ifId} (saved as ${savedId})`);
                        successCount++;
                        
                    } catch (saveError) {
                        log.error('Set ASN Status Error', `Failed to save IF ${ifId}: ${saveError.message}`);
                        log.error('Set ASN Status Error', `Save error stack: ${saveError.stack || 'N/A'}`);
                        log.error('Set ASN Status Error', `Save error name: ${saveError.name || 'N/A'}`);
                        errorCount++;
                    }
                    
                } catch (ifError) {
                    errorCount++;
                    log.error('Set ASN Status Error', `Error processing IF at index ${i}: ${ifError.message}`);
                    log.error('Set ASN Status Error', `IF error stack: ${ifError.stack || 'N/A'}`);
                }
            }
            
            log.audit('Set ASN Status', `=== PROCESSING COMPLETE ===`);
            log.audit('Set ASN Status', `Total IFs provided: ${ifIds.length}`);
            log.audit('Set ASN Status', `Successfully updated: ${successCount}`);
            log.audit('Set ASN Status', `Errors: ${errorCount}`);
            log.audit('Set ASN Status', `Skipped: ${skippedCount}`);
            log.debug('Set ASN Status', 'Final counts - Success: ' + successCount + ', Errors: ' + errorCount + ', Skipped: ' + skippedCount);
            log.audit('Set ASN Status', '=== SCRIPT COMPLETED ===');
            
        } catch (error) {
            log.error('Set ASN Status Error', `Critical error: ${error.message}`);
            log.error('Set ASN Status Error', `Error stack: ${error.stack}`);
            log.error('Set ASN Status Error', `Error name: ${error.name || 'N/A'}`);
            log.audit('Set ASN Status', '=== SCRIPT FAILED WITH CRITICAL ERROR ===');
        }
    }

    return {
        execute: execute
    };
});

