/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event script that captures label PDF links when labels are attached to Item Fulfillments.
 * 
 * When custbody_sps_batched_print_com changes to true, this script:
 * 1. Searches for attached label PDF files
 * 2. Gets the URL of the most recent label file
 * 3. Stores it in custbody_link_to_label field on the IF
 * 
 * This allows label links to appear in saved searches and directly on the IF record.
 */

define(['N/record', 'N/search', 'N/file', 'N/url', 'N/log'], function (record, search, file, url, log) {
    
    /**
     * Triggered after an Item Fulfillment record is saved
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed
     * @param {number} scriptContext.newRecord - The new record being saved
     * @param {number} scriptContext.oldRecord - The old record before changes
     */
    function afterSubmit(scriptContext) {
        try {
            var newRecord = scriptContext.newRecord;
            var oldRecord = scriptContext.oldRecord;
            var ifId = newRecord.id;
            var recordType = newRecord.type;
            
            // Only process Item Fulfillments
            if (recordType !== record.Type.ITEM_FULFILLMENT) {
                return;
            }
            
            // Check if batch print complete checkbox was just set to true
            var newBatchPrintComplete = newRecord.getValue('custbody_sps_batched_print_com');
            var oldBatchPrintComplete = oldRecord.getValue('custbody_sps_batched_print_com');
            
            // Only process if checkbox changed from false to true
            if (newBatchPrintComplete === true && oldBatchPrintComplete !== true) {
                log.debug('afterSubmit', 'Batch print complete checkbox set to true for IF: ' + ifId);
                
                // Get the label link and store it
                var labelLink = getLabelFileLink(ifId);
                
                if (labelLink) {
                    try {
                        // Update the IF with the label link
                        record.submitFields({
                            type: record.Type.ITEM_FULFILLMENT,
                            id: ifId,
                            values: {
                                custbody_link_to_label: labelLink
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            }
                        });
                        log.audit('afterSubmit', 'Stored label link for IF ' + ifId + ': ' + labelLink);
                    } catch (updateError) {
                        log.error('afterSubmit', 'Error updating label link for IF ' + ifId + ': ' + updateError.toString());
                    }
                } else {
                    log.debug('afterSubmit', 'No label file found for IF ' + ifId + ' - link not set');
                }
            }
        } catch (e) {
            log.error('afterSubmit', 'Error in afterSubmit: ' + e.toString());
        }
    }
    
    /**
     * Gets the URL of the most recent label PDF file attached to an IF
     * @param {string} ifId - Item Fulfillment internal ID
     * @returns {string} URL of the label file, or empty string if not found
     */
    function getLabelFileLink(ifId) {
        try {
            // Load the IF to get the transaction ID for file name matching
            var ifRecord = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId
            });
            var tranId = ifRecord.getValue('tranid');
            
            log.debug('getLabelFileLink', 'Searching for label files for IF: ' + ifId + ' (Tran ID: ' + tranId + ')');
            
            // Search for files that might be label files
            // SPS label files typically contain the transaction ID or "Label" in the name
            // They're usually in the "Label Archives" folder or similar
            var fileSearch = search.create({
                type: search.Type.FILE,
                filters: [
                    ['filetype', 'is', 'PDF'],
                    'AND',
                    [
                        ['name', 'contains', tranId],
                        'OR',
                        ['name', 'contains', 'Label']
                    ]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'name' }),
                    search.createColumn({ name: 'created' }),
                    search.createColumn({ name: 'folder' })
                ]
            });
            
            // Sort by created date descending to get most recent first
            fileSearch.sortBy = [
                search.createColumn({ name: 'created', sort: search.Sort.DESC })
            ];
            
            var labelFileId = null;
            var labelFileName = null;
            
            // Look for the most recent label file
            // Limit to first 10 results to avoid too many iterations
            var resultCount = 0;
            fileSearch.run().each(function(result) {
                resultCount++;
                if (resultCount > 10) {
                    return false; // Stop after 10 results
                }
                
                var fileName = result.getValue('name');
                var fileId = result.id;
                
                // Check if this file is attached to our IF
                // We can't directly check attachments, so we'll use heuristics:
                // - File name contains transaction ID
                // - File name contains "Label"
                // - File is a PDF
                if (fileName && (fileName.indexOf(tranId) >= 0 || fileName.indexOf('Label') >= 0)) {
                    // Try to load the file to verify it exists and get its URL
                    try {
                        var labelFile = file.load({ id: fileId });
                        var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                        var fileUrl = 'https://' + domain + labelFile.url;
                        
                        labelFileId = fileId;
                        labelFileName = fileName;
                        log.debug('getLabelFileLink', 'Found label file: ' + fileName + ' (ID: ' + fileId + ')');
                        return false; // Found it, stop searching
                    } catch (fileError) {
                        log.debug('getLabelFileLink', 'Error loading file ' + fileId + ': ' + fileError.toString());
                        // Continue searching
                    }
                }
                
                return true; // Continue searching
            });
            
            if (labelFileId) {
                try {
                    var labelFile = file.load({ id: labelFileId });
                    var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                    var fileUrl = 'https://' + domain + labelFile.url;
                    log.debug('getLabelFileLink', 'Generated label URL: ' + fileUrl);
                    return fileUrl;
                } catch (urlError) {
                    log.error('getLabelFileLink', 'Error generating URL for file ' + labelFileId + ': ' + urlError.toString());
                    return '';
                }
            }
            
            log.debug('getLabelFileLink', 'No label file found for IF ' + ifId);
            return '';
            
        } catch (e) {
            log.error('getLabelFileLink', 'Error getting label file link: ' + e.toString());
            return '';
        }
    }
    
    return {
        afterSubmit: afterSubmit
    };
});

