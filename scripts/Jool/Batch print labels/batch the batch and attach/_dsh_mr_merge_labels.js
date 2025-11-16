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
            var parametersString = runtime.getCurrentScript().getParameter({ name: 'custscript_dsh_mr_merge_labels_json' });
            log.debug('getInputData', 'Parameters: ' + parametersString);
            
            var parametersObj = JSON.parse(parametersString);
            var ifId = parametersObj.itemFulfillmentId;
            
            if (!ifId) {
                throw new Error('Item Fulfillment ID not provided in parameters');
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
            log.debug('map', 'Processing IF: ' + ifId);
            
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
            log.debug('reduce', 'Starting label merge for IF: ' + ifId);
            
            // Load IF to get transaction ID and PO number
            var ifRecord = record.load({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId
            });
            var tranId = ifRecord.getValue('tranid');
            var poNumber = ifRecord.getValue('custbody_sps_ponum_from_salesorder') || '';
            var ifCreatedDate = ifRecord.getValue('createddate');
            
            log.debug('reduce', 'IF Details - Tran ID: ' + tranId + ', PO: ' + poNumber);
            
            // Find all SPS label PDF files for this IF
            var labelFileIds = findSPSLabelFiles(ifId, tranId, ifCreatedDate);
            
            if (labelFileIds.length === 0) {
                log.audit('reduce', 'No SPS label files found for IF ' + tranId + ' (ID: ' + ifId + ')');
                return;
            }
            
            log.debug('reduce', 'Found ' + labelFileIds.length + ' label file(s) for IF ' + tranId);
            
            // Merge the PDFs
            var mergedFileId = mergePDFs(labelFileIds, poNumber, tranId);
            
            if (!mergedFileId) {
                log.error('reduce', 'Failed to merge PDFs for IF ' + tranId);
                return;
            }
            
            // Attach merged PDF to IF
            try {
                record.attach({
                    record: {
                        type: 'file',
                        id: mergedFileId
                    },
                    to: {
                        type: record.Type.ITEM_FULFILLMENT,
                        id: ifId
                    }
                });
                log.debug('reduce', 'Attached merged PDF to IF ' + tranId);
            } catch (attachError) {
                log.error('reduce', 'Error attaching merged PDF to IF ' + tranId + ': ' + attachError.toString());
            }
            
            // Get file URL and update IF field
            try {
                var mergedFile = file.load({ id: mergedFileId });
                var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                var fileUrl = 'https://' + domain + mergedFile.url;
                
                record.submitFields({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: ifId,
                    values: {
                        custbody_batched_the_batch_and_attach: fileUrl
                    },
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
                
                log.audit('reduce', 'Successfully merged ' + labelFileIds.length + ' label(s) for IF ' + tranId + '. Merged PDF URL: ' + fileUrl);
                
            } catch (updateError) {
                log.error('reduce', 'Error updating IF field with merged PDF URL: ' + updateError.toString());
            }
            
        } catch (e) {
            log.error('reduce', 'Error in reduce function: ' + e.toString());
        }
    }
    
    /**
     * Gets the SPS Label Archives folder ID
     * SPS labels are stored in "Label Archives" folder under "SPS Commerce" parent
     * @returns {number} Folder internal ID, or null if not found
     */
    function getSPSLabelArchiveFolderId() {
        try {
            var folderSearch = search.create({
                type: search.Type.FOLDER,
                filters: [
                    ['name', 'is', 'Label Archives'],
                    'AND',
                    ['parent', 'is', 'SPS Commerce']
                ],
                columns: [
                    search.createColumn({ name: 'internalid' })
                ]
            });
            
            var folderId = null;
            folderSearch.run().each(function(result) {
                folderId = result.id;
                return false; // Get first result
            });
            
            if (folderId) {
                log.debug('getSPSLabelArchiveFolderId', 'Found Label Archives folder: ' + folderId);
                return Number(folderId);
            }
            
            log.error('getSPSLabelArchiveFolderId', 'Label Archives folder not found under SPS Commerce');
            return null;
            
        } catch (e) {
            log.error('getSPSLabelArchiveFolderId', 'Error getting Label Archives folder ID: ' + e.toString());
            return null;
        }
    }
    
    /**
     * Finds all SPS batch print label PDF files for an IF
     * Searches specifically in the "Label Archives" folder
     * @param {string} ifId - Item Fulfillment internal ID
     * @param {string} tranId - Item Fulfillment transaction ID
     * @param {Date} ifCreatedDate - IF creation date
     * @returns {Array<string>} Array of file internal IDs
     */
    function findSPSLabelFiles(ifId, tranId, ifCreatedDate) {
        var labelFileIds = [];
        
        try {
            // Get the SPS Label Archives folder ID
            var labelArchiveFolderId = getSPSLabelArchiveFolderId();
            
            if (!labelArchiveFolderId) {
                log.error('findSPSLabelFiles', 'Could not find Label Archives folder, searching all folders');
            }
            
            // Build filters - search for PDF files that match SPS label patterns
            var filters = [
                ['filetype', 'is', 'PDF'],
                'AND',
                ['name', 'contains', tranId],
                'AND',
                ['name', 'contains', 'Label'],
                'AND',
                ['created', 'after', ifCreatedDate]
            ];
            
            // Add folder filter if we found the folder
            if (labelArchiveFolderId) {
                filters.push('AND');
                filters.push(['folder', 'anyof', labelArchiveFolderId]);
            }
            
            var fileSearch = search.create({
                type: search.Type.FILE,
                filters: filters,
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'name' }),
                    search.createColumn({ name: 'created' }),
                    search.createColumn({ name: 'folder' })
                ]
            });
            
            // Sort by created date ascending to merge in order
            fileSearch.sortBy = [
                search.createColumn({ name: 'created', sort: search.Sort.ASC })
            ];
            
            fileSearch.run().each(function(result) {
                var fileId = result.id;
                var fileName = result.getValue('name');
                var fileFolder = result.getValue('folder');
                
                // Additional validation: ensure it's an SPS label file
                // SPS labels typically have patterns like: "{tranid} Label {X} of {Y}.pdf"
                if (fileName && fileName.indexOf(tranId) >= 0 && fileName.indexOf('Label') >= 0) {
                    labelFileIds.push(fileId);
                    log.debug('findSPSLabelFiles', 'Found SPS label file: ' + fileName + ' (ID: ' + fileId + ', Folder: ' + fileFolder + ')');
                }
                
                return true;
            });
            
            log.debug('findSPSLabelFiles', 'Found ' + labelFileIds.length + ' SPS label file(s) for IF ' + tranId + ' in Label Archives folder');
            
        } catch (e) {
            log.error('findSPSLabelFiles', 'Error finding SPS label files: ' + e.toString());
        }
        
        return labelFileIds;
    }
    
    /**
     * Merges multiple PDF files into one using N/render PDF set
     * @param {Array<string>} fileIds - Array of file internal IDs to merge
     * @param {string} poNumber - PO number for file naming
     * @param {string} tranId - Transaction ID for file naming
     * @returns {string} Internal ID of the merged PDF file, or null if failed
     */
    function mergePDFs(fileIds, poNumber, tranId) {
        try {
            if (!fileIds || fileIds.length === 0) {
                log.error('mergePDFs', 'No file IDs provided for merging');
                return null;
            }
            
            log.debug('mergePDFs', 'Merging ' + fileIds.length + ' PDF file(s)');
            
            // Create PDF set
            var pdfSet = render.createPdfSet();
            pdfSet.async = false; // Required for PDF set
            
            // Add each PDF file to the set
            for (var i = 0; i < fileIds.length; i++) {
                try {
                    var pdfFile = file.load({ id: fileIds[i] });
                    pdfSet.add({
                        file: pdfFile
                    });
                    log.debug('mergePDFs', 'Added file ' + (i + 1) + ' of ' + fileIds.length + ' to PDF set');
                } catch (fileError) {
                    log.error('mergePDFs', 'Error loading file ' + fileIds[i] + ': ' + fileError.toString());
                    // Continue with other files
                }
            }
            
            // Render the merged PDF
            var mergedPdf = pdfSet.render();
            
            // Build file name: {poname}_{IFname}_MERGED LABELS.pdf
            var fileName = '';
            if (poNumber) {
                fileName = poNumber + '_';
            }
            fileName += tranId + '_MERGED LABELS.pdf';
            
            log.debug('mergePDFs', 'Merged PDF created, saving as: ' + fileName);
            
            // Get folder ID for merged labels
            // TODO: Replace with actual folder ID from the URL provided
            // The folder URL was: https://8227984.app.netsuite.com/app/common/media/mediaitemfolders.nl
            // You'll need to get the folder ID from NetSuite UI or create a search
            var folderId = getMergedLabelsFolderId();
            
            if (!folderId) {
                log.error('mergePDFs', 'Could not find merged labels folder ID');
                // Save to root folder as fallback
                folderId = null;
            }
            
            // Set folder and name
            mergedPdf.folder = folderId;
            mergedPdf.name = fileName;
            
            // Save the merged PDF
            var mergedFileId = mergedPdf.save();
            
            log.audit('mergePDFs', 'Merged PDF saved with ID: ' + mergedFileId + ', Name: ' + fileName);
            
            return mergedFileId;
            
        } catch (e) {
            log.error('mergePDFs', 'Error merging PDFs: ' + e.toString());
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

