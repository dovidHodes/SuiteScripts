/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @description Simple scheduled script to call POD suitelet for packages in a saved search.
 * This script loops through packages and generates suitelet URLs to call the POD retrieval suitelet.
 */
define(['N/search', 'N/https', 'N/runtime', 'N/url'], 
    function(search, https, runtime, url) {

    function execute(context) {
        try {
            // Start with basic logging to confirm script is running
            log.audit('Simple POD Retrieval', '=== SCRIPT STARTED ===');
            log.audit('Simple POD Retrieval', `Script ID: ${runtime.getCurrentScript().id}`);
            log.audit('Simple POD Retrieval', `Deployment ID: ${runtime.getCurrentScript().deploymentId}`);
            log.audit('Simple POD Retrieval', `Execution Context: ${runtime.executionContext}`);
            
            // Get the saved search ID from script parameters
            const savedSearchId = runtime.getCurrentScript().getParameter({name: 'custscript_saved_search_id'});
            
            log.audit('Simple POD Retrieval', `Parameter savedSearchId: ${savedSearchId}`);
            
            if (!savedSearchId) {
                log.error('Simple POD Retrieval Error', 'Saved search ID not found in script parameters');
                log.audit('Simple POD Retrieval', '=== SCRIPT FAILED - NO SAVED SEARCH ID ===');
                return;
            }
            
            log.audit('Simple POD Retrieval', `Using saved search ID: ${savedSearchId}`);
            
            // Load the saved search with error handling
            let savedSearch;
            try {
                savedSearch = search.load({id: savedSearchId});
                log.audit('Simple POD Retrieval', 'Successfully loaded saved search');
            } catch (searchLoadError) {
                log.error('Simple POD Retrieval Error', `Failed to load saved search ${savedSearchId}: ${searchLoadError.message}`);
                log.audit('Simple POD Retrieval', '=== SCRIPT FAILED - SAVED SEARCH LOAD ERROR ===');
                return;
            }
            
            // Execute the search with error handling
            let searchResult;
            try {
                searchResult = savedSearch.run();
                log.audit('Simple POD Retrieval', 'Successfully executed saved search');
            } catch (searchRunError) {
                log.error('Simple POD Retrieval Error', `Failed to run saved search: ${searchRunError.message}`);
                log.audit('Simple POD Retrieval', '=== SCRIPT FAILED - SAVED SEARCH RUN ERROR ===');
                return;
            }
            
            // Get search results with error handling
            let searchResultRange;
            try {
                searchResultRange = searchResult.getRange({start: 0, end: 1000}); // Process up to 1000 records
                log.audit('Simple POD Retrieval', `Found ${searchResultRange.length} packages to process`);
            } catch (rangeError) {
                log.error('Simple POD Retrieval Error', `Failed to get search results range: ${rangeError.message}`);
                log.audit('Simple POD Retrieval', '=== SCRIPT FAILED - SEARCH RANGE ERROR ===');
                return;
            }
            
            if (searchResultRange.length === 0) {
                log.audit('Simple POD Retrieval', 'No packages found in search results');
                log.audit('Simple POD Retrieval', '=== SCRIPT COMPLETED - NO PACKAGES ===');
                return;
            }
            
            let processedCount = 0;
            let successCount = 0;
            let errorCount = 0;
            let skippedCount = 0;
            let duplicateCount = 0;
            
            // Track processed package IDs to avoid duplicates
            const processedPackageIds = new Set();
            
            // Process each package
            for (let i = 0; i < searchResultRange.length; i++) {
                try {
                    const result = searchResultRange[i];
                    const recordId = result.id;
                    
                    // Check if we've already processed this package
                    if (processedPackageIds.has(recordId)) {
                        log.audit('Simple POD Retrieval', `Skipping duplicate package ${recordId} at index ${i}`);
                        duplicateCount++;
                        continue;
                    }
                    
                    // Add to processed set
                    processedPackageIds.add(recordId);
                    
                    log.audit('Simple POD Retrieval', `Processing package ${i + 1}/${searchResultRange.length}: ${recordId}`);
                    
                    // Get the tracking number from the record
                    let trackingNumber;
                    try {
                        trackingNumber = result.getValue({name: 'custrecord_sps_track_num'});
                        log.audit('Simple POD Retrieval', `Package ${recordId} tracking number: ${trackingNumber ? 'Found' : 'NOT FOUND'}`);
                    } catch (getValueError) {
                        log.error('Simple POD Retrieval Error', `Failed to get tracking number for package ${recordId}: ${getValueError.message}`);
                        errorCount++;
                        continue;
                    }
                    
                    if (!trackingNumber) {
                        log.audit('Simple POD Retrieval', `No tracking number found for package ${recordId} - skipping`);
                        skippedCount++;
                        continue;
                    }
                    
                    // Generate the suitelet URL
                    const baseUrl = 'https://6448561.app.netsuite.com'; // Replace with your NetSuite account URL
                    const suiteletUrl = `${baseUrl}/app/site/hosting/scriptlet.nl?script=2844&deploy=1&compid=6448561&tracking=${encodeURIComponent(trackingNumber)}&recordId=${recordId}`;
                    
                    log.audit('Simple POD Retrieval', `Generated suitelet URL for package ${recordId}: ${suiteletUrl.substring(0, 100)}...`);
                    
                    // Call the suitelet URL
                    let response;
                    try {
                        response = https.get({
                            url: suiteletUrl,
                            headers: {
                                'User-Agent': 'NetSuite Scheduled Script'
                            }
                        });
                        
                        log.audit('Simple POD Retrieval', `Response code for package ${recordId}: ${response.code}`);
                        
                        if (response.code >= 200 && response.code < 300) {
                            successCount++;
                            log.audit('Simple POD Retrieval', `Successfully processed package ${recordId}`);
                        } else {
                            errorCount++;
                            log.error('Simple POD Retrieval', `Failed to process package ${recordId}: HTTP ${response.code}`);
                            log.error('Simple POD Retrieval', `Response body: ${response.body.substring(0, 200)}...`);
                        }
                        
                    } catch (httpsError) {
                        errorCount++;
                        log.error('Simple POD Retrieval', `HTTPS error for package ${recordId}: ${httpsError.message}`);
                    }
                    
                    processedCount++;
                    
                    // Log progress every 10 records
                    if ((i + 1) % 10 === 0) {
                        log.audit('Simple POD Retrieval', `Progress: ${i + 1}/${searchResultRange.length} packages processed`);
                    }
                    
                } catch (packageError) {
                    errorCount++;
                    log.error('Simple POD Retrieval', `Error processing package at index ${i}: ${packageError.message}`);
                }
            }
            
            log.audit('Simple POD Retrieval', `=== PROCESSING COMPLETE ===`);
            log.audit('Simple POD Retrieval', `Total search results: ${searchResultRange.length}`);
            log.audit('Simple POD Retrieval', `Unique packages found: ${processedPackageIds.size}`);
            log.audit('Simple POD Retrieval', `Processed: ${processedCount}`);
            log.audit('Simple POD Retrieval', `Success: ${successCount}`);
            log.audit('Simple POD Retrieval', `Errors: ${errorCount}`);
            log.audit('Simple POD Retrieval', `Skipped (no tracking): ${skippedCount}`);
            log.audit('Simple POD Retrieval', `Skipped (duplicates): ${duplicateCount}`);
            log.audit('Simple POD Retrieval', '=== SCRIPT COMPLETED SUCCESSFULLY ===');
            
        } catch (error) {
            log.error('Simple POD Retrieval Error', `Critical error: ${error.message}`);
            log.error('Simple POD Retrieval Error', `Error stack: ${error.stack}`);
            log.audit('Simple POD Retrieval', '=== SCRIPT FAILED WITH CRITICAL ERROR ===');
        }
    }

    return {
        execute: execute
    };
});
