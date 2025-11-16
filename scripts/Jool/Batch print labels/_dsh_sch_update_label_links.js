/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * 
 * Scheduled script that finds Item Fulfillments with completed labels but no label link,
 * then searches for the attached label files and stores the link in custbody_link_to_label.
 * 
 * This script runs periodically to ensure label links are captured even if the User Event
 * script misses them or if labels are attached via other methods.
 */

define(['N/search', 'N/record', 'N/file', 'N/url', 'N/log', 'N/runtime'], function (search, record, file, url, log, runtime) {
    
    /**
     * Executes when the scheduled script is triggered
     * @param {Object} scriptContext
     * @param {string} scriptContext.type - The context in which the script is executed
     */
    function execute(scriptContext) {
        log.audit('execute', 'Starting scheduled script to update label links');
        
        try {
            // Search for IFs with completed labels but no link stored
            var ifSearch = search.create({
                type: search.Type.ITEM_FULFILLMENT,
                filters: [
                    ['mainline', 'is', 'T'],
                    'AND',
                    ['custbody_sps_batched_print_com', 'is', 'T'],
                    'AND',
                    ['custbody_link_to_label', 'isempty', '']
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'tranid' }),
                    search.createColumn({ name: 'custbody_sps_batched_print_com' })
                ]
            });
            
            var processedCount = 0;
            var updatedCount = 0;
            var errorCount = 0;
            
            log.debug('execute', 'Running search for IFs with completed labels but no link');
            
            ifSearch.run().each(function(result) {
                var ifId = result.id;
                var tranId = result.getValue('tranid') || ifId;
                
                processedCount++;
                
                try {
                    log.debug('execute', 'Processing IF: ' + tranId + ' (ID: ' + ifId + ')');
                    
                    // Get the label file link
                    var labelLink = getLabelFileLink(ifId, tranId);
                    
                    if (labelLink) {
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
                        updatedCount++;
                        log.debug('execute', 'Updated label link for IF ' + tranId + ': ' + labelLink);
                    } else {
                        log.debug('execute', 'No label file found for IF ' + tranId);
                    }
                    
                    // Check governance
                    if (processedCount % 10 === 0) {
                        var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
                        log.debug('execute', 'Processed ' + processedCount + ' IFs. Remaining usage: ' + remainingUsage);
                        if (remainingUsage < 500) {
                            log.audit('execute', 'Low governance remaining, stopping. Processed: ' + processedCount + ', Updated: ' + updatedCount);
                            return false; // Stop processing
                        }
                    }
                    
                } catch (e) {
                    errorCount++;
                    log.error('execute', 'Error processing IF ' + tranId + ' (ID: ' + ifId + '): ' + e.toString());
                }
                
                return true; // Continue processing
            });
            
            log.audit('execute', '=== SCHEDULED SCRIPT SUMMARY ===');
            log.audit('execute', 'Total IFs processed: ' + processedCount);
            log.audit('execute', 'Label links updated: ' + updatedCount);
            log.audit('execute', 'Errors: ' + errorCount);
            log.debug('execute', 'Script execution complete. Remaining governance: ' + runtime.getCurrentScript().getRemainingUsage());
            
        } catch (e) {
            log.error('execute', 'Error running scheduled script: ' + e.toString());
            log.error('execute', 'Stack trace: ' + (e.stack || 'N/A'));
        }
    }
    
    /**
     * Gets the URL of the most recent label PDF file for an IF
     * Uses a more reliable method: search for files by name pattern and creation date
     * @param {string} ifId - Item Fulfillment internal ID
     * @param {string} tranId - Item Fulfillment transaction ID
     * @returns {string} URL of the label file, or empty string if not found
     */
    function getLabelFileLink(ifId, tranId) {
        try {
            log.debug('getLabelFileLink', 'Searching for label files for IF: ' + ifId + ' (Tran ID: ' + tranId + ')');
            
            // Load the IF to get creation date for better file matching
            var ifRecord = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId
            });
            var ifCreatedDate = ifRecord.getValue('createddate');
            
            // Search for PDF files that match label patterns
            // SPS label files typically contain transaction ID or "Label" in the name
            var fileSearch = search.create({
                type: search.Type.FILE,
                filters: [
                    ['filetype', 'is', 'PDF'],
                    'AND',
                    [
                        ['name', 'contains', tranId],
                        'OR',
                        ['name', 'contains', 'Label']
                    ],
                    'AND',
                    ['created', 'after', ifCreatedDate] // Only files created after IF was created
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'name' }),
                    search.createColumn({ name: 'created' })
                ]
            });
            
            // Sort by created date descending to get most recent first
            fileSearch.sortBy = [
                search.createColumn({ name: 'created', sort: search.Sort.DESC })
            ];
            
            var labelFileId = null;
            var labelFileName = null;
            
            // Look for the most recent matching file
            var resultCount = 0;
            fileSearch.run().each(function(result) {
                resultCount++;
                if (resultCount > 5) {
                    return false; // Stop after 5 results
                }
                
                var fileName = result.getValue('name');
                var fileId = result.id;
                
                // Prefer files that contain both transaction ID and "Label"
                var hasTranId = fileName && fileName.indexOf(tranId) >= 0;
                var hasLabel = fileName && fileName.indexOf('Label') >= 0;
                
                if (hasTranId || hasLabel) {
                    try {
                        var labelFile = file.load({ id: fileId });
                        var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                        var fileUrl = 'https://' + domain + labelFile.url;
                        
                        // If file has both tranId and Label, use it immediately
                        if (hasTranId && hasLabel) {
                            labelFileId = fileId;
                            labelFileName = fileName;
                            log.debug('getLabelFileLink', 'Found matching label file: ' + fileName + ' (ID: ' + fileId + ')');
                            return false; // Found best match, stop searching
                        }
                        
                        // Otherwise, save as candidate but keep looking
                        if (!labelFileId) {
                            labelFileId = fileId;
                            labelFileName = fileName;
                        }
                    } catch (fileError) {
                        log.debug('getLabelFileLink', 'Error loading file ' + fileId + ': ' + fileError.toString());
                    }
                }
                
                return true; // Continue searching
            });
            
            if (labelFileId) {
                try {
                    var labelFile = file.load({ id: labelFileId });
                    var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                    var fileUrl = 'https://' + domain + labelFile.url;
                    log.debug('getLabelFileLink', 'Generated label URL: ' + fileUrl + ' from file: ' + labelFileName);
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
        execute: execute
    };
});

