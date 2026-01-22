/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * 
 * Scheduled script to find Item Fulfillments with routing status 4 (routing error - pickup date could not be set)
 * and send a single email notification with all IFs that have routing request issues.
 * 
 * Search criteria:
 * - custbody_routing_status = 4 (routing error)
 * - custbody_routing_request_issue is not empty (has error message)
 * - Entity in entity filter list (hardcoded: includes 1716)
 * 
 * Email includes:
 * - List of entity names (not IDs)
 * - List of IF tranids with record URLs as links
 * - Error message from custbody_routing_request_issue field for each IF
 */

define(['N/search', 'N/log', 'N/record', 'N/email', 'N/url'], function (search, log, record, email, url) {
    
    var ENTITY_FILTER_LIST = [
        1716 // Amazon Vendor Central
    ];
    
  
    function execute(scriptContext) {
        log.audit('execute', 'Starting scheduled script to find IFs with routing errors');
        
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
            
            // Search for IFs with routing_status = 4 (include all, even if error message is empty)
            var ifSearch = search.create({
                type: search.Type.ITEM_FULFILLMENT,
                filters: [
                    ['mainline', 'is', 'T'],  // Only get header records, not line items
                    'AND',
                    ['custbody_routing_status', 'anyof', '4'],  // Routing error status
                    'AND',
                    ['entity', 'anyof', entityIds]
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
                        name: 'custbody_routing_request_issue'
                    }),
                    search.createColumn({
                        name: 'custbody_gbs_mabd'
                    })
                ]
            });
            
            var ifResults = [];
            var entityMap = {}; // Map entity IDs to names
            
            ifSearch.run().each(function(result) {
                var ifId = result.id;
                var tranId = result.getValue('tranid') || ifId;
                var entityId = result.getValue('entity');
                var errorMessage = result.getValue('custbody_routing_request_issue');
                // Use fallback message if error field is empty
                if (!errorMessage || errorMessage.trim() === '') {
                    errorMessage = 'Routing error: routing info could not be set (no detailed error message available)';
                }
                var mabdDate = result.getValue('custbody_gbs_mabd');
                
                // Get entity name if not already cached
                if (!entityMap[entityId]) {
                    try {
                        var entityRecord = record.load({
                            type: 'customer',
                            id: entityId,
                            isDynamic: false
                        });
                        entityMap[entityId] = entityRecord.getValue('entityid') || entityRecord.getValue('companyname') || 'Entity ' + entityId;
                    } catch (e) {
                        entityMap[entityId] = 'Entity ' + entityId;
                    }
                }
                
                ifResults.push({
                    ifId: ifId,
                    tranId: tranId,
                    entityId: entityId,
                    entityName: entityMap[entityId],
                    errorMessage: errorMessage,
                    mabdDate: mabdDate
                });
                
                return true;
            });
            
            log.audit('execute', 'Found ' + ifResults.length + ' IF(s) with routing errors');
            
            if (ifResults.length === 0) {
                log.audit('execute', 'No IFs with routing errors found, exiting');
                return;
            }
            
            // Get unique entity names
            var entityNamesSet = {};
            for (var i = 0; i < ifResults.length; i++) {
                entityNamesSet[ifResults[i].entityName] = true;
            }
            var entityNamesArray = Object.keys(entityNamesSet);
            
            // Send email with all IFs
            sendRoutingErrorEmail(entityNamesArray, ifResults);
            
            log.audit('execute', 'Script execution complete');
            
        } catch (e) {
            log.error('execute', 'Error in scheduled script: ' + e.toString());
            log.error('execute', 'Stack trace: ' + (e.stack || 'N/A'));
        }
    }
    
    /**
     * Sends email notification for IFs with routing errors
     * @param {Array<string>} entityNames - Array of entity names (not IDs)
     * @param {Array<Object>} ifResults - Array of IF result objects with {ifId, tranId, entityId, entityName, errorMessage, mabdDate}
     */
    function sendRoutingErrorEmail(entityNames, ifResults) {
        try {
            log.debug('sendRoutingErrorEmail', '=== SENDING ROUTING ERROR EMAIL ===');
            log.debug('sendRoutingErrorEmail', 'Number of IFs: ' + ifResults.length);
            log.debug('sendRoutingErrorEmail', 'Entities: ' + entityNames.join(', '));
            
            // Create email subject
            var subject = 'Routing Request Errors - Item Fulfillments';
            
            // Create email body
            var body = 'These IFs for [' + entityNames.join(', ') + '] have routing request errors.<br><br>';
            
            // Add list of IFs with record URLs as links and error messages
            body += 'Item Fulfillments with Routing Errors:<br>';
            body += '----------------------------------------<br>';
            
            for (var i = 0; i < ifResults.length; i++) {
                var ifData = ifResults[i];
                var ifId = ifData.ifId;
                var tranId = ifData.tranId;
                var entityName = ifData.entityName;
                var errorMessage = ifData.errorMessage;
                var mabdDate = ifData.mabdDate;
                
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
                    log.error('sendRoutingErrorEmail', 'Error creating record URL for IF ' + tranId + ': ' + urlError.toString());
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
                
                // Add IF to list with link and error message
                body += (i + 1) + '. <a href="' + recordUrl + '">' + tranId + '</a>';
                body += ' - Customer: ' + entityName;
                body += ' - MABD: ' + mabdDateStr;
                body += '<br>';
                body += '&nbsp;&nbsp;&nbsp;Error: ' + errorMessage;
                body += '<br><br>';
            }
            
            body += 'Please review these Item Fulfillments and resolve the routing issues.';
            
            // Send email
            log.debug('sendRoutingErrorEmail', 'Email subject: ' + subject);
            email.send({
                author: 2536,
                recipients: ['dhodes@joolbaby.com', 'Yoelg@joolbaby.com'],
                subject: subject,
                body: body
            });
            
            log.audit('sendRoutingErrorEmail', 'Sent routing error email for ' + ifResults.length + ' IF(s)');
            log.debug('sendRoutingErrorEmail', '=== EMAIL SENT SUCCESSFULLY ===');
            
        } catch (emailError) {
            log.error('sendRoutingErrorEmail', 'Error sending email: ' + emailError.toString());
            log.error('sendRoutingErrorEmail', 'Error stack: ' + (emailError.stack || 'N/A'));
        }
    }
    
    /**
     * Formats a Date object for logging purposes (MM/DD/YYYY)
     * @param {Date} dateObj - Date object to format
     * @returns {string} - Formatted date string
     */
    function formatDateForLog(dateObj) {
        if (!dateObj) return 'N/A';
        var year = dateObj.getFullYear();
        var month = dateObj.getMonth() + 1;
        var day = dateObj.getDate();
        var monthStr = month < 10 ? '0' + month : String(month);
        var dayStr = day < 10 ? '0' + day : String(day);
        return monthStr + '/' + dayStr + '/' + year;
    }
    
    return {
        execute: execute
    };
});

