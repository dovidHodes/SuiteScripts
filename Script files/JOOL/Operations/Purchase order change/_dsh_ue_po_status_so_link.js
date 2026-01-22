/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

define([
    'N/record',
    'N/log',
    'N/search'
], function(record, log, search) {
    
    /**
     * Function to be executed after record submit.
     * Sets status field based on custbody_status and links to Sales Order on create/edit.
     * 
     * @param {Object} context
     * @param {Record} context.newRecord - New record
     * @param {Record} context.oldRecord - Old record (null on create)
     * @param {string} context.type - Operation type: create, edit, etc.
     */
    function afterSubmit(context) {
        try {
            var poRecord = context.newRecord;
            var poId = poRecord.id;
            var type = context.type;
            
            // Check if we need to make any updates
            var needsUpdate = false;
            var statusFieldValue = null;
            var poNumber = null;
            var entityIdStr = null;
            
            // Part 1: Check status field (runs on both create and edit)
            if (type === 'create' || type === 'edit') {
                statusFieldValue = poRecord.getValue('custbody_status');
                if (statusFieldValue) {
                    var statusValue = parseInt(statusFieldValue);
                    if (statusValue === 1 || statusValue === 2 || statusValue === 3) {
                        var currentTranStatus = poRecord.getValue('transtatus');
                        var expectedTranStatus = statusValue === 1 ? 'A' : (statusValue === 2 ? 'B' : 'C');
                        if (currentTranStatus !== expectedTranStatus) {
                            needsUpdate = true;
                        }
                    }
                }
            }
            
            // Part 2: Check if we need to search for SO
            // NOTE: Currently runs on both create and edit. To change back to create-only, change condition to: if (type === 'create')
            if (type === 'create' || type === 'edit') {
                poNumber = poRecord.getValue('custbody_sps_cx_ponumber');
                entityIdStr = poRecord.getValue('custbody_sps_cx_tpid');
                if (poNumber && entityIdStr) {
                    needsUpdate = true;
                }
            }
            
            // Only load and update if we have changes to make
            if (!needsUpdate) {
                return;
            }
            
            // Load the record with isDynamic: true to make updates
            var poRecordToUpdate = record.load({
                type: 'customtransaction_sps_cx_860_basic',
                id: poId,
                isDynamic: true
            });
            
            var hasChanges = false;
            
            // Part 1: Set status field based on custbody_status (runs on both create and edit)
            if (type === 'create' || type === 'edit') {
                if (statusFieldValue) {
                    var statusValue = parseInt(statusFieldValue);
                    var tranStatusValue = null;
                    
                    if (statusValue === 1) {
                        tranStatusValue = 'A';
                    } else if (statusValue === 2) {
                        tranStatusValue = 'B';
                    } else if (statusValue === 3) {
                        tranStatusValue = 'C';
                    }
                    
                    if (tranStatusValue) {
                        var currentTranStatus = poRecordToUpdate.getValue('transtatus');
                        if (currentTranStatus !== tranStatusValue) {
                            poRecordToUpdate.setValue('transtatus', tranStatusValue);
                            hasChanges = true;
                        }
                    }
                }
            }
            
            // Part 2: Search for Sales Order and link
            // NOTE: Currently runs on both create and edit. To change back to create-only, change condition to: if (type === 'create')
            if (type === 'create' || type === 'edit') {
                // Re-read from loaded record to ensure we have the latest values
                var poNumberFromRecord = poRecordToUpdate.getValue('custbody_sps_cx_ponumber');
                var entityIdStrFromRecord = poRecordToUpdate.getValue('custbody_sps_cx_tpid');
                
                var finalPoNumber = (poNumberFromRecord || poNumber || '').trim();
                var finalEntityIdStr = entityIdStrFromRecord || entityIdStr;
                
                if (finalPoNumber && finalEntityIdStr) {
                    try {
                        var entityId = parseInt(finalEntityIdStr);
                        
                        if (!isNaN(entityId)) {
                            // Search for Sales Orders matching entity and otherrefnum (mainline only)
                            var soSearch = search.create({
                                type: search.Type.SALES_ORDER,
                                filters: [
                                    ['mainline', 'is', 'T'],
                                    'AND',
                                    ['entity', 'anyof', entityId],
                                    'AND',
                                    ['otherrefnum', 'equalto', finalPoNumber]
                                ],
                                columns: [
                                    search.createColumn({
                                        name: 'internalid'
                                    }),
                                    search.createColumn({
                                        name: 'tranid'
                                    })
                                ]
                            });
                            
                            var soResults = [];
                            soSearch.run().each(function(result) {
                                soResults.push({
                                    id: result.id,
                                    tranid: result.getValue('tranid') || result.id
                                });
                                return true;
                            });
                            
                            if (soResults.length === 1) {
                                // Exactly one SO found - set the related transaction field
                                poRecordToUpdate.setValue('custbody_sps_cx_related_trxn', soResults[0].id);
                                hasChanges = true;
                            } else if (soResults.length > 1) {
                                // More than one SO found - set update summary field with comma-separated list
                                var soIds = soResults.map(function(so) {
                                    return so.tranid || so.id;
                                }).join(', ');
                                
                                poRecordToUpdate.setValue('custbody_sps_cx_updatesummary', 'More than one found: ' + soIds);
                                hasChanges = true;
                                log.warning('PO Status SO Link', 'Multiple SOs found (' + soResults.length + ') for PO: ' + poId);
                            }
                        }
                    } catch (searchError) {
                        log.error('PO Status SO Link', 'Error searching for Sales Orders: ' + searchError.toString());
                    }
                }
            }
            
            // Save changes if any were made
            if (hasChanges) {
                poRecordToUpdate.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: false
                });
            }
            
        } catch (e) {
            log.error('PO Status SO Link', 'Error processing Purchase Order: ' + e.toString());
        }
    }
    
    return {
        afterSubmit: afterSubmit
    };
});
