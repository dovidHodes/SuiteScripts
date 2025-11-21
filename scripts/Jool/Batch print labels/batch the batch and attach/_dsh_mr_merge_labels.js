/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 * This Map/Reduce script consolidates all SPS batch print label PDFs associated with an Item Fulfillment into a single PDF file.
 * 
 * Process:
 * 1. Retrieve the Item Fulfillment ID from the provided parameters.
 * 2. Locate all SPS label PDF files attached to the identified Item Fulfillment.
 * 3. Merge the retrieved PDFs using the N/render PDF module.
 * 4. Save the merged PDF with the filename format: {poname}_{IFname}_MERGED LABELS.pdf.
 * 5. Store the merged PDF in the designated folder.
 * 6. Attach the newly created merged PDF to the corresponding Item Fulfillment record.
 * 7. Update the custbody_batched_the_batch_and_attach field with the URL of the merged PDF file.
 */

// Polyfill for btoa and atob (browser APIs not available in NetSuite)
// These MUST be defined BEFORE the define() call so PDFlib can access them
// Define them in global scope for PDFlib to access

/**
 * NetSuite-compatible base64 encode (polyfill for btoa)
 * @param {string} binary - Binary string to encode
 * @returns {string} Base64 encoded string
 */
function base64EncodePolyfill(binary) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = '';
    var i = 0;
    
    while (i < binary.length) {
        var a = binary.charCodeAt(i++);
        var b = i < binary.length ? binary.charCodeAt(i++) : 0;
        var c = i < binary.length ? binary.charCodeAt(i++) : 0;
        
        var bitmap = (a << 16) | (b << 8) | c;
        
        output += chars.charAt((bitmap >> 18) & 63);
        output += chars.charAt((bitmap >> 12) & 63);
        output += i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=';
        output += i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=';
    }
    
    return output;
}

/**
 * NetSuite-compatible base64 decode (polyfill for atob)
 * @param {string} base64 - Base64 encoded string
 * @returns {string} Decoded binary string
 */
function base64DecodePolyfill(base64) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = '';
    var i = 0;
    base64 = base64.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    
    while (i < base64.length) {
        var enc1 = chars.indexOf(base64.charAt(i++));
        var enc2 = chars.indexOf(base64.charAt(i++));
        var enc3 = chars.indexOf(base64.charAt(i++));
        var enc4 = chars.indexOf(base64.charAt(i++));
        
        var bitmap = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
        
        if (enc3 === 64) {
            output += String.fromCharCode((bitmap >> 16) & 255);
        } else if (enc4 === 64) {
            output += String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255);
        } else {
            output += String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255, bitmap & 255);
        }
    }
    
    return output;
}

// Assign to global scope - try multiple methods for compatibility with NetSuite
if (typeof global !== 'undefined') {
    global.btoa = base64EncodePolyfill;
    global.atob = base64DecodePolyfill;
} else if (typeof window !== 'undefined') {
    window.btoa = base64EncodePolyfill;
    window.atob = base64DecodePolyfill;
} else {
    // In SuiteScript, assign without var to make them global
    // This creates properties on the global object
    btoa = base64EncodePolyfill;
    atob = base64DecodePolyfill;
}

