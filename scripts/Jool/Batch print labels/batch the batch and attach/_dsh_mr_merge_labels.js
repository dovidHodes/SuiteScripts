/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * 
 * Map/Reduce script that merges all SPS batch print label PDFs for an Item Fulfillment
 * into a single PDF file.
 * 
 * Process:
 * 1. Get IF ID from parameters
 * 2. Find all SPS label PDF files attached to the IF
 * 3. Merge them using N/render PDF set
 * 4. Save merged PDF with name: {poname}_{IFname}_MERGED LABELS.pdf
 * 5. Save to specified folder
 * 6. Attach merged PDF to IF
 * 7. Update custbody_batched_the_batch_and_attach field with file URL
 */

define(['N/search', 'N/record', 'N/file', 'N/render', 'N/url', 'N/log', 'N/runtime'], function (search, record, file, render, url, log, runtime) {
    
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
            
            // If only one file, rename it to the carton label naming pattern
            if (labelFileIds.length === 1) {
                log.debug('reduce', 'TranID: ' + tranId + ' - Only one label file found, renaming to carton label format');
                finalFileId = labelFileIds[0];
                
                // Load the file and rename it
                try {
                    var singleFile = file.load({ id: finalFileId });
                    
                    // Build new file name: carton label + {relatedponumber} - {location name}
                    var newFileName = 'carton label';
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
                // Multiple files - merge them
                log.debug('reduce', 'TranID: ' + tranId + ' - Merging ' + labelFileIds.length + ' PDF file(s)');
                finalFileId = mergePDFs(labelFileIds, poNumber, tranId, locationName);
                
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
     * Merges multiple PDF files into one using N/render PDF set
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
            
            log.debug('mergePDFs', 'TranID: ' + tranId + ' - Starting to merge ' + fileIds.length + ' PDF file(s)');
            
            // Create PDF set using render.create() with type PDF_SET
            var pdfSet = render.create({
                type: render.Type.PDF_SET
            });
            
            log.debug('mergePDFs', 'TranID: ' + tranId + ' - Created PDF set, adding ' + fileIds.length + ' file(s)');
            
            // Add each PDF file to the set
            for (var i = 0; i < fileIds.length; i++) {
                try {
                    var pdfFile = file.load({ id: fileIds[i] });
                    pdfSet.add({
                        file: pdfFile
                    });
                    log.debug('mergePDFs', 'TranID: ' + tranId + ' - Added file ' + (i + 1) + ' of ' + fileIds.length + ' to PDF set');
                } catch (fileError) {
                    log.error('mergePDFs', 'TranID: ' + tranId + ' - Error loading file ' + fileIds[i] + ': ' + fileError.toString());
                    // Continue with other files
                }
            }
            
            // Render the merged PDF
            log.debug('mergePDFs', 'TranID: ' + tranId + ' - Rendering merged PDF');
            var mergedPdf = pdfSet.render();
            
            // Build file name: carton label + {relatedponumber} - {location name}
            var fileName = 'carton label';
            if (poNumber) {
                fileName += ' ' + poNumber;
            }
            if (locationName) {
                fileName += ' - ' + locationName;
            }
            fileName += '.pdf';
            
            log.debug('mergePDFs', 'TranID: ' + tranId + ' - Merged PDF rendered, saving as: ' + fileName);
            
            // Get folder ID for merged labels
            var folderId = getMergedLabelsFolderId();
            
            if (!folderId) {
                log.debug('mergePDFs', 'TranID: ' + tranId + ' - Could not find merged labels folder ID, saving to root folder');
                folderId = null;
            } else {
                log.debug('mergePDFs', 'TranID: ' + tranId + ' - Using folder ID: ' + folderId);
            }
            
            // Set folder and name
            mergedPdf.folder = folderId;
            mergedPdf.name = fileName;
            
            // Save the merged PDF
            log.debug('mergePDFs', 'TranID: ' + tranId + ' - Saving merged PDF file');
            var mergedFileId = mergedPdf.save();
            
            log.audit('mergePDFs', 'TranID: ' + tranId + ' - Merged PDF saved with ID: ' + mergedFileId + ', Name: ' + fileName);
            
            return mergedFileId;
            
        } catch (e) {
            log.error('mergePDFs', 'TranID: ' + tranId + ' - Error merging PDFs: ' + e.toString());
            return null;
        }
    }
    
    /**
     * Gets the folder ID for merged labels
     * The folder URL provided was: https://8227984.app.netsuite.com/app/common/media/mediaitemfolders.nl
     * This function searches for the folder - you may need to update with the actual folder name
     * or hardcode the folder ID if you know it
     * @returns {number} Folder internal ID, or null if not found
     */
    function getMergedLabelsFolderId() {
        try {
            // Option 1: Search for folder by name (update the name to match your folder)
            // Common names might be: "MERGED LABELS", "Merged Labels", "Batch and Attach", etc.
            var folderSearch = search.create({
                type: search.Type.FOLDER,
                filters: [
                    [
                        ['name', 'contains', 'MERGED LABELS'],
                        'OR',
                        ['name', 'contains', 'Merged Labels'],
                        'OR',
                        ['name', 'contains', 'Batch and Attach']
                    ]
                ],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'name' })
                ]
            });
            
            var folderId = null;
            var folderName = null;
            folderSearch.run().each(function(result) {
                folderId = result.id;
                folderName = result.getValue('name');
                return false; // Get first result
            });
            
            if (folderId) {
                log.debug('getMergedLabelsFolderId', 'Found merged labels folder: ' + folderName + ' (ID: ' + folderId + ')');
                return Number(folderId);
            }
            
            // Option 2: If you know the folder ID from the URL, hardcode it here
            // To find the folder ID:
            // 1. Go to the folder in NetSuite
            // 2. Check the URL - it may contain the ID
            // 3. Or create a saved search to find it
            // Example: return 12345; // Replace with actual folder ID
            
            log.debug('getMergedLabelsFolderId', 'Merged labels folder not found by name, will use root folder');
            log.debug('getMergedLabelsFolderId', 'To fix: Either update the folder name in the search, or hardcode the folder ID in this function');
            return null;
            
        } catch (e) {
            log.error('getMergedLabelsFolderId', 'Error getting folder ID: ' + e.toString());
            return null;
        }
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

