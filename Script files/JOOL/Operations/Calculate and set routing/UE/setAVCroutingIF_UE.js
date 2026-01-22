/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */

define([
    'N/record', 
    'N/log',
    './_dsh_lib_time_tracker',  // Time tracker library - same folder in SuiteScripts
    './_dsh_lib_routing_calculator'  // Routing calculator library - same folder in SuiteScripts
], function(record, log, timeTrackerLib, routingLib) {
    
    /**
     * Function to be executed before record submit.
     * Sets Amazon location number for routing purposes on Item Fulfillment records.
     */
    function afterSubmit(context) {
        try {
            
            // Load the updated record to get current values
            var updatedRecord = record.load({
                type: 'itemfulfillment',
                id: context.newRecord.id,
                isDynamic: false
            });
            
            // Check if entity ID is 1716, if not end immediately
            var entityId = parseInt(updatedRecord.getValue('entity'));
            if (entityId !== 1716) {
                log.debug('Entity Check', 'Entity ID is not 1716 (' + entityId + '), skipping processing');
                return;
            }
        
            
            log.debug('Amazon Location Number Setter', 'Processing Item Fulfillment: ' + updatedRecord.id);
            
            // Calculate and apply routing fields using library (handles everything)
            // Library will check entity, load location, calculate fields, set pickup date, set routing status
            var success = routingLib.calculateAndApplyRoutingFields(context.newRecord.id);
            
            if (!success) {
                log.warning('applyAmazonRoutingRequest', 'Failed to calculate and apply routing fields to IF');
                return;
            }
            
            // Add time tracker lines for routing field population
            // Action ID 3 = "Request Routing" (3rd action in the list)
            // Action ID 4 = "Populate routing" (4th action in the list)
            try {
                var ifTranId = updatedRecord.getValue('tranid') || context.newRecord.id;
                
                if (entityId) {
                    // First time tracker line - Request Routing (Employee 5)
                    try {
                        log.debug('Time Tracker - Request Routing', 'Adding time tracker line for IF: ' + ifTranId + ', Customer: ' + entityId + ', Action: Request Routing');
                        timeTrackerLib.addTimeTrackerLine({
                            actionId: 3, // Request Routing action ID
                            customerId: entityId,
                            timeSaved: 5, // 5 seconds
                            employeeId: 5
                        });
                        log.debug('Time Tracker - Request Routing', 'Successfully added time tracker line for employee 5, action 3');
                    } catch (timeTrackerError1) {
                        log.error('Time Tracker Error - Request Routing', 'Failed to add time tracker line for employee 5: ' + timeTrackerError1.toString());
                    }
                    
                    // Second time tracker line - Populate routing back (Employee 5)
                    try {
                        log.debug('Time Tracker - Populate Routing Back', 'Adding time tracker line for IF: ' + ifTranId + ', Customer: ' + entityId + ', Action: Populate routing');
                        timeTrackerLib.addTimeTrackerLine({
                            actionId: 4, // Populate routing action ID
                            customerId: entityId,
                            timeSaved: 5, // 5 seconds
                            employeeId: 5
                        });
                        log.debug('Time Tracker - Populate Routing Back', 'Successfully added time tracker line for employee 5, action 4');
                    } catch (timeTrackerError2) {
                        log.error('Time Tracker Error - Populate Routing Back', 'Failed to add time tracker line for employee 5: ' + timeTrackerError2.toString());
                    }
                } else {
                    log.debug('Time Tracker', 'Skipping time tracker - no customer ID found on IF: ' + ifTranId);
                }
            } catch (timeTrackerError) {
                // Log error but don't fail the routing field population
                log.error('Time Tracker Error', 'Failed to add time tracker lines: ' + timeTrackerError.toString());
            }
            
        } catch (e) {
            log.error('applyAmazonRoutingRequest', 'Error applying Amazon routing request: ' + e.toString());
        }
    }
    
    
    return {
        afterSubmit: afterSubmit
    };
});