define(['N/search', 'N/record', 'N/file', 'N/url', 'N/log', 'N/runtime', './PDFlib_WRAPPED', './_dsh_lib_time_tracker'], function (search, record, file, url, log, runtime, PDFLib, timeTrackerLib) {
    
    // Re-assign polyfills in module scope as well, in case PDFlib accesses them from here
    // Also define helper functions for use within this module
    /**
     * NetSuite-compatible base64 encode (polyfill for btoa)
     * @param {string} binary - Binary string to encode
     * @returns {string} Base64 encoded string
     */
    function base64EncodePolyfill(binary) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        var output = '';
        var i = 0;
        
        while (i < binary.length) {
            var a = binary.charCodeAt(i++);
            var b = i < binary.length ? binary.charCodeAt(i++) : 0;
            var c = i < binary.length ? binary.charCodeAt(i++) : 0;
            
            var bitmap = (a << 16) | (b << 8) | c;
            
            output += chars.charAt((bitmap >> 18) & 63);
            output += chars.charAt((bitmap >> 12) & 63);
            output += i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=';
            output += i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=';
        }
        
        return output;
    }
    
    /**
     * NetSuite-compatible base64 decode (polyfill for atob)
     * @param {string} base64 - Base64 encoded string
     * @returns {string} Decoded binary string
     */
    function base64DecodePolyfill(base64) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        var output = '';
        var i = 0;
        base64 = base64.replace(/[^A-Za-z0-9\+\/\=]/g, '');
        
        while (i < base64.length) {
            var enc1 = chars.indexOf(base64.charAt(i++));
            var enc2 = chars.indexOf(base64.charAt(i++));
            var enc3 = chars.indexOf(base64.charAt(i++));
            var enc4 = chars.indexOf(base64.charAt(i++));
            
            var bitmap = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
            
            if (enc3 === 64) {
                output += String.fromCharCode((bitmap >> 16) & 255);
            } else if (enc4 === 64) {
                output += String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255);
            } else {
                output += String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255, bitmap & 255);
            }
        }
        
        return output;
    }
    
    // Ensure they're available globally (re-assign in case the pre-define assignment didn't work)
    if (typeof global !== 'undefined') {
        global.btoa = base64EncodePolyfill;
        global.atob = base64DecodePolyfill;
    }
    
    /**
     * Gets input data - the IF ID from script parameters
     * Returns a simple key-value object that can be processed by map function
     * @param {Object} inputContext
     * @returns {Object} Object with IF ID as key-value pair
     */
    function getInputData(inputContext) {
        try {
            // Debug: Get script ID to verify
            var scriptId = runtime.getCurrentScript().id;
            log.debug('getInputData', 'Script ID: ' + scriptId);
            
            // Try the expected parameter name
            var parametersString = runtime.getCurrentScript().getParameter({ name: 'custscript_mr_merge_json' });
            log.debug('getInputData', 'Parameters with custscript_mr_merge_json: ' + parametersString);
            
            // If null, try alternative parameter names
            if (!parametersString) {
                // Try the old parameter name in case it's still using that
                parametersString = runtime.getCurrentScript().getParameter({ name: 'custscript_mr_merge_and_link_labels_json' });
                log.debug('getInputData', 'Parameters with custscript_mr_merge_and_link_labels_json: ' + parametersString);
            }
            
            if (!parametersString) {
                // Try to get all parameters - this might help debug
                try {
                    var allParams = runtime.getCurrentScript().getParameter();
                    log.debug('getInputData', 'All parameters object: ' + JSON.stringify(allParams));
                } catch (e) {
                    log.debug('getInputData', 'Could not get all parameters: ' + e.toString());
                }
                throw new Error('Parameters not provided - parameter name may be incorrect. Script ID: ' + scriptId);
            }
            
            var parametersObj = JSON.parse(parametersString);
            var ifId = parametersObj.itemFulfillmentId;
            
            if (!ifId) {
                throw new Error('Item Fulfillment ID not provided in parameters');
            }
            
            // Load IF to get tranId for logging
            try {
                var ifRecord = record.load({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ifId
                });
                var tranId = ifRecord.getValue('tranid') || ifId;
                log.debug('getInputData', 'TranID: ' + tranId + ' - Received IF ID: ' + ifId);
            } catch (e) {
                log.debug('getInputData', 'Could not load IF to get tranId, using IF ID: ' + ifId);
            }
            
            // Return a simple object with the IF ID - no need to search for it
            // The key is the IF ID, value is also the IF ID (for consistency)
            var resultObj = {};
            resultObj[ifId] = ifId;
            
            log.debug('getInputData', 'Returning IF ID: ' + ifId);
            return resultObj;
            
        } catch (e) {
            log.error('getInputData', 'Error getting input data: ' + e.toString());
            throw e;
        }
    }
    
    /**
     * Map function - processes the IF ID
     * @param {Object} mapContext
     */
    function map(mapContext) {
        try {
            // Get IF ID directly from the key (which is the IF ID itself)
            var ifId = mapContext.key;
            
            // Load IF to get tranId for logging
            try {
                var ifRecord = record.load({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ifId
                });
                var tranId = ifRecord.getValue('tranid') || ifId;
                log.debug('map', 'TranID: ' + tranId + ' - Processing IF (ID: ' + ifId + ')');
            } catch (e) {
                log.debug('map', 'Processing IF ID: ' + ifId);
            }
            
            // Write to reduce with IF ID as key
            mapContext.write(ifId, ifId);
            
        } catch (e) {
            log.error('map', 'Error in map function: ' + e.toString());
        }
    }
    
    /**
     * Reduce function - merges the label PDFs
     * @param {Object} reduceContext
     */
    function reduce(reduceContext) {
        try {
            var ifId = reduceContext.key;
            
            // Load IF to get transaction ID and PO number
            var ifRecord = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId
            });
            var tranId = ifRecord.getValue('tranid') || ifId;
            var poNumber = ifRecord.getValue('custbody_sps_ponum_from_salesorder') || '';
            var ifCreatedDate = ifRecord.getValue('createddate');
            var entityId = ifRecord.getValue('entity'); // Customer ID for time tracker
            
            // Get location name
            var locationName = '';
            try {
                var locationId = ifRecord.getValue('custbody_ship_from_location');
                if (locationId) {
                    var locationRecord = record.load({
                        type: record.Type.LOCATION,
                        id: locationId
                    });
                    locationName = locationRecord.getValue('name') || '';
                    log.debug('reduce', 'TranID: ' + tranId + ' - Location name: ' + locationName);
                }
            } catch (locationError) {
                log.debug('reduce', 'TranID: ' + tranId + ' - Could not get location name: ' + locationError.toString());
            }
            
            log.debug('reduce', 'TranID: ' + tranId + ' - Starting label merge process (ID: ' + ifId + ', PO: ' + poNumber + ')');
            
            // Find all SPS label PDF files for this IF
            log.debug('reduce', 'TranID: ' + tranId + ' - Searching for SPS label PDF files');
            var labelFileIds = findSPSLabelFiles(ifId, tranId, ifCreatedDate);
            
            if (labelFileIds.length === 0) {
                log.audit('reduce', 'TranID: ' + tranId + ' - No SPS label files found (ID: ' + ifId + ')');
                return;
            }
            
            log.debug('reduce', 'TranID: ' + tranId + ' - Found ' + labelFileIds.length + ' label file(s) to merge');
            
            var finalFileId = null;
            var finalFileUrl = null;
            
            // If only one file, rename it to the All carton labels naming pattern
            if (labelFileIds.length === 1) {
                log.debug('reduce', 'TranID: ' + tranId + ' - Only one label file found, renaming to All carton labels format');
                finalFileId = labelFileIds[0];
                
                // Load the file and rename it
                try {
                    var singleFile = file.load({ id: finalFileId });
                    
                    // Build new file name: All carton labels + {relatedponumber} - {location name}
                    var newFileName = 'All carton labels';
                    if (poNumber) {
                        newFileName += ' ' + poNumber;
                    }
                    if (locationName) {
                        newFileName += ' - ' + locationName;
                    }
                    newFileName += '.pdf';
                    
                    log.debug('reduce', 'TranID: ' + tranId + ' - Renaming file from "' + singleFile.name + '" to "' + newFileName + '"');
                    
                    // Rename the file
                    singleFile.name = newFileName;
                    finalFileId = singleFile.save();
                    
                    log.debug('reduce', 'TranID: ' + tranId + ' - File renamed successfully, new file ID: ' + finalFileId);
                    
                    // Get the file URL
                    var renamedFile = file.load({ id: finalFileId });
                    var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                    finalFileUrl = 'https://' + domain + renamedFile.url;
                    log.debug('reduce', 'TranID: ' + tranId + ' - Renamed file URL: ' + finalFileUrl);
                } catch (fileError) {
                    log.error('reduce', 'TranID: ' + tranId + ' - Error renaming single file: ' + fileError.toString());
                    return;
                }
            } else {
                // Multiple files - merge them using PDFlib
                log.debug('reduce', 'TranID: ' + tranId + ' - Merging ' + labelFileIds.length + ' PDF file(s)');
                
                // mergePDFs returns a Promise, so we need to handle it
                // NOTE: This is a limitation of Map/Reduce scripts - they expect synchronous operations
                // If this doesn't work, consider using a Scheduled Script or RESTlet instead
                var mergeResult = mergePDFs(labelFileIds, poNumber, tranId, locationName);
                
                // Check if we got a Promise or a direct result
                if (mergeResult && typeof mergeResult.then === 'function') {
                    // It's a Promise - handle it
                    // WARNING: Map/Reduce scripts may not wait for Promise resolution
                    // You may need to test this and potentially use a different script type
                    log.debug('reduce', 'TranID: ' + tranId + ' - Merge returned a Promise, waiting for resolution...');
                    
                    mergeResult.then(function(fileId) {
                        if (!fileId) {
                            log.error('reduce', 'TranID: ' + tranId + ' - Failed to merge PDFs (Promise resolved with null)');
                            return;
                        }
                        
                        finalFileId = fileId;
                        log.debug('reduce', 'TranID: ' + tranId + ' - PDFs merged successfully, file ID: ' + finalFileId);
                        
                        // Get merged file URL
                        try {
                            var mergedFile = file.load({ id: finalFileId });
                            var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                            finalFileUrl = 'https://' + domain + mergedFile.url;
                            log.debug('reduce', 'TranID: ' + tranId + ' - Merged file URL: ' + finalFileUrl);
                            
                            // Attach file to IF
                            try {
                                log.debug('reduce', 'TranID: ' + tranId + ' - Attaching file to IF');
                                record.attach({
                                    record: {
                                        type: 'file',
                                        id: finalFileId
                                    },
                                    to: {
                                        type: record.Type.ITEM_FULFILLMENT,
                                        id: ifId
                                    }
                                });
                                log.debug('reduce', 'TranID: ' + tranId + ' - Successfully attached file to IF');
                            } catch (attachError) {
                                log.error('reduce', 'TranID: ' + tranId + ' - Error attaching file: ' + attachError.toString());
                            }
                            
                            // Update IF field with file URL
                            try {
                                log.debug('reduce', 'TranID: ' + tranId + ' - Updating IF field with file URL');
                                record.submitFields({
                                    type: record.Type.ITEM_FULFILLMENT,
                                    id: ifId,
                                    values: {
                                        custbody_batched_the_batch_and_attach: finalFileUrl
                                    },
                                    options: {
                                        enableSourcing: false,
                                        ignoreMandatoryFields: true
                                    }
                                });
                                
                                log.audit('reduce', 'TranID: ' + tranId + ' - Successfully processed ' + labelFileIds.length + ' label(s). File URL: ' + finalFileUrl);
                                
                                // Add time tracker line for merging labels
                                // Action ID 7 - Employee 5
                                // Time saved: 5 seconds per original SPS label
                                try {
                                    if (entityId) {
                                        var timeSaved = labelFileIds.length * 5; // 5 seconds per original SPS label
                                        timeTrackerLib.addTimeTrackerLine({
                                            actionId: 7, // Action internal ID 7
                                            customerId: entityId,
                                            timeSaved: timeSaved,
                                            employeeId: 5
                                        });
                                        log.debug('Time Tracker - Merge Labels', 'Added time tracker line for employee 5, action 7, IF: ' + tranId + ', time saved: ' + timeSaved + ' seconds (' + labelFileIds.length + ' labels)');
                                    } else {
                                        log.debug('Time Tracker', 'Skipping time tracker - no customer ID found on IF: ' + tranId);
                                    }
                                } catch (timeTrackerError) {
                                    // Log error but don't fail the merge
                                    log.error('Time Tracker Error - Merge Labels', 'Failed to add time tracker line for IF ' + tranId + ': ' + timeTrackerError.toString());
                                }
                                
                            } catch (updateError) {
                                log.error('reduce', 'TranID: ' + tranId + ' - Error updating IF field with file URL: ' + updateError.toString());
                            }
                            
                        } catch (fileError) {
                            log.error('reduce', 'TranID: ' + tranId + ' - Error loading merged file: ' + fileError.toString());
                        }
                    }).catch(function(error) {
                        log.error('reduce', 'TranID: ' + tranId + ' - Error in merge Promise: ' + error.toString());
                    });
                    
                    // Return early since Promise will handle the rest asynchronously
                    // NOTE: This means the reduce function completes before the merge is done
                    // This is a limitation - you may need to use a Scheduled Script instead
                    return;
                    
                } else {
                    // Direct result (shouldn't happen with PDFlib, but handle it)
                    finalFileId = mergeResult;
                
                if (!finalFileId) {
                    log.error('reduce', 'TranID: ' + tranId + ' - Failed to merge PDFs');
                    return;
                }
                
                log.debug('reduce', 'TranID: ' + tranId + ' - PDFs merged successfully, file ID: ' + finalFileId);
                
                // Get merged file URL
                try {
                    var mergedFile = file.load({ id: finalFileId });
                    var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                    finalFileUrl = 'https://' + domain + mergedFile.url;
                    log.debug('reduce', 'TranID: ' + tranId + ' - Merged file URL: ' + finalFileUrl);
                } catch (fileError) {
                    log.error('reduce', 'TranID: ' + tranId + ' - Error loading merged file: ' + fileError.toString());
                    return;
                    }
                }
            }
            
            // Attach file to IF (whether single or merged)
            try {
                log.debug('reduce', 'TranID: ' + tranId + ' - Attaching file to IF');
                record.attach({
                    record: {
                        type: 'file',
                        id: finalFileId
                    },
                    to: {
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId
                    }
                });
                log.debug('reduce', 'TranID: ' + tranId + ' - Successfully attached file to IF');
            } catch (attachError) {
                log.error('reduce', 'TranID: ' + tranId + ' - Error attaching file: ' + attachError.toString());
            }
            
            // Update IF field with file URL
            try {
                log.debug('reduce', 'TranID: ' + tranId + ' - Updating IF field with file URL');
                record.submitFields({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ifId,
                    values: {
                        custbody_batched_the_batch_and_attach: finalFileUrl
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
                
                log.audit('reduce', 'TranID: ' + tranId + ' - Successfully processed ' + labelFileIds.length + ' label(s). File URL: ' + finalFileUrl);
                
                // Add time tracker line for merging labels (single file rename case)
                // Action ID 7 - Employee 5
                // Time saved: 5 seconds per original SPS label
                try {
                    if (entityId) {
                        var timeSaved = labelFileIds.length * 5; // 5 seconds per original SPS label
                        timeTrackerLib.addTimeTrackerLine({
                            actionId: 7, // Action internal ID 7
                            customerId: entityId,
                            timeSaved: timeSaved,
                            employeeId: 5
                        });
                        log.debug('Time Tracker - Merge Labels', 'Added time tracker line for employee 5, action 7, IF: ' + tranId + ', time saved: ' + timeSaved + ' seconds (' + labelFileIds.length + ' label)');
                    } else {
                        log.debug('Time Tracker', 'Skipping time tracker - no customer ID found on IF: ' + tranId);
                    }
                } catch (timeTrackerError) {
                    // Log error but don't fail the process
                    log.error('Time Tracker Error - Merge Labels', 'Failed to add time tracker line for IF ' + tranId + ': ' + timeTrackerError.toString());
                }
                
            } catch (updateError) {
                log.error('reduce', 'TranID: ' + tranId + ' - Error updating IF field with file URL: ' + updateError.toString());
            }
            
        } catch (e) {
            log.error('reduce', 'Error in reduce function for IF ID ' + ifId + ': ' + e.toString());
        }
    }
    
    /**
     * Gets the SPS Label Archives folder ID
     * Hardcoded since we know it from SPS script (folder ID: 1037)
     * @returns {number} Folder internal ID
     */
    function getSPSLabelArchiveFolderId() {
        // Hardcoded folder ID for "Label Archives" under "SPS Commerce"
        return 1037;
    }
    
    /**
     * Finds all SPS batch print label PDF files for an IF
     * Searches for files in Label Archives folder that match the transaction ID pattern
     * @param {string} ifId - Item Fulfillment internal ID
     * @param {string} tranId - Item Fulfillment transaction ID
     * @param {Date} ifCreatedDate - IF creation date
     * @returns {Array<string>} Array of file internal IDs
     */
    function findSPSLabelFiles(ifId, tranId, ifCreatedDate) {
        var labelFileIds = [];
        
        try {
            log.debug('findSPSLabelFiles', 'TranID: ' + tranId + ' - Searching for SPS label files in Label Archives folder');
            
            // Hardcoded Label Archives folder ID
            var labelArchiveFolderId = 1037;
            log.debug('findSPSLabelFiles', 'TranID: ' + tranId + ' - Using Label Archives folder ID: ' + labelArchiveFolderId);
            
            // Ensure folder ID is a number
            var labelArchiveFolderId = 1037;
            
            // Build filters - search for PDF files in Label Archives folder
            // Simplified filters - removed created date filter as it may cause issues
            var filters = [
                ['filetype', 'is', 'PDF'],
                'AND',
                ['name', 'contains', tranId],
                'AND',
                ['name', 'contains', 'Label'],
                'AND',
                ['folder', 'anyof', 1037]
            ];
            
            log.debug('findSPSLabelFiles', 'TranID: ' + tranId + ' - Filters: ' + JSON.stringify(filters));
            log.debug('findSPSLabelFiles', 'TranID: ' + tranId + ' - About to create search with type: file');
            
            try {
                var fileSearch = search.create({
                    type: 'file',
                    filters: filters,
                    columns: [
                        search.createColumn({ name: 'internalid' }),
                        search.createColumn({ name: 'name' }),
                        search.createColumn({ name: 'created' })
                    ]
                });
                
                
                // Run search and iterate results
                var searchResults = fileSearch.run();
                log.debug('Running search', 'TranID: ' + tranId + ' - Search executed, iterating results');
                
                // Sort results manually after retrieval if needed
                var allResults = [];
                searchResults.each(function(result) {
                    try {
                        var fileId = result.id;
                        var fileName = result.getValue('name');
                        
                        // Don't get created date during iteration - it might cause issues
                        // We'll get it later if needed
                        if (fileId && fileName) {
                            allResults.push({
                                id: fileId,
                                name: fileName
                            });
                        }
                        
                        return true;
                    } catch (resultError) {
                        log.error('findSPSLabelFiles', 'TranID: ' + tranId + ' - Error processing search result: ' + resultError.toString());
                        return true; // Continue with next result
                    }
                });
                
                log.debug('findSPSLabelFiles', 'TranID: ' + tranId + ' - Collected ' + allResults.length + ' file(s) from search');
                
                // Filter and add matching files (no sorting needed - order doesn't matter for merging)
                allResults.forEach(function(fileInfo) {
                    // Additional validation: ensure it matches our pattern
                    if (fileInfo.name && fileInfo.name.indexOf(tranId) >= 0 && fileInfo.name.indexOf('Label') >= 0) {
                        labelFileIds.push(fileInfo.id);
                        log.debug('findSPSLabelFiles', 'TranID: ' + tranId + ' - Found SPS label file: ' + fileInfo.name + ' (ID: ' + fileInfo.id + ')');
                    }
                });
                
            } catch (createError) {
                log.error('findSPSLabelFiles', 'TranID: ' + tranId + ' - Error creating or running search: ' + createError.toString());
                throw createError;
            }
            
            log.debug('findSPSLabelFiles', 'TranID: ' + tranId + ' - Found ' + labelFileIds.length + ' SPS label file(s) in Label Archives folder');
            
        } catch (e) {
            log.error('findSPSLabelFiles', 'TranID: ' + tranId + ' - Error finding SPS label files: ' + e.toString());
        }
        
        return labelFileIds;
    }
    
    /**
     * Merges multiple PDF files into one using PDFlib library
     * 
     * PDFlib Functions Used:
     * - PDFLib.PDFDocument.create() - Creates a new empty PDF document (returns Promise)
     * - PDFLib.PDFDocument.load(bytes) - Loads an existing PDF from bytes (returns Promise)
     * - pdfDoc.getPageCount() - Gets the number of pages in a PDF
     * - pdfDoc.copyPages(sourceDoc, pageIndices) - Copies pages from source to target (returns array of page objects)
     * - pdfDoc.addPage(page) - Adds a page to the document
     * - pdfDoc.save() - Saves the PDF as Uint8Array bytes (returns Promise)
     * 
     * To verify PDFlib is loaded correctly, check the execution logs for:
     * - "PDFlib loaded successfully" message
     * - Any errors about PDFLib being undefined
     * 
     * @param {Array<string>} fileIds - Array of file internal IDs to merge
     * @param {string} poNumber - PO number for file naming
     * @param {string} tranId - Transaction ID for file naming
     * @param {string} locationName - Location name for file naming
     * @returns {string} Internal ID of the merged PDF file, or null if failed
     */
    function mergePDFs(fileIds, poNumber, tranId, locationName) {
        try {
            if (!fileIds || fileIds.length === 0) {
                log.error('mergePDFs', 'TranID: ' + tranId + ' - No file IDs provided for merging');
                return null;
            }
            
            // Verify PDFlib is loaded
            if (!PDFLib || typeof PDFLib.PDFDocument === 'undefined') {
                log.error('mergePDFs', 'TranID: ' + tranId + ' - PDFlib library not loaded correctly. PDFLib object: ' + typeof PDFLib);
                return null;
            }
            
            log.debug('mergePDFs', 'TranID: ' + tranId + ' - PDFlib loaded successfully, starting to merge ' + fileIds.length + ' PDF file(s)');
            
            // Build file name: All carton labels + {relatedponumber} - {location name}
            var fileName = 'All carton labels';
            if (poNumber) {
                fileName += ' ' + poNumber;
            }
            if (locationName) {
                fileName += ' - ' + locationName;
            }
            fileName += '.pdf';
            
            // Get folder ID for merged labels
            var folderId = getMergedLabelsFolderId();
            if (!folderId) {
                log.debug('mergePDFs', 'TranID: ' + tranId + ' - Could not find merged labels folder ID, saving to root folder');
                folderId = null;
            } else {
                log.debug('mergePDFs', 'TranID: ' + tranId + ' - Using folder ID: ' + folderId);
            }
            
            // NOTE: PDFlib uses Promises, which SuiteScript 2.0 Map/Reduce supports
            // However, since reduce() must return synchronously, we'll use a Promise chain
            // and handle the result. NetSuite's JavaScript engine should execute the Promise chain.
            
            // Create the merged PDF document and process all files
            return PDFLib.PDFDocument.create().then(function(mergedPdfDoc) {
                log.debug('mergePDFs', 'TranID: ' + tranId + ' - Created merged PDF document');
                
                // Array to store all PDF loading promises
                var loadPromises = [];
                
                // Load each PDF file from NetSuite
                for (var i = 0; i < fileIds.length; i++) {
                    try {
                        log.debug('mergePDFs', 'TranID: ' + tranId + ' - Loading file ' + (i + 1) + ' of ' + fileIds.length + ' (ID: ' + fileIds[i] + ')');
                        
                        // Load file from NetSuite
                        var pdfFile = file.load({ id: fileIds[i] });
                        
                        // Get file contents - NetSuite returns base64-encoded string for binary files
                        var fileContents = pdfFile.getContents();
                        
                        // Debug: Log file contents info
                        log.debug('mergePDFs', 'TranID: ' + tranId + ' - File ' + (i + 1) + ' contents type: ' + typeof fileContents + ', length: ' + (fileContents ? fileContents.length : 0));
                        
                        // Convert base64 string to Uint8Array for PDFlib
                        // NetSuite's getContents() returns base64-encoded strings for PDF files
                        var pdfBytes = base64ToUint8Array(fileContents);
                        
                        // Debug: Log converted bytes info
                        log.debug('mergePDFs', 'TranID: ' + tranId + ' - File ' + (i + 1) + ' converted to Uint8Array, length: ' + pdfBytes.length);
                        
                        // Load PDF into PDFlib (returns a Promise)
                        var loadPromise = PDFLib.PDFDocument.load(pdfBytes);
                        loadPromises.push({
                            promise: loadPromise,
                            index: i,
                            fileId: fileIds[i]
                        });
                        
                    } catch (fileError) {
                        log.error('mergePDFs', 'TranID: ' + tranId + ' - Error loading file ' + fileIds[i] + ': ' + fileError.toString());
                        // Continue with other files
                    }
                }
                
                // Process all loaded PDFs sequentially to merge them
                return processPDFsSequentially(loadPromises, mergedPdfDoc, tranId);
                
            }).then(function(mergedPdfDoc) {
                // All PDFs processed, now save the merged document
                log.debug('mergePDFs', 'TranID: ' + tranId + ' - All PDFs processed, saving merged document');
                return mergedPdfDoc.save();
                
            }).then(function(mergedPdfBytes) {
                // Save the merged PDF to NetSuite
                log.debug('mergePDFs', 'TranID: ' + tranId + ' - Merged PDF bytes generated (' + mergedPdfBytes.length + ' bytes), saving to NetSuite');
                
                // Convert Uint8Array to base64 for NetSuite file
                var base64Content = uint8ArrayToBase64(mergedPdfBytes);
                
                // Create new file in NetSuite
                var mergedFile = file.create({
                    name: fileName,
                    fileType: file.Type.PDF,
                    contents: base64Content,
                    folder: folderId
                });
                
                var mergedFileId = mergedFile.save();
            log.audit('mergePDFs', 'TranID: ' + tranId + ' - Merged PDF saved with ID: ' + mergedFileId + ', Name: ' + fileName);
            
            return mergedFileId;
                
            }).catch(function(error) {
                log.error('mergePDFs', 'TranID: ' + tranId + ' - Error merging PDFs: ' + error.toString());
                log.error('mergePDFs', 'TranID: ' + tranId + ' - Error stack: ' + (error.stack || 'No stack trace'));
                return null;
            });
            
        } catch (e) {
            log.error('mergePDFs', 'TranID: ' + tranId + ' - Error merging PDFs: ' + e.toString());
            return null;
        }
    }
    
    /**
     * Adds pages from copyPages result to the merged document
     * @param {*} copiedPages - Result from copyPages (could be array, object, etc.)
     * @param {Object} mergedPdfDoc - The target PDF document to merge into
     * @param {string} tranId - Transaction ID for logging
     * @param {number} fileIndex - File index for logging
     * @returns {Promise} Promise that resolves when pages are added
     */
    function addPagesToDocument(copiedPages, mergedPdfDoc, tranId, fileIndex) {
        // Handle different return types from copyPages
        var pagesToAdd = [];
        
        if (Array.isArray(copiedPages)) {
            // Standard case: array of page objects
            pagesToAdd = copiedPages;
        } else if (copiedPages && typeof copiedPages.length !== 'undefined') {
            // Array-like object - convert to array
            for (var j = 0; j < copiedPages.length; j++) {
                if (copiedPages[j] !== undefined && copiedPages[j] !== null) {
                    pagesToAdd.push(copiedPages[j]);
                }
            }
        } else if (copiedPages) {
            // Single object - wrap in array
            pagesToAdd = [copiedPages];
        } else {
            log.error('mergePDFs', 'TranID: ' + tranId + ' - copyPages returned null/undefined');
            return Promise.reject(new Error('copyPages returned null/undefined'));
        }
        
        log.debug('mergePDFs', 'TranID: ' + tranId + ' - Extracted ' + pagesToAdd.length + ' page(s) from copyPages result');
        
        // Add each copied page to the merged document
        var addedCount = 0;
        for (var k = 0; k < pagesToAdd.length; k++) {
            var pageToAdd = pagesToAdd[k];
            if (pageToAdd && typeof pageToAdd === 'object' && pageToAdd !== null) {
                // Check if it's a Promise (shouldn't be, but just in case)
                if (pageToAdd && typeof pageToAdd.then === 'function') {
                    log.error('mergePDFs', 'TranID: ' + tranId + ' - Page ' + (k + 1) + ' is a Promise, not a page object');
                    continue;
                }
                
                try {
                    mergedPdfDoc.addPage(pageToAdd);
                    addedCount++;
                    log.debug('mergePDFs', 'TranID: ' + tranId + ' - Successfully added page ' + (k + 1) + ' of ' + pagesToAdd.length);
                } catch (addError) {
                    log.error('mergePDFs', 'TranID: ' + tranId + ' - Error adding page ' + (k + 1) + ': ' + addError.toString());
                    log.error('mergePDFs', 'TranID: ' + tranId + ' - Page object type: ' + typeof pageToAdd + ', value: ' + String(pageToAdd));
                }
            } else {
                log.error('mergePDFs', 'TranID: ' + tranId + ' - Page ' + (k + 1) + ' is not a valid object, type: ' + typeof pageToAdd + ', value: ' + String(pageToAdd));
            }
        }
        
        log.debug('mergePDFs', 'TranID: ' + tranId + ' - Successfully added ' + addedCount + ' of ' + pagesToAdd.length + ' page(s) from file ' + fileIndex);
        return Promise.resolve();
    }
    
    /**
     * Copies pages from source PDF to merged PDF one at a time
     * This ensures all pages are copied correctly, especially for multi-page PDFs
     * @param {Object} sourcePdfDoc - Source PDF document to copy from
     * @param {Object} mergedPdfDoc - Target PDF document to copy to
     * @param {number} pageCount - Total number of pages to copy
     * @param {string} tranId - Transaction ID for logging
     * @param {number} fileIndex - File index for logging
     * @returns {Promise} Promise that resolves when all pages are copied
     */
    function copyPagesOneByOne(sourcePdfDoc, mergedPdfDoc, pageCount, tranId, fileIndex) {
        if (pageCount === 0) {
            log.debug('copyPagesOneByOne', 'TranID: ' + tranId + ' - No pages to copy from file ' + fileIndex);
            return Promise.resolve();
        }
        
        // Start with the first page (index 0)
        return copyPageRecursive(sourcePdfDoc, mergedPdfDoc, 0, pageCount, tranId, fileIndex);
    }
    
    /**
     * Recursively copies pages one at a time
     * @param {Object} sourcePdfDoc - Source PDF document
     * @param {Object} mergedPdfDoc - Target PDF document
     * @param {number} currentPageIndex - Current page index to copy (0-based)
     * @param {number} totalPages - Total number of pages to copy
     * @param {string} tranId - Transaction ID for logging
     * @param {number} fileIndex - File index for logging
     * @returns {Promise} Promise that resolves when all pages are copied
     */
    function copyPageRecursive(sourcePdfDoc, mergedPdfDoc, currentPageIndex, totalPages, tranId, fileIndex) {
        if (currentPageIndex >= totalPages) {
            // All pages copied
            log.debug('copyPageRecursive', 'TranID: ' + tranId + ' - Finished copying all ' + totalPages + ' page(s) from file ' + fileIndex);
            return Promise.resolve();
        }
        
        try {
            // Copy one page at a time
            var pageIndex = currentPageIndex;
            log.debug('copyPageRecursive', 'TranID: ' + tranId + ' - Copying page ' + (pageIndex + 1) + ' of ' + totalPages + ' from file ' + fileIndex);
            
            // Copy the current page
            var copiedPagesResult = mergedPdfDoc.copyPages(sourcePdfDoc, [pageIndex]);
            
            // Handle Promise or direct result
            var copyPromise;
            if (copiedPagesResult && typeof copiedPagesResult.then === 'function') {
                copyPromise = copiedPagesResult;
            } else {
                copyPromise = Promise.resolve(copiedPagesResult);
            }
            
            return copyPromise.then(function(copiedPages) {
                // copiedPages should be an array with one page
                var pagesArray = [];
                if (Array.isArray(copiedPages)) {
                    pagesArray = copiedPages;
                } else if (copiedPages && typeof copiedPages.length !== 'undefined') {
                    // Array-like object
                    for (var i = 0; i < copiedPages.length; i++) {
                        if (copiedPages[i] !== undefined && copiedPages[i] !== null) {
                            pagesArray.push(copiedPages[i]);
                        }
                    }
                } else if (copiedPages) {
                    // Single object
                    pagesArray = [copiedPages];
                }
                
                if (pagesArray.length === 0) {
                    log.error('copyPageRecursive', 'TranID: ' + tranId + ' - No pages returned from copyPages for page index ' + pageIndex);
                    // Continue with next page
                    return copyPageRecursive(sourcePdfDoc, mergedPdfDoc, currentPageIndex + 1, totalPages, tranId, fileIndex);
                }
                
                // Add the copied page to the merged document
                var pageAdded = false;
                for (var j = 0; j < pagesArray.length; j++) {
                    var pageToAdd = pagesArray[j];
                    if (pageToAdd && typeof pageToAdd === 'object' && pageToAdd !== null) {
                        try {
                            mergedPdfDoc.addPage(pageToAdd);
                            pageAdded = true;
                            log.debug('copyPageRecursive', 'TranID: ' + tranId + ' - Successfully added page ' + (pageIndex + 1) + ' of ' + totalPages + ' from file ' + fileIndex);
                        } catch (addError) {
                            log.error('copyPageRecursive', 'TranID: ' + tranId + ' - Error adding page ' + (pageIndex + 1) + ': ' + addError.toString());
                        }
                    }
                }
                
                if (!pageAdded) {
                    log.error('copyPageRecursive', 'TranID: ' + tranId + ' - Failed to add page ' + (pageIndex + 1) + ' from file ' + fileIndex);
                }
                
                // Recursively copy the next page
                return copyPageRecursive(sourcePdfDoc, mergedPdfDoc, currentPageIndex + 1, totalPages, tranId, fileIndex);
            }).catch(function(copyError) {
                log.error('copyPageRecursive', 'TranID: ' + tranId + ' - Error copying page ' + (pageIndex + 1) + ' from file ' + fileIndex + ': ' + copyError.toString());
                // Continue with next page even if this one failed
                return copyPageRecursive(sourcePdfDoc, mergedPdfDoc, currentPageIndex + 1, totalPages, tranId, fileIndex);
            });
            
        } catch (error) {
            log.error('copyPageRecursive', 'TranID: ' + tranId + ' - Error in copyPageRecursive for page ' + (currentPageIndex + 1) + ': ' + error.toString());
            // Continue with next page
            return copyPageRecursive(sourcePdfDoc, mergedPdfDoc, currentPageIndex + 1, totalPages, tranId, fileIndex);
        }
    }
    
    /**
     * Processes PDFs sequentially to merge them into the target document
     * @param {Array} loadPromises - Array of {promise, index, fileId} objects
     * @param {Object} mergedPdfDoc - The target PDF document to merge into
     * @param {string} tranId - Transaction ID for logging
     * @returns {Promise} Promise that resolves when all PDFs are merged
     */
    function processPDFsSequentially(loadPromises, mergedPdfDoc, tranId) {
        if (loadPromises.length === 0) {
            return Promise.resolve(mergedPdfDoc);
        }
        
        var currentPromise = loadPromises[0];
        return currentPromise.promise.then(function(sourcePdfDoc) {
            try {
                var pageCount = sourcePdfDoc.getPageCount();
                log.debug('mergePDFs', 'TranID: ' + tranId + ' - File ' + (currentPromise.index + 1) + ' has ' + pageCount + ' page(s)');
                
                // Copy pages one at a time to ensure all pages are merged
                // This approach is more reliable than copying all pages at once
                return copyPagesOneByOne(sourcePdfDoc, mergedPdfDoc, pageCount, tranId, currentPromise.index + 1).then(function() {
                    // Process next PDF after all pages are added
                    return processPDFsSequentially(loadPromises.slice(1), mergedPdfDoc, tranId);
                });
                
            } catch (copyError) {
                log.error('mergePDFs', 'TranID: ' + tranId + ' - Error copying pages from file ' + currentPromise.fileId + ': ' + copyError.toString());
                log.error('mergePDFs', 'TranID: ' + tranId + ' - Error stack: ' + (copyError.stack || 'No stack trace'));
                // Continue with next file
                return processPDFsSequentially(loadPromises.slice(1), mergedPdfDoc, tranId);
            }
        }).catch(function(loadError) {
            log.error('mergePDFs', 'TranID: ' + tranId + ' - Error loading PDF file ' + currentPromise.fileId + ': ' + loadError.toString());
            // Continue with next file
            return processPDFsSequentially(loadPromises.slice(1), mergedPdfDoc, tranId);
        });
    }
    
    /**
     * NetSuite-compatible base64 decode (replaces atob)
     * @param {string} base64 - Base64 encoded string
     * @returns {string} Decoded binary string
     */
    function base64Decode(base64) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        var output = '';
        var i = 0;
        base64 = base64.replace(/[^A-Za-z0-9\+\/\=]/g, '');
        
        while (i < base64.length) {
            var enc1 = chars.indexOf(base64.charAt(i++));
            var enc2 = chars.indexOf(base64.charAt(i++));
            var enc3 = chars.indexOf(base64.charAt(i++));
            var enc4 = chars.indexOf(base64.charAt(i++));
            
            var bitmap = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
            
            if (enc3 === 64) {
                output += String.fromCharCode((bitmap >> 16) & 255);
            } else if (enc4 === 64) {
                output += String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255);
            } else {
                output += String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255, bitmap & 255);
            }
        }
        
        return output;
    }
    
    /**
     * Converts base64 string to Uint8Array
     * @param {string} base64 - Base64 encoded string
     * @returns {Uint8Array} Decoded bytes
     */
    function base64ToUint8Array(base64) {
        // Remove data URL prefix if present (e.g., "data:application/pdf;base64,")
        var base64Data = base64.replace(/^data:.*?;base64,/, '');
        
        // Decode base64 to binary string using NetSuite-compatible function
        var binaryString = base64Decode(base64Data);
        
        // Convert binary string to Uint8Array
        var bytes = new Uint8Array(binaryString.length);
        for (var i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes;
    }
    
    /**
     * Converts string to Uint8Array (for non-base64 strings)
     * @param {string} str - String to convert
     * @returns {Uint8Array} Converted bytes
     */
    function stringToUint8Array(str) {
        var bytes = new Uint8Array(str.length);
        for (var i = 0; i < str.length; i++) {
            bytes[i] = str.charCodeAt(i);
        }
        return bytes;
    }
    
    /**
     * NetSuite-compatible base64 encode (replaces btoa)
     * @param {string} binary - Binary string to encode
     * @returns {string} Base64 encoded string
     */
    function base64Encode(binary) {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
        var output = '';
        var i = 0;
        
        while (i < binary.length) {
            var a = binary.charCodeAt(i++);
            var b = i < binary.length ? binary.charCodeAt(i++) : 0;
            var c = i < binary.length ? binary.charCodeAt(i++) : 0;
            
            var bitmap = (a << 16) | (b << 8) | c;
            
            output += chars.charAt((bitmap >> 18) & 63);
            output += chars.charAt((bitmap >> 12) & 63);
            output += i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=';
            output += i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=';
        }
        
        return output;
    }
    
    /**
     * Converts Uint8Array to base64 string
     * @param {Uint8Array} bytes - Bytes to convert
     * @returns {string} Base64 encoded string
     */
    function uint8ArrayToBase64(bytes) {
        var binary = '';
        for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return base64Encode(binary);
    }
    
    /**
     * Gets the folder ID for merged labels
     * Hardcoded folder ID - update this value if the folder ID changes
     * @returns {number} Folder internal ID
     */
    function getMergedLabelsFolderId() {
        // Hardcoded folder ID for merged labels
        var folderId = 2021;
        log.debug('getMergedLabelsFolderId', 'Hardcoded merged labels folder ID: ' + folderId);
        return Number(folderId);
    }
    
    /**
     * Summarize function - logs final results
     * @param {Object} summaryContext
     */
    function summarize(summaryContext) {
        log.audit('summarize', 'Map/Reduce script completed');
        log.audit('summarize', 'Usage: ' + summaryContext.usage);
        log.audit('summarize', 'Yields: ' + summaryContext.yields);
    }
    
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});

