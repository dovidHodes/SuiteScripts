/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event script for customtransaction_754 that:
 * 1. Searches for location records by ship point value and sets warehouse location field
 * 2. For each line, searches for Sales Orders by PO number and sets SO ID on the line
 * 
 * Deployment: Set "Applies To" to customtransaction_754
 * Event: beforeSubmit (create only)
 */

define([
    'N/record',
    'N/log',
    'N/search'
], function(record, log, search) {
    
    /**
     * Function executed before record is submitted (create only)
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record being created
     * @param {string} scriptContext.type - Trigger type (create, edit, etc.)
     */
    function beforeSubmit(scriptContext) {
        try {
            var newRecord = scriptContext.newRecord;
            var type = scriptContext.type;
            
            
            var recordId = newRecord.id;
            var tranId = newRecord.getValue('tranid') || recordId;
            
            log.debug('beforeSubmit', 'Processing customtransaction_754 create: ' + tranId);
            
            // ============================================
            // Part 1: Location Lookup (Header Level)
            // ============================================
            var shipPointValue = newRecord.getValue('custbody_ship_point');
            
            if (shipPointValue) {
                log.debug('beforeSubmit', 'Ship point value: ' + shipPointValue);
                
                try {
                    // Search for location records matching ship point
                    var locationSearch = search.create({
                        type: 'location',
                        filters: [
                            ['custrecord_wm_ship_point', 'equalto', shipPointValue]
                        ],
                        columns: [
                            search.createColumn({
                                name: 'internalid'
                            })
                        ]
                    });
                    
                    var locationResults = [];
                    locationSearch.run().each(function(result) {
                        locationResults.push(result.id);
                        return true;
                    });
                    
                    log.debug('beforeSubmit', 'Found ' + locationResults.length + ' location(s) for ship point: ' + shipPointValue);
                    
                    if (locationResults.length === 1) {
                        // Exactly one location found - set the warehouse location field
                        newRecord.setValue('custbody_warehouse_location', locationResults[0]);
                        log.audit('beforeSubmit', 'Set custbody_warehouse_location to: ' + locationResults[0]);
                    } else if (locationResults.length === 0) {
                        // No locations found - append error message
                        var existingIssue = newRecord.getValue('custbody_issue') || '';
                        var errorMsg = 'Location lookup error: No locations found for ship point "' + shipPointValue + '"';
                        var newIssueValue = existingIssue ? (existingIssue + '\n' + errorMsg) : errorMsg;
                        newRecord.setValue('custbody_issue', newIssueValue);
                        log.warning('beforeSubmit', errorMsg);
                    } else {
                        // Multiple locations found - append error message with IDs
                        var existingIssue = newRecord.getValue('custbody_issue') || '';
                        var errorMsg = 'Location lookup error: Multiple locations found for ship point "' + shipPointValue + '": ' + locationResults.join(', ');
                        var newIssueValue = existingIssue ? (existingIssue + '\n' + errorMsg) : errorMsg;
                        newRecord.setValue('custbody_issue', newIssueValue);
                        log.warning('beforeSubmit', errorMsg);
                    }
                } catch (locationSearchError) {
                    log.error('beforeSubmit', 'Error searching for locations: ' + locationSearchError.toString());
                    var existingIssue = newRecord.getValue('custbody_issue') || '';
                    var errorMsg = 'Location lookup error: Search failed - ' + locationSearchError.toString();
                    var newIssueValue = existingIssue ? (existingIssue + '\n' + errorMsg) : errorMsg;
                    newRecord.setValue('custbody_issue', newIssueValue);
                }
            } else {
                log.debug('beforeSubmit', 'No ship point value found, skipping location lookup');
            }
            
            // ============================================
            // Part 2: Sales Order Lookup (Line Level)
            // ============================================
            var entityId = newRecord.getValue('custbody_tp');
            
            if (!entityId) {
                log.debug('beforeSubmit', 'No entity ID (custbody_tp) found, skipping SO lookup on lines');
            } else {
                // Calculate date 3 months ago
                var today = new Date();
                var threeMonthsAgo = new Date(today);
                threeMonthsAgo.setMonth(today.getMonth() - 3);
                
                // Format date as MM/DD/YYYY for NetSuite search
                var month = String(threeMonthsAgo.getMonth() + 1).padStart(2, '0');
                var day = String(threeMonthsAgo.getDate()).padStart(2, '0');
                var year = threeMonthsAgo.getFullYear();
                var threeMonthsAgoDateStr = month + '/' + day + '/' + year;
                
                log.debug('beforeSubmit', 'Entity ID: ' + entityId + ', Date filter: on or after ' + threeMonthsAgoDateStr);
                
                // Get line count
                var lineCount = newRecord.getLineCount({
                    sublistId: 'lines'
                });
                
                log.debug('beforeSubmit', 'Processing ' + lineCount + ' line(s)');
                
                // Process each line
                for (var i = 0; i < lineCount; i++) {
                    try {
                        var vpoNumber = newRecord.getSublistValue({
                            sublistId: 'lines',
                            fieldId: 'custcol_po_number',
                            line: i
                        });
                        
                        if (!vpoNumber || vpoNumber.trim() === '') {
                            log.debug('beforeSubmit', 'Line ' + i + ': No VPO number, skipping SO lookup');
                            continue;
                        }
                        
                        vpoNumber = vpoNumber.trim();
                        log.debug('beforeSubmit', 'Line ' + i + ': VPO number: ' + vpoNumber);
                        
                        // Search for Sales Orders matching VPO number, entity, and date
                        var soSearch = search.create({
                            type: search.Type.SALES_ORDER,
                            filters: [
                                ['mainline', 'is', 'T'],
                                'AND',
                                ['entity', 'anyof', entityId],
                                'AND',
                                ['otherrefnum', 'equalto', vpoNumber],
                                'AND',
                                ['trandate', 'onorafter', threeMonthsAgoDateStr]
                            ],
                            columns: [
                                search.createColumn({
                                    name: 'internalid'
                                })
                            ]
                        });
                        
                        var soResults = [];
                        soSearch.run().each(function(result) {
                            soResults.push(result.id);
                            return true;
                        });
                        
                        log.debug('beforeSubmit', 'Line ' + i + ': Found ' + soResults.length + ' SO(s) for VPO: ' + vpoNumber);
                        
                        if (soResults.length === 1) {
                            // Exactly one SO found - set the sales order field
                            newRecord.setSublistValue({
                                sublistId: 'lines',
                                fieldId: 'custcol_754_sales_order',
                                line: i,
                                value: soResults[0]
                            });
                            log.audit('beforeSubmit', 'Line ' + i + ': Set custcol_754_sales_order to: ' + soResults[0]);
                        } else if (soResults.length === 0) {
                            log.debug('beforeSubmit', 'Line ' + i + ': No SOs found for VPO: ' + vpoNumber);
                        } else {
                            log.warning('beforeSubmit', 'Line ' + i + ': Multiple SOs found (' + soResults.length + ') for VPO: ' + vpoNumber + ' - IDs: ' + soResults.join(', '));
                        }
                    } catch (lineError) {
                        log.error('beforeSubmit', 'Error processing line ' + i + ': ' + lineError.toString());
                        // Continue processing other lines even if one fails
                    }
                }
            }
            
            log.debug('beforeSubmit', 'Completed processing customtransaction_754: ' + tranId);
            
        } catch (e) {
            log.error('beforeSubmit', 'Error in beforeSubmit: ' + e.toString());
            log.error('beforeSubmit', 'Stack trace: ' + e.stack);
            throw e; // Re-throw to prevent record save if critical error
        }
    }
    
    return {
        beforeSubmit: beforeSubmit
    };
});