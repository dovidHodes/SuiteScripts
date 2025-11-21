/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 * 
 * COMPREHENSIVE diagnostic script to check EVERYTHING preventing package deletion
 */
define(['N/record', 'N/search', 'N/log', 'N/runtime'], function (record, search, log, runtime) {

    var IF_ID = 15896614;
    var SAMPLE_SIZE = 3; // Check first 3 packages in detail

    function execute(context) {
        log.audit('=== COMPREHENSIVE PACKAGE DELETION DIAGNOSTIC ===', 'IF ID: ' + IF_ID);
        log.audit('Script Usage', 'Remaining: ' + runtime.getCurrentScript().getRemainingUsage());
        
        // CRITICAL FINDING: User Event Script runs on package delete
        log.error('⚠️⚠️⚠️ CRITICAL ISSUE FOUND ⚠️⚠️⚠️', 
            'User Event Script: sps_ue_package_content_sublist.js runs on package DELETE. ' +
            'This script: 1) Deletes content records, 2) Searches ALL packages for IF (6000+ packages!), ' +
            '3) Updates carton indexes, 4) Updates IF. This is why deletion is SO SLOW!');
        
        // Get sample packages
        var packageSearch = search.create({
            type: 'customrecord_sps_package',
            filters: [
                ['custrecord_sps_pack_asn', 'anyof', IF_ID]
            ],
            columns: ['internalid', 'name', 'created', 'lastmodified']
        });
        
        var count = 0;
        packageSearch.run().each(function (result) {
            if (count >= SAMPLE_SIZE) return false;
            
            var packageId = result.id;
            var packageName = result.getValue('name') || packageId;
            
            log.audit('==========================================', '');
            log.audit('CHECKING PACKAGE', 'ID: ' + packageId + ', Name: ' + packageName);
            log.audit('Created', result.getValue('created'));
            log.audit('Last Modified', result.getValue('lastmodified'));
            
            // CHECK 1: Load package and inspect all fields
            var packageRec = null;
            try {
                packageRec = record.load({
                    type: 'customrecord_sps_package',
                    id: packageId
                });
                log.debug('✓ Package loads successfully', 'ID: ' + packageId);
                
                // Log all field values to see what's linked
                log.debug('Package Fields', 'Checking all field values...');
                // Note: Can't iterate all fields easily, but we can check key ones
                
            } catch (e) {
                log.error('✗ CANNOT LOAD PACKAGE', 'ID: ' + packageId + ', Error: ' + e.message);
                count++;
                return true;
            }
            
            // CHECK 2: Content records
            var contentSearch = search.create({
                type: 'customrecord_sps_content',
                filters: [
                    ['custrecord_sps_content_package', 'anyof', packageId]
                ],
                columns: ['internalid']
            });
            
            var contentCount = 0;
            var contentIds = [];
            contentSearch.run().each(function (contentResult) {
                contentCount++;
                contentIds.push(contentResult.id);
                return true;
            });
            
            if (contentCount > 0) {
                log.error('✗ PACKAGE HAS CONTENT RECORDS', 
                    'Package ID: ' + packageId + 
                    ', Count: ' + contentCount + 
                    ', IDs: ' + contentIds.join(', '));
            } else {
                log.debug('✓ No content records', 'Package ID: ' + packageId);
            }
            
            // CHECK 3: Check package record fields for any references to other records
            log.debug('Checking package record fields', 'Looking for field references...');
            try {
                // Check common reference fields that might block deletion
                var fieldChecks = [
                    'custrecord_sps_pack_asn', // IF reference
                    'parent', // Parent record
                    'owner', // Owner
                    'custrecord_sps_pack_label', // Label reference
                    'custrecord_sps_pack_shipment' // Shipment reference
                ];
                
                fieldChecks.forEach(function(fieldId) {
                    try {
                        var fieldValue = packageRec.getValue({fieldId: fieldId});
                        if (fieldValue) {
                            log.debug('Package field has value', 'Field: ' + fieldId + ', Value: ' + fieldValue);
                        }
                    } catch (e) {
                        // Field doesn't exist or can't read - skip
                    }
                });
            } catch (e) {
                log.debug('Could not check all fields', e.message);
            }
            
            // CHECK 4: Search for ANY other custom records that might reference this package
            log.debug('Checking for other dependencies', 'Searching known custom record types...');
            log.debug('NOTE', 'If there are OTHER custom record types that reference packages, ' +
                'add them to the customRecordTypesToCheck array below');
            
            // Common custom record types that might link to packages
            // ADD MORE HERE if you know of other record types that reference packages
            var customRecordTypesToCheck = [
                {type: 'customrecord_sps_content', field: 'custrecord_sps_content_package', name: 'Content'},
                {type: 'customrecord_sps_label', field: 'custrecord_sps_label_package', name: 'Label'},
                {type: 'customrecord_sps_shipment', field: 'custrecord_sps_shipment_package', name: 'Shipment'},
                {type: 'customrecord_sps_tracking', field: 'custrecord_sps_tracking_package', name: 'Tracking'},
                {type: 'customrecord_sps_manifest', field: 'custrecord_sps_manifest_package', name: 'Manifest'}
            ];
            
            var totalDependencies = 0;
            customRecordTypesToCheck.forEach(function(check) {
                try {
                    var depSearch = search.create({
                        type: check.type,
                        filters: [
                            [check.field, 'anyof', packageId]
                        ],
                        columns: ['internalid']
                    });
                    
                    var depCount = 0;
                    var depIds = [];
                    depSearch.run().each(function(depResult) {
                        depCount++;
                        depIds.push(depResult.id);
                        return true;
                    });
                    
                    if (depCount > 0) {
                        totalDependencies += depCount;
                        log.error('✗ PACKAGE HAS ' + check.name.toUpperCase() + ' RECORDS', 
                            'Package ID: ' + packageId + 
                            ', Count: ' + depCount + 
                            ', IDs: ' + depIds.slice(0, 10).join(', ') + (depIds.length > 10 ? '...' : ''));
                    }
                } catch (e) {
                    // Record type or field doesn't exist - skip
                }
            });
            
            // CHECK 5: Check for file attachments
            log.debug('Checking for file attachments', 'Package ID: ' + packageId);
            try {
                var fileSearch = search.create({
                    type: 'file',
                    filters: [
                        ['folder', 'anyof', -1], // Search all folders
                        'AND',
                        ['filetype', 'anyof', 'PLAINTEXT', 'PDF', 'XML', 'HTML', 'CSV', 'ZIP'], // Common types
                        'AND',
                        ['name', 'contains', packageId] // Files named with package ID
                    ],
                    columns: ['internalid', 'name']
                });
                
                var fileCount = 0;
                fileSearch.run().each(function(fileResult) {
                    fileCount++;
                    log.debug('Found file', 'File ID: ' + fileResult.id + ', Name: ' + fileResult.getValue('name'));
                    return true;
                });
                
                if (fileCount > 0) {
                    log.debug('Package has related files', 'Count: ' + fileCount);
                }
            } catch (e) {
                log.debug('Could not check files', e.message);
            }
            
            // CHECK 6: Summary of dependencies
            if (totalDependencies > 0) {
                log.error('✗✗✗ TOTAL DEPENDENCIES FOUND ✗✗✗', 
                    'Package ID: ' + packageId + 
                    ', Total dependent records: ' + totalDependencies);
            } else {
                log.debug('✓ No other dependencies found', 'Package ID: ' + packageId);
            }
            
            // CHECK 7: Try to delete with timing and full error capture
            log.audit('ATTEMPTING DELETE', 'Package ID: ' + packageId);
            var startTime = new Date().getTime();
            var usageBefore = runtime.getCurrentScript().getRemainingUsage();
            
            try {
                record.delete({
                    type: 'customrecord_sps_package',
                    id: packageId
                });
                
                var endTime = new Date().getTime();
                var duration = endTime - startTime;
                var usageAfter = runtime.getCurrentScript().getRemainingUsage();
                var usageUsed = usageBefore - usageAfter;
                
                log.audit('✓✓✓ DELETE SUCCESSFUL ✓✓✓', 
                    'Package ID: ' + packageId + 
                    ', Duration: ' + duration + 'ms' +
                    ', Usage: ' + usageUsed + ' units');
                    
            } catch (e) {
                var endTime = new Date().getTime();
                var duration = endTime - startTime;
                var usageAfter = runtime.getCurrentScript().getRemainingUsage();
                var usageUsed = usageBefore - usageAfter;
                
                log.error('✗✗✗ DELETE FAILED ✗✗✗', 
                    'Package ID: ' + packageId);
                log.error('Error Details', 
                    'Name: ' + e.name + 
                    ', Message: ' + e.message +
                    ', Duration: ' + duration + 'ms' +
                    ', Usage: ' + usageUsed + ' units');
                
                // Detailed error analysis
                if (e.name === 'SSS_TIME_LIMIT_EXCEEDED') {
                    log.error('TIME LIMIT EXCEEDED', 
                        'The delete operation took too long (>5 seconds). ' +
                        'This usually means: workflows/scripts running, validation rules, or system overload.');
                } else if (e.name === 'SSS_USAGE_LIMIT_EXCEEDED') {
                    log.error('GOVERNANCE LIMIT EXCEEDED', 
                        'Script ran out of governance units. ' +
                        'This is the "limit reached" you saw in UI. ' +
                        'Remaining usage: ' + usageAfter);
                } else if (e.name === 'RECORD_IN_USE') {
                    log.error('RECORD IN USE', 
                        'Package is locked by another process. ' +
                        'Check for: running scripts, workflows, or other users editing it.');
                } else if (e.name === 'INVALID_RECORD_OPERATION') {
                    log.error('INVALID OPERATION', 
                        'Validation rule or business logic is preventing deletion. ' +
                        'Check: validation rules, workflows, or scripts on delete.');
                } else if (e.message && e.message.indexOf('dependent') > -1) {
                    log.error('DEPENDENCY ERROR', 
                        'Package has dependent records that must be deleted first. ' +
                        'Error: ' + e.message);
                } else {
                    log.error('UNKNOWN ERROR', 
                        'Error type: ' + e.name + ', Message: ' + e.message);
                }
                
                // Log full stack if available
                if (e.stack) {
                    log.debug('Error Stack', e.stack);
                }
            }
            
            // CHECK 8: Check record status and workflow state
            try {
                var recordStatus = packageRec.getValue({fieldId: 'isinactive'});
                var workflowState = packageRec.getValue({fieldId: 'workflowstate'});
                log.debug('Record Status', 
                    'Is Inactive: ' + recordStatus + 
                    ', Workflow State: ' + (workflowState || 'N/A'));
                
                if (workflowState) {
                    log.debug('Package has workflow state', 
                        'This might trigger workflows on delete that could cause delays');
                }
            } catch (e) {
                // Fields don't exist - skip
            }
            
            // CHECK 9: Governance check
            var remainingUsage = runtime.getCurrentScript().getRemainingUsage();
            log.debug('Governance Status', 'Remaining: ' + remainingUsage);
            if (remainingUsage < 1000) {
                log.error('LOW GOVERNANCE WARNING', 
                    'Only ' + remainingUsage + ' units remaining. ' +
                    'Script may hit limit soon.');
            }
            
            count++;
            return true;
        });
        
        log.audit('==========================================', '');
        log.audit('DIAGNOSTIC COMPLETE', 'Checked ' + count + ' packages');
        log.audit('Final Governance', 'Remaining: ' + runtime.getCurrentScript().getRemainingUsage());
    }

    return {
        execute: execute
    };

});
