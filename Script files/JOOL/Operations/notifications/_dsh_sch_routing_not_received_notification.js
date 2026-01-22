/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * 
 * Scheduled script to find Item Fulfillments with routing status 2 (routing requested but not received)
 * where MABD date is within 2 business days from current date.
 * Sends email notification with list of IFs that need attention.
 * 
 * Search criteria:
 * - custbody_routing_status = 2 (routing requested but not received)
 * - custbody_gbs_mabd within 2 business days from current date
 * - Entity in entity filter map (hardcoded: includes 1716)
 * 
 * Email includes:
 * - List of entity names (not IDs)
 * - List of IF tranids with record URLs as links
 */

define(['N/search', 'N/log', 'N/record', 'N/email', 'N/url'], function (search, log, record, email, url) {
    
    var ENTITY_FILTER_LIST = [
        1716 // Amazon Vendor Central
    ];
    
  
    function execute(scriptContext) {
        log.audit('execute', 'Starting scheduled script to find IFs with routing requested but not received');
        
        try {
            // Use the entity filter list directly - ensure they're numbers
            var entityIds = ENTITY_FILTER_LIST.map(function(id) {
                return parseInt(id);
            });
            
            if (entityIds.length === 0) {
                log.audit('execute', 'No entities in filter list, exiting');
                return;
            }
            
            log.debug('execute', 'Entity IDs for search: ' + entityIds.join(', '));
            
            // Calculate date range for MABD (within 2 business days from today)
            var today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // Format dates as 'MM/DD/YYYY' strings - this is the ONLY safe way in 2.1 scheduled scripts
            // NetSuite does NOT accept raw JavaScript Date objects in search filters
            var formatNSDate = function(date) {
                if (!date || isNaN(date.getTime())) return null;
                var mm = ('0' + (date.getMonth() + 1)).slice(-2);
                var dd = ('0' + date.getDate()).slice(-2);
                var yyyy = date.getFullYear();
                return mm + '/' + dd + '/' + yyyy;
            };
            
            // Calculate 2 business days from today (inclusive)
            // "Within 2 business days" means: today, tomorrow, and day after tomorrow
            // So we need to calculate 3 business days to get the end date (today + 2 more)
            var endDate = calculateBusinessDaysFrom(today, 3);
            log.debug('execute', 'Today: ' + formatDateForLog(today));
            log.debug('execute', 'Two business days from today: ' + formatDateForLog(endDate));
            
            // Validate the date
            if (!endDate || isNaN(endDate.getTime())) {
                log.error('execute', 'Invalid date calculated for endDate');
                return;
            }
            
            // Format dates as strings for NetSuite search filters
            var todayStr = formatNSDate(today);
            var endDateStr = formatNSDate(endDate);
            
            if (!todayStr || !endDateStr) {
                log.error('execute', 'Failed to format dates for search');
                return;
            }
            
            log.debug('execute', 'Date range for search: ' + todayStr + ' to ' + endDateStr);
            
            // Search for IFs with routing_status = 2 and MABD within 2 business days (including past dates)
            // Use date strings with 'onorbefore' operator - Date objects cause UNEXPECTED_ERROR
            // 'onorbefore' will catch: past dates, today, and dates up to 2 business days from today
            var ifSearch = search.create({
                type: search.Type.ITEM_FULFILLMENT,
                filters: [
                    ['mainline', 'is', 'T'],  // Only get header records, not line items
                    'AND',
                    ['custbody_routing_status', 'anyof', '2'],  // Routing requested but not received (use 'anyof' for list fields)
                    'AND',
                    ['entity', 'anyof', entityIds],
                    'AND',
                    ['custbody_gbs_mabd', 'isnotempty', ''],  // Ensure MABD is not empty
                    'AND',
                    ['custbody_gbs_mabd', 'onorbefore', endDateStr]  // Include past dates, today, and up to 2 business days from today
                ],
                columns: [
                    search.createColumn({
                        name: 'internalid'
                    }),
                    search.createColumn({
                        name: 'tranid'
                    }),
                    search.createColumn({
                        name: 'entity'
                    }),
                    search.createColumn({
                        name: 'custbody_sps_ponum_from_salesorder'
                    }),
                    search.createColumn({
                        name: 'custbody_gbs_mabd'
                    })
                ]
            });
            
            log.debug('execute', 'IF search created successfully');
            
            // Process results
            var ifResults = [];
            var entityNamesSet = new Set(); // Set of entity names (not IDs) for email
            
            try {
                log.debug('execute', 'Running search with filters...');
                log.debug('execute', 'Date range: ' + todayStr + ' to ' + endDateStr);
                
                // Use .each() instead of .getRange() - more reliable in NetSuite 2.1
                // .getRange() can cause UNEXPECTED_ERROR, especially with zero results
                var resultCount = 0;
                
                ifSearch.run().each(function(result) {
                    try {
                        resultCount++;
                        var ifId = result.id;
                        var tranId = result.getValue('tranid') || ifId;
                        var entityId = result.getValue('entity');
                        
                        // Try to get entity name from search result text
                        var entityName = 'Entity ' + entityId;
                        try {
                            var entityText = result.getText('entity');
                            if (entityText && entityText.trim() !== '') {
                                entityName = entityText;
                            }
                        } catch (e) {
                            // If getText fails, use fallback name
                            // Ignore error - fallback name is already set
                        }
                        
                        var mabdDate = result.getValue('custbody_gbs_mabd');
                        var poNumber = result.getValue('custbody_sps_ponum_from_salesorder');
                        
                        // Track entity names (not IDs)
                        if (entityName) {
                            entityNamesSet.add(entityName);
                        }
                        
                        log.debug('execute', 'IF: ' + tranId + ' | Entity: ' + entityName + ' | MABD: ' + (mabdDate ? formatDateForLog(new Date(mabdDate)) : 'N/A') + ' | PO: ' + (poNumber || 'N/A'));
                        
                        ifResults.push({
                            ifId: ifId,
                            tranId: tranId,
                            entityId: entityId,
                            entityName: entityName,
                            mabdDate: mabdDate,
                            poNumber: poNumber
                        });
                        
                        // Return true to continue processing
                        return true;
                        
                    } catch (e) {
                        log.error('execute', 'Error processing result: ' + e.toString());
                        // Return true to continue processing even if one result fails
                        return true;
                    }
                });
                
                log.audit('execute', 'Found ' + resultCount + ' item fulfillment(s) matching criteria');
                
            } catch (e) {
                log.error('execute', 'Error running item fulfillment search: ' + e.toString());
                log.error('execute', 'Stack trace: ' + (e.stack || 'N/A'));
                return;
            }
            
            // Log entity names (not IDs)
            var entityNamesArray = Array.from(entityNamesSet).sort();
            log.audit('execute', 'Entities found: ' + entityNamesArray.join(', '));
            log.audit('execute', 'Total IFs found: ' + ifResults.length);
            
            // If no IFs found, exit
            if (ifResults.length === 0) {
                log.audit('execute', 'No IFs found matching criteria, exiting');
                return;
            }
            
            // Send email notification
            sendRoutingNotReceivedEmail(entityNamesArray, ifResults);
            
            log.audit('execute', 'Script execution complete');
            
        } catch (e) {
            log.error('execute', 'Error in scheduled script: ' + e.toString());
            log.error('execute', 'Stack trace: ' + (e.stack || 'N/A'));
        }
    }
    
    /**
     * Sends email notification for IFs with routing requested but not received
     * @param {Array<string>} entityNames - Array of entity names (not IDs)
     * @param {Array<Object>} ifResults - Array of IF result objects with {ifId, tranId, entityId, entityName, mabdDate}
     */
    function sendRoutingNotReceivedEmail(entityNames, ifResults) {
        try {
            log.debug('sendRoutingNotReceivedEmail', '=== SENDING ROUTING NOT RECEIVED EMAIL ===');
            log.debug('sendRoutingNotReceivedEmail', 'Number of IFs: ' + ifResults.length);
            log.debug('sendRoutingNotReceivedEmail', 'Entities: ' + entityNames.join(', '));
            
            // Create email subject
            var subject = 'Routing Requested But Not Received - Item Fulfillments';
            
            // Create email body
            var body = 'These IFs for [' + entityNames.join(', ') + '] have had routing requested and not received.<br><br>';
            
            // Add list of IFs with record URLs as links
            body += 'Item Fulfillments:<br>';
            body += '----------------------------------------<br>';
            
            for (var i = 0; i < ifResults.length; i++) {
                var ifData = ifResults[i];
                var ifId = ifData.ifId;
                var tranId = ifData.tranId;
                var entityName = ifData.entityName;
                var mabdDate = ifData.mabdDate;
                var poNumber = ifData.poNumber || 'N/A';
                
                // Create record URL
                var recordUrl = '';
                try {
                    var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
                    var relativePath = url.resolveRecord({
                        recordType: 'itemfulfillment',
                        recordId: ifId,
                        isEditMode: false
                    });
                    recordUrl = 'https://' + domain + relativePath;
                } catch (urlError) {
                    log.error('sendRoutingNotReceivedEmail', 'Error creating record URL for IF ' + tranId + ': ' + urlError.toString());
                    recordUrl = 'Unable to generate record URL (IF ID: ' + ifId + ')';
                }
                
                // Format MABD date
                var mabdDateStr = 'N/A';
                if (mabdDate) {
                    try {
                        var mabdDateObj = new Date(mabdDate);
                        mabdDateStr = formatDateForLog(mabdDateObj);
                    } catch (e) {
                        mabdDateStr = String(mabdDate);
                    }
                }
                
                // Add IF to list with link
                body += (i + 1) + '. <a href="' + recordUrl + '">' + tranId + '</a>';
                body += ' - PO: ' + poNumber;
                body += ' - Customer: ' + entityName;
                body += '<br>';
            }
            
            body += '<br>';
            body += 'Please review these Item Fulfillments and ensure routing is received.';
            
            // Send email
            log.debug('sendRoutingNotReceivedEmail', 'Email subject: ' + subject);
            email.send({
                author: 2536,
                recipients: ['dhodes@joolbaby.com', 'Yoelg@joolbaby.com'],
                subject: subject,
                body: body
            });
            
            log.audit('sendRoutingNotReceivedEmail', 'Sent routing not received email for ' + ifResults.length + ' IF(s)');
            log.debug('sendRoutingNotReceivedEmail', '=== EMAIL SENT SUCCESSFULLY ===');
            
        } catch (emailError) {
            log.error('sendRoutingNotReceivedEmail', 'Error sending email: ' + emailError.toString());
            log.error('sendRoutingNotReceivedEmail', 'Error stack: ' + (emailError.stack || 'N/A'));
        }
    }
    
    /**
     * Calculates a date that is N business days from the given date (inclusive)
     * Business days exclude Saturday (6) and Sunday (0)
     * @param {Date} startDate - The starting date
     * @param {number} businessDays - Number of business days to add
     * @returns {Date} - Date object
     */
    function calculateBusinessDaysFrom(startDate, businessDays) {
        try {
            var date = new Date(startDate);
            if (isNaN(date.getTime())) {
                log.error('calculateBusinessDaysFrom', 'Invalid date: ' + startDate);
                return date;
            }
            
            var resultDate = new Date(date);
            var businessDaysCounted = 0;
            var daysToAdd = 0;
            
            // Count business days starting from start date (inclusive)
            while (businessDaysCounted < businessDays) {
                var checkDate = new Date(date);
                checkDate.setDate(date.getDate() + daysToAdd);
                
                var dayOfWeek = checkDate.getDay();
                if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                    // It's a business day
                    businessDaysCounted++;
                    if (businessDaysCounted === businessDays) {
                        // We've reached the target, set result date
                        resultDate = new Date(checkDate);
                        break;
                    }
                }
                daysToAdd++;
            }
            
            resultDate.setHours(23, 59, 59, 999); // Set to end of day for "on or before" comparison
            
            return resultDate;
            
        } catch (e) {
            log.error('calculateBusinessDaysFrom', 'Error calculating business days: ' + e.toString());
            return startDate;
        }
    }
    
    /**
     * Formats a Date object for logging purposes (MM/DD/YYYY)
     * @param {Date} dateObj - Date object to format
     * @returns {string} - Formatted date string
     */
    function formatDateForLog(dateObj) {
        if (!dateObj) return 'N/A';
        try {
            var year = dateObj.getFullYear();
            var month = dateObj.getMonth() + 1;
            var day = dateObj.getDate();
            var monthStr = month < 10 ? '0' + month : String(month);
            var dayStr = day < 10 ? '0' + day : String(day);
            return monthStr + '/' + dayStr + '/' + year;
        } catch (e) {
            return 'N/A';
        }
    }
    
    return {
        execute: execute
    };
});

