/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Suitelet for automated FedEx POD (Proof of Delivery) document retrieval and attachment to package records. 
 * This script processes tracking numbers through the FedEx API to fetch POD documents and automatically attaches 
 * them to the corresponding NetSuite package records. The script updates record status fields to reflect success 
 * or error states. Future versions will include UPS POD retrieval capabilities. 
 * IMPORTANT: Edit the FedEx API credentials in the script deployment parameters before use.
 */
define(['N/https', 'N/encode', 'N/runtime', 'N/record', 'N/file', 'N/url'], 
    function(https, encode, runtime, record, file, url) {
    
    /**
     * Create EDI error record for tracking errors
     * @param {string} recordId - The package record ID
     * @param {string} errorMessage - The error message
     * @param {string} tradingPartnerId - The trading partner ID (optional)
     */
    function createEDIErrorRecord(recordId, errorMessage, tradingPartnerId) {
        try {
            const ediErrorRecord = record.create({
                type: 'customrecord_edi_error'
            });
            
            ediErrorRecord.setValue({
                fieldId: 'custrecord236', //package record field
                value: recordId
            });
            
            ediErrorRecord.setValue({
                fieldId: 'custrecord233', // Action field
                value: 9 // Get POD action
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
            log.audit('EDI Error Record Created', `EDI Error ID: ${ediErrorId} for Package: ${recordId}`);
            
        } catch (error) {
            log.error('Error creating EDI error record', `Package ID: ${recordId}, Error: ${error.message}`);
        }
    }

    function onRequest(context) {
        try {
            if (context.request.method === 'GET') {
                handleGetRequest(context);
            } else {
                context.response.write('Method not allowed');
            }
        } catch (error) {
            log.error('Suitelet Error', error);
            
            const recordId = context.request.parameters.recordId;
            if (recordId) {
                // Create safety error record for any unhandled errors
                createEDIErrorRecord(recordId, 'Suitelet Error: ' + error.message);
                
                // Update package record with error status as safety net
                try {
                    record.submitFields({
                        type: 'customrecord_sps_package',
                        id: recordId,
                        values: {
                            'custrecord_pod_status': 4,
                            'custrecord_pod_message': `Suitelet Error: ${error.message}`
                        }
                    });
                    log.audit('Suitelet Error', 'Package record error status updated');
                } catch (updateError) {
                    log.error('Failed to update package record with suitelet error status', updateError);
                }
                
                redirectToRecord(context, recordId, 'Error: ' + error.message);
            } else {
                context.response.write('Error: ' + error.message);
            }
        }
    }
    function handleGetRequest(context) {
        const trackingNumber = context.request.parameters.tracking;
        const recordId = context.request.parameters.recordId;
        
        if (!trackingNumber) {
            if (recordId) {
                createEDIErrorRecord(recordId, 'Error: Tracking number is required');
            }
            redirectToRecord(context, recordId, 'Error: Tracking number is required');
            return;
        }

        if (!recordId) {
            context.response.write('Error: Record ID is required');
            return;
        }

        log.audit('POD Suitelet', `Processing tracking: ${trackingNumber} for record: ${recordId}`);

        // Determine carrier based on tracking number format
        const carrier = detectCarrier(trackingNumber);
        
        if (carrier === 'UPS') {
            const result = getUPSPOD(trackingNumber, recordId);
            if (result.success) {
                redirectToRecord(context, recordId, 'Success: ' + result.message);
            } else {
                redirectToRecord(context, recordId, 'Error: ' + result.error);
            }
        } else {
            // Default to FedEx
            const result = getFedExPOD(trackingNumber, recordId);
            if (result.success) {
                redirectToRecord(context, recordId, 'Success: POD document retrieved and attached successfully');
            } else {
                redirectToRecord(context, recordId, 'Error: ' + result.error);
            }
        }
    }
    function detectCarrier(trackingNumber) {
        // UPS tracking numbers typically start with 1Z, 3Z, or are 18 digits
        if (trackingNumber.startsWith('1Z') || trackingNumber.startsWith('3Z') || trackingNumber.length === 18) {
            return 'UPS';
        }
        
        // FedEx tracking numbers are typically 12-15 digits or start with specific patterns
        // This is a simplified detection - you may want to enhance this logic
        return 'FEDEX';
    }
    function getUPSPOD(trackingNumber, recordId) {
        try {
            log.audit('UPS POD Suitelet', `UPS POD retrieval requested for tracking: ${trackingNumber}`);
            
                         // Update package record with error status and message using submitFields for better performance
             log.audit('UPS POD Suitelet', 'Updating package record with UPS not available status...');
             record.submitFields({
                 type: 'customrecord_sps_package',
                 id: recordId,
                 values: {
                     'custrecord_pod_status': 4,
                     'custrecord_pod_message': 'UPS POD retrieval not yet available. This feature will be implemented in a future update.'
                 }
             });
            log.audit('UPS POD Suitelet', 'Package record UPS not available status updated');
            
            // Create EDI error record for UPS not available
            //createEDIErrorRecord(recordId, 'UPS POD retrieval not yet available. This feature will be implemented in a future update.');
            
            return {
                success: false,
                error: 'UPS POD retrieval not yet available. This feature will be implemented in a future update.',
                carrier: 'UPS',
                trackingNumber: trackingNumber,
                recordId: recordId,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            log.error('UPS POD Suitelet Error', error);
            
            // Create EDI error record for UPS error
            createEDIErrorRecord(recordId, `UPS POD error: ${error.message}`);
            
                         // Update package record with error status and message using submitFields for better performance
             try {
                 log.audit('UPS POD Suitelet', 'Updating package record with UPS error status...');
                 record.submitFields({
                     type: 'customrecord_sps_package',
                     id: recordId,
                     values: {
                         'custrecord_pod_status': 4,
                         'custrecord_pod_message': `UPS POD error: ${error.message}`
                     }
                 });
                log.audit('UPS POD Suitelet', 'Package record UPS error status updated');
            } catch (updateError) {
                log.error('Failed to update package record with UPS error status', updateError);
            }
            
            return {
                success: false,
                error: `UPS POD error: ${error.message}`,
                carrier: 'UPS',
                trackingNumber: trackingNumber,
                recordId: recordId,
                timestamp: new Date().toISOString()
            };
        }
    }
    function redirectToRecord(context, recordId, message) {
        try {
            // Create URL to redirect back to the package record
            const recordUrl = url.resolveRecord({
                recordType: 'customrecord_sps_package',
                recordId: recordId
            });
            
            // Add message as URL parameter for display
            const redirectUrl = recordUrl + '&message=' + encodeURIComponent(message);
            
            log.audit('Redirect', `Redirecting to: ${redirectUrl}`);
            
            // Set redirect response using HTML meta refresh
            context.response.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Redirecting...</title>
                    <meta http-equiv="refresh" content="0;url=${redirectUrl}">
                </head>
                <body>
                    <p>Processing complete. Redirecting back to record...</p>
                    <p>If you are not redirected automatically, <a href="${redirectUrl}">click here</a>.</p>
                </body>
                </html>
            `);
            
        } catch (error) {
            log.error('Redirect Error', error);
            context.response.write('Error redirecting: ' + error.message);
        }
    }
    function getDateParameters(recordId) {
        try {
            // Load the package record to get creation date
            const packageRecord = record.load({
                type: 'customrecord_sps_package',
                id: recordId
            });
            
            // Get the creation date
            const createdDate = packageRecord.getValue('created');
            log.audit('Date Parameters', `Record created date: ${createdDate}`);
            
            // Convert to Date object
            const startDate = new Date(createdDate);
            
            // Create end date (one month from start date)
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            
            // Format dates as YYYY-MM-DD strings
            const formatDate = (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            
            const shipDateBegin = formatDate(startDate);
            const shipDateEnd = formatDate(endDate);
            
            log.audit('Date Parameters', `Ship date begin: ${shipDateBegin}, Ship date end: ${shipDateEnd}`);
            
            return {
                shipDateBegin: shipDateBegin,
                shipDateEnd: shipDateEnd
            };
            
        } catch (error) {
            log.error('Date Parameters Error', error);
            // Return default dates if there's an error
            return {
                shipDateBegin: '2024-01-01',
                shipDateEnd: '2025-12-31'
            };
        }
    }

    /**
     * Get account number from Walmart DC number mapping
     * @param {string} walmartDcNumber - The Walmart DC number
     * @param {string} recordId - The package record ID for error tracking
     * @returns {string} The corresponding account number
     */
    function getAccountNumberFromMapping(walmartDcNumber, recordId) {
        try {
            // Validate Walmart DC number format
            if (!walmartDcNumber) {
                log.error('Account Mapping Error', 'Walmart DC number is null or empty');
                createEDIErrorRecord(recordId, 'Account Mapping Error: Walmart DC number is null or empty');
                return null;
            }
            
            // Check if DC number is exactly 4 digits and contains only numbers
            const dcNumberRegex = /^\d{4}$/;
            if (!dcNumberRegex.test(walmartDcNumber)) {
                log.error('Account Mapping Error', `Invalid Walmart DC number format: ${walmartDcNumber}. Must be exactly 4 digits.`);
                createEDIErrorRecord(recordId, `Account Mapping Error: Invalid Walmart DC number format: ${walmartDcNumber}. Must be exactly 4 digits.`);
                return null;
            }
            
            log.audit('Account Mapping', `Validated Walmart DC number: ${walmartDcNumber}`);
            
            // Get the mapping record ID from script parameters
            const mappingRecordId = runtime.getCurrentScript().getParameter({name: 'custscript_account_mapping_record'});
            
            if (!mappingRecordId) {
                log.error('Account Mapping Error', 'Mapping record ID not found in script parameters');
                createEDIErrorRecord(recordId, 'Account Mapping Error: Mapping record ID not found in script parameters');
                return null;
            }
            
            log.audit('Account Mapping', `Loading mapping record: ${mappingRecordId}`);
            
            // Load the mapping record
            const mappingRecord = record.load({
                type: 'customtransaction_shipping_account_list',
                id: mappingRecordId
            });
            
            // Build map of facility numbers to account numbers
            const facilityToAccountMap = {};
            const lineCount = mappingRecord.getLineCount({sublistId: 'line'});
            
            log.audit('Account Mapping', `Processing ${lineCount} mapping lines`);
            
            for (let i = 0; i < lineCount; i++) {
                const facilityNumber = mappingRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_wm_facility_number',
                    line: i
                });
                
                const accountNumber = mappingRecord.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_account_number',
                    line: i
                });
                
                if (facilityNumber && accountNumber) {
                    facilityToAccountMap[facilityNumber] = accountNumber;
                }
            }
            
            // Look up the account number for the given Walmart DC number
            const accountNumber = facilityToAccountMap[walmartDcNumber];
            
            if (accountNumber) {
                log.audit('Account Mapping', `Found account number ${accountNumber} for Walmart DC ${walmartDcNumber}`);
                return accountNumber;
            } else {
                log.error('Account Mapping Error', `No account number found for Walmart DC ${walmartDcNumber}`);
                createEDIErrorRecord(recordId, `Account Mapping Error: No account number found for Walmart DC ${walmartDcNumber}`);
                return null;
            }
            
        } catch (error) {
            log.error('Account Mapping Error', error);
            // Create EDI error record for account mapping error - return the actual error
            createEDIErrorRecord(recordId, `Account Mapping Error: ${error.message}`);
            return null;
        }
    }

    function getFedExPOD(trackingNumber, recordId) {
        try {
            log.audit('FedEx POD Suitelet', 'Getting access token...');
            
            // Hardcoded values for testing (should be moved to script parameters)
            //const fedexApiKey = 'l78ae84d11ff7b4032a273227ee9291fb7';
            //const fedexSecretKey = 'ae96ecdf07d94872b19e1ff55b6cf9ad';
            // Get API keys from script parameters
            const fedexApiKey = runtime.getCurrentScript().getParameter({name: 'custscript_fedex_api_key'});
            const fedexSecretKey = runtime.getCurrentScript().getParameter({name: 'custscript_fedex_secret_key'});
            
            // Debug: Print credentials (remove in production)
            log.audit('FedEx Credentials Debug', `API Key: ${fedexApiKey ? fedexApiKey.substring(0, 10) + '...' : 'NULL'}`);
            log.audit('FedEx Credentials Debug', `Secret Key: ${fedexSecretKey ? fedexSecretKey.substring(0, 10) + '...' : 'NULL'}`);
            
            if (!fedexApiKey || !fedexSecretKey) {
                const errorMsg = 'FedEx API credentials not found. Please check script parameters.';
                createEDIErrorRecord(recordId, errorMsg);
                return {
                    success: false,
                    error: errorMsg,
                    carrier: 'FEDEX',
                    trackingNumber: trackingNumber,
                    recordId: recordId,
                    timestamp: new Date().toISOString()
                };
            }
            
            // Get access token first
            const tokenRequestBody = `grant_type=client_credentials&client_id=${encodeURIComponent(fedexApiKey)}&client_secret=${encodeURIComponent(fedexSecretKey)}`;
            
            log.audit('Token Request Debug', `URL: https://apis.fedex.com/oauth/token`);
            log.audit('Token Request Debug', `Body: ${tokenRequestBody}`);
            
            const tokenResponse = https.post({
                url: 'https://apis.fedex.com/oauth/token',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-locale': 'en_US'
                },
                body: tokenRequestBody
            });

            log.audit('Token Response Raw', tokenResponse.body);
            log.audit('Token Response Code', tokenResponse.code);
            
                         let tokenData;
             try {
                 tokenData = JSON.parse(tokenResponse.body);
                 log.audit('Token Response Parsed', tokenData);
             } catch (parseError) {
                 log.error('Token Response Parse Error', parseError.message);
                 log.error('Token Response Body', tokenResponse.body);
                 const errorMsg = `Failed to parse token response: ${parseError.message}. Response: ${tokenResponse.body.substring(0, 200)}...`;
                 createEDIErrorRecord(recordId, errorMsg);
                 return {
                     success: false,
                     error: errorMsg,
                     carrier: 'FEDEX',
                     trackingNumber: trackingNumber,
                     recordId: recordId,
                     timestamp: new Date().toISOString()
                 };
             }
             
             // Check for FedEx API errors in token response
             if (tokenData.errors && tokenData.errors.length > 0) {
                 const error = tokenData.errors[0];
                 const errorMsg = `${error.code}: ${error.message}`;
                 createEDIErrorRecord(recordId, `FedEx Token Error: ${errorMsg}`);
                 return {
                     success: false,
                     error: errorMsg,
                     carrier: 'FEDEX',
                     trackingNumber: trackingNumber,
                     recordId: recordId,
                     timestamp: new Date().toISOString()
                 };
             }
             
             if (!tokenData.access_token) {
                 const errorMsg = 'Failed to get FedEx access token: ' + JSON.stringify(tokenData);
                 createEDIErrorRecord(recordId, `FedEx Token Error: ${errorMsg}`);
                 return {
                     success: false,
                     error: errorMsg,
                     carrier: 'FEDEX',
                     trackingNumber: trackingNumber,
                     recordId: recordId,
                     timestamp: new Date().toISOString()
                 };
             }

            log.audit('FedEx POD Suitelet', 'Token obtained, requesting POD document...');

            // Get date parameters from record creation date
            const dateParams = getDateParameters(recordId);
            
            // Get Walmart DC number from package record
            const packageRecord = record.load({
                type: 'customrecord_sps_package',
                id: recordId
            });
            
            const walmartDcNumber = packageRecord.getValue('custrecord_walmart_dc_number');
            log.audit('FedEx POD Suitelet', `Walmart DC Number: ${walmartDcNumber}`);
            
            // Get account number from mapping
            const accountNumber = getAccountNumberFromMapping(walmartDcNumber, recordId);
            
            if (!accountNumber) {
                // Don't create another error record - getAccountNumberFromMapping already created one
                return {
                    success: false,
                    error: `Account mapping failed for Walmart DC ${walmartDcNumber}`,
                    carrier: 'FEDEX',
                    trackingNumber: trackingNumber,
                    recordId: recordId,
                    timestamp: new Date().toISOString()
                };
            }
            
            log.audit('FedEx POD Suitelet', `Using account number: ${accountNumber}`);
            
            // Request POD document with updated format
            const requestBody = {
                trackDocumentDetail: {
                    documentType: 'SIGNATURE_PROOF_OF_DELIVERY',
                    documentFormat: 'PDF'
                },
                trackDocumentSpecification: [{
                    trackingNumberInfo: {
                        trackingNumber: trackingNumber,
                        carrierCode: 'FDXG'
                    },
                    shipDateBegin: dateParams.shipDateBegin,
                    shipDateEnd: dateParams.shipDateEnd,
                    accountNumber: accountNumber
                }]
            };
            
            log.audit('POD Request Body', JSON.stringify(requestBody, null, 2));
            
            const podResponse = https.post({
                url: 'https://apis.fedex.com/track/v1/trackingdocuments',
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Content-Type': 'application/json',
                    'X-locale': 'en_US',
                    'X-customer-transaction-id': `spod-${Date.now()}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

                         log.audit('POD Response Raw', podResponse.body);
             log.audit('POD Response Code', podResponse.code);
             
             // Parse JSON response to get base64 data
             let podData;
             try {
                 podData = JSON.parse(podResponse.body);
                 log.audit('POD Response Parsed', podData);
             } catch (parseError) {
                 log.error('POD Response Parse Error', parseError.message);
                 log.error('POD Response Body', podResponse.body);
                 const errorMsg = `Failed to parse POD response: ${parseError.message}. Response: ${podResponse.body.substring(0, 200)}...`;
                 createEDIErrorRecord(recordId, errorMsg);
                 return {
                     success: false,
                     error: errorMsg,
                     carrier: 'FEDEX',
                     trackingNumber: trackingNumber,
                     recordId: recordId,
                     timestamp: new Date().toISOString()
                 };
             }
             
                           // Check for FedEx API errors first
              if (podData.errors && podData.errors.length > 0) {
                  const error = podData.errors[0];
                  const errorMsg = `${error.code}: ${error.message}`;
                  createEDIErrorRecord(recordId, `FedEx POD API Error: ${errorMsg}`);
                  return {
                      success: false,
                      error: errorMsg,
                      carrier: 'FEDEX',
                      trackingNumber: trackingNumber,
                      recordId: recordId,
                      timestamp: new Date().toISOString()
                  };
              }
              
              // Extract base64 data from the response
              if (!podData.output || !podData.output.documents || !podData.output.documents[0]) {
                  const errorMsg = 'No document found in FedEx response: ' + JSON.stringify(podData);
                  createEDIErrorRecord(recordId, `FedEx POD Error: ${errorMsg}`);
                  return {
                      success: false,
                      error: errorMsg,
                      carrier: 'FEDEX',
                      trackingNumber: trackingNumber,
                      recordId: recordId,
                      timestamp: new Date().toISOString()
                  };
              }
             
             const base64Data = podData.output.documents[0];
             log.audit('Base64 Data Length', base64Data.length);
             log.audit('Base64 Data Preview', base64Data.substring(0, 100) + '...');
            
            // Convert base64 to binary and attach to record
            const attachResult = attachPODToRecord(base64Data, trackingNumber, recordId);
            
            if (attachResult.success) {
                const successMsg = 'POD document retrieved and attached successfully';
                log.audit('FedEx POD Suitelet', successMsg);
                
                return {
                    success: true,
                    carrier: 'FEDEX',
                    trackingNumber: trackingNumber,
                    recordId: recordId,
                    message: successMsg,
                    format: 'PDF',
                    documentSize: base64Data.length,
                    fileId: attachResult.fileId,
                    timestamp: new Date().toISOString()
                };
            } else {
                return {
                    success: false,
                    error: `Failed to attach POD: ${attachResult.error}`,
                    carrier: 'FEDEX',
                    trackingNumber: trackingNumber,
                    recordId: recordId,
                    timestamp: new Date().toISOString()
                };
            }

                 } catch (error) {
             log.error('FedEx POD Suitelet Error', error);
             
             // Update package record with error status and message using submitFields for better performance
             try {
                 log.audit('FedEx POD Suitelet', 'Updating package record with FedEx error status...');
                 record.submitFields({
                     type: 'customrecord_sps_package',
                     id: recordId,
                     values: {
                         'custrecord_pod_status': 4,
                         'custrecord_pod_message': `FedEx API error: ${error.message}`
                     }
                 });
                 log.audit('FedEx POD Suitelet', 'Package record FedEx error status updated');
             } catch (updateError) {
                 log.error('Failed to update package record with FedEx error status', updateError);
             }
             
             return {
                 success: false,
                 error: `FedEx API error: ${error.message}`,
                 carrier: 'FEDEX',
                 trackingNumber: trackingNumber,
                 recordId: recordId,
                 timestamp: new Date().toISOString()
             };
         }
    }

    /**
     * Convert base64 to binary and attach POD to record
     * @param {string} base64Data - Base64 encoded PDF data
     * @param {string} trackingNumber - The tracking number
     * @param {string} recordId - The NetSuite record ID
     * @returns {Object} Result object
     */
              function attachPODToRecord(base64Data, trackingNumber, recordId) {
         try {
             log.audit('Attach POD', 'Creating file from base64...');
             
             // Create file directly from base64 using NetSuite's file module
             const fileName = `POD_FEDEX_${trackingNumber}.pdf`;
             
             const fileObj = file.create({
                 name: fileName,
                 fileType: file.Type.PDF,
                 contents: base64Data,
                 encoding: file.Encoding.BASE_64,
                 folder: 7459
             });
             
             const fileId = fileObj.save();
             log.audit('Attach POD', `File created with ID: ${fileId}`);
             
             // Attach file to the package record using record.attach()
             log.audit('Attach POD', 'Attaching file to package record...');
             record.attach({
                 record: {
                     type: 'file',
                     id: fileId
                 },
                 to: {
                     type: 'customrecord_sps_package',
                     id: recordId
                 }
             });
             log.audit('Attach POD', 'File attached to package record successfully');
             
             // Update package record with success status and message using submitFields for better performance
             log.audit('Attach POD', 'Updating package record status...');
             record.submitFields({
                 type: 'customrecord_sps_package',
                 id: recordId,
                 values: {
                     'custrecord_pod_status': 3,
                     'custrecord_pod_message': `POD document retrieved and attached successfully. File ID: ${fileId}`
                 }
             });
             log.audit('Attach POD', 'Package record status updated successfully');
             
             return {
                 success: true,
                 message: 'POD document attached successfully',
                 fileId: fileId
             };
             
         } catch (error) {
             log.error('Attach POD Error', error);
             
             // Create EDI error record for attachment error
             createEDIErrorRecord(recordId, `Failed to attach POD: ${error.message}`);
             
             // Update package record with error status and message using submitFields for better performance
             try {
                 log.audit('Attach POD', 'Updating package record with error status...');
                 record.submitFields({
                     type: 'customrecord_sps_package',
                     id: recordId,
                     values: {
                         'custrecord_pod_status': 4,
                         'custrecord_pod_message': `Failed to attach POD: ${error.message}`
                     }
                 });
                 log.audit('Attach POD', 'Package record error status updated');
             } catch (updateError) {
                 log.error('Failed to update package record with error status', updateError);
             }
             
             return {
                 success: false,
                 error: error.message
             };
         }
     }

    return {
        onRequest: onRequest
    };
}); 