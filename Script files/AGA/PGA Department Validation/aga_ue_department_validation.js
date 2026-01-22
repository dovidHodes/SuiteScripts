/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * 
 * User Event script that validates department assignments on transaction lines.
 * - Checks department on line level for all transaction types
 * - Sets header department to 1 if any line has department 1
 * - Sends email notification if lines have blank departments or multiple different departments
 * 
 * Deployment: Set "Applies To" to all transaction types that need validation
 */

define([
    'N/record',
    'N/log',
    'N/email',
    'N/url',
    'N/runtime',
    'N/search'
], function(record, log, email, url, runtime, search) {
    
    /**
     * Gets department name from department ID
     * @param {string} deptId - Department internal ID
     * @returns {string} Department name or ID if lookup fails
     */
    function getDepartmentName(deptId) {
        if (!deptId) {
            return '';
        }
        try {
            var deptRecord = record.load({
                type: record.Type.DEPARTMENT,
                id: deptId,
                isDynamic: false
            });
            return deptRecord.getValue('name') || deptId;
        } catch (e) {
            log.debug('getDepartmentName', 'Could not load department ' + deptId + ': ' + e.toString());
            return deptId;
        }
    }
    
    /**
     * Gets the appropriate sublist ID based on transaction type
     * @param {string} transactionType - The transaction type
     * @returns {string|null} The sublist ID or null if not supported
     */
    function getSublistId(transactionType) {
        log.debug('getSublistId', 'Called with transaction type: ' + transactionType);
        var sublistId;
        switch (transactionType) {
            // Transactions that use 'item' sublist
            case record.Type.SALES_ORDER:
            case record.Type.INVOICE:
            case record.Type.ESTIMATE:
            case record.Type.PURCHASE_ORDER:
            case record.Type.ITEM_FULFILLMENT:
            case record.Type.ITEM_RECEIPT:
            case record.Type.CASH_SALE:
            case record.Type.CUSTOMER_PAYMENT:
            case record.Type.CUSTOMER_REFUND:
            case record.Type.RETURN_AUTHORIZATION:
            case record.Type.CREDIT_MEMO:
            case record.Type.VENDOR_CREDIT:
            case record.Type.ASSEMBLY_BUILD:
            case record.Type.ASSEMBLY_UNBUILD:
            case record.Type.INVENTORY_ADJUSTMENT:
            case record.Type.INVENTORY_COST_REVALUATION:
            case record.Type.INVENTORY_TRANSFER:
            case record.Type.WORK_ORDER:
            case record.Type.WORK_ORDER_ISSUE:
            case record.Type.WORK_ORDER_COMPLETION:
            case record.Type.WORK_ORDER_CLOSE:
            // Financial transaction types
            case record.Type.VENDOR_BILL:  // Bill
            case record.Type.VENDOR_PAYMENT:  // Bill Payment
            case record.Type.VENDOR_PREPAYMENT:
            case record.Type.VENDOR_PREPAYMENT_APPLICATION:  // Prepayment Application
            case record.Type.CHECK:
            case record.Type.DEPOSIT:
            case record.Type.CUSTOMER_DEPOSIT:
            case record.Type.CHARGE:
                sublistId = 'item';
                log.debug('getSublistId', 'Transaction type ' + transactionType + ' uses sublist: ' + sublistId);
                return sublistId;
            
            // Transactions that use 'expense' sublist
            case record.Type.EXPENSE_REPORT:
                sublistId = 'expense';
                log.debug('getSublistId', 'Transaction type ' + transactionType + ' uses sublist: ' + sublistId);
                return sublistId;
            
            // Journal Entries are excluded - return null to skip processing
            case record.Type.JOURNAL_ENTRY:
                log.debug('getSublistId', 'Journal Entry detected - skipping processing');
                return null;
            
            // Default - try 'item' first, but log warning
            default:
                log.debug('getSublistId', 'Unknown transaction type: ' + transactionType + ', defaulting to "item"');
                return 'item';
        }
    }
    
    /**
     * Checks department on lines for transactions using 'item' sublist
     * @param {Record} rec - The transaction record
     * @returns {Object} Object with departments array (with IDs and names), hasBlank flag, and hasDept1 flag
     */
    function checkItemSublistDepartments(rec) {
        log.debug('checkItemSublistDepartments', 'Starting check for item sublist');
        var departments = [];
        var departmentMap = {}; // Map to store unique departments with names
        var hasBlank = false;
        var hasDept1 = false;
        var lineCount = rec.getLineCount({ sublistId: 'item' });
        log.debug('checkItemSublistDepartments', 'Line count: ' + lineCount);
        
        for (var i = 0; i < lineCount; i++) {
            var departmentId = rec.getSublistValue({
                sublistId: 'item',
                fieldId: 'department',
                line: i
            });
            
            log.debug('checkItemSublistDepartments', 'Line ' + i + ' department ID: ' + (departmentId || 'BLANK'));
            
            if (!departmentId || departmentId === '') {
                hasBlank = true;
                log.debug('checkItemSublistDepartments', 'Line ' + i + ' has blank department');
            } else {
                if (departmentId == '1') {
                    hasDept1 = true;
                    log.debug('checkItemSublistDepartments', 'Line ' + i + ' has department 1');
                }
                if (!departmentMap[departmentId]) {
                    var deptName = getDepartmentName(departmentId);
                    departmentMap[departmentId] = {
                        id: departmentId,
                        name: deptName
                    };
                    departments.push(departmentMap[departmentId]);
                    log.debug('checkItemSublistDepartments', 'Added department ' + departmentId + ' (' + deptName + ') to list');
                }
            }
        }
        
        var deptList = departments.map(function(d) { return d.id + ' (' + d.name + ')'; }).join(', ');
        log.debug('checkItemSublistDepartments', 'Results - Departments: [' + deptList + '], hasBlank: ' + hasBlank + ', hasDept1: ' + hasDept1);
        
        return {
            departments: departments,
            hasBlank: hasBlank,
            hasDept1: hasDept1
        };
    }
    
    /**
     * Checks department on lines for transactions using 'expense' sublist
     * @param {Record} rec - The transaction record
     * @returns {Object} Object with departments array (with IDs and names), hasBlank flag, and hasDept1 flag
     */
    function checkExpenseSublistDepartments(rec) {
        log.debug('checkExpenseSublistDepartments', 'Starting check for expense sublist');
        var departments = [];
        var departmentMap = {}; // Map to store unique departments with names
        var hasBlank = false;
        var hasDept1 = false;
        var lineCount = rec.getLineCount({ sublistId: 'expense' });
        log.debug('checkExpenseSublistDepartments', 'Line count: ' + lineCount);
        
        for (var i = 0; i < lineCount; i++) {
            var departmentId = rec.getSublistValue({
                sublistId: 'expense',
                fieldId: 'department',
                line: i
            });
            
            log.debug('checkExpenseSublistDepartments', 'Line ' + i + ' department ID: ' + (departmentId || 'BLANK'));
            
            if (!departmentId || departmentId === '') {
                hasBlank = true;
                log.debug('checkExpenseSublistDepartments', 'Line ' + i + ' has blank department');
            } else {
                if (departmentId == '1') {
                    hasDept1 = true;
                    log.debug('checkExpenseSublistDepartments', 'Line ' + i + ' has department 1');
                }
                if (!departmentMap[departmentId]) {
                    var deptName = getDepartmentName(departmentId);
                    departmentMap[departmentId] = {
                        id: departmentId,
                        name: deptName
                    };
                    departments.push(departmentMap[departmentId]);
                    log.debug('checkExpenseSublistDepartments', 'Added department ' + departmentId + ' (' + deptName + ') to list');
                }
            }
        }
        
        var deptList = departments.map(function(d) { return d.id + ' (' + d.name + ')'; }).join(', ');
        log.debug('checkExpenseSublistDepartments', 'Results - Departments: [' + deptList + '], hasBlank: ' + hasBlank + ', hasDept1: ' + hasDept1);
        
        return {
            departments: departments,
            hasBlank: hasBlank,
            hasDept1: hasDept1
        };
    }
    
    /**
     * Checks departments based on transaction type and sublist
     * @param {Record} rec - The transaction record
     * @param {string} sublistId - The sublist ID to check
     * @returns {Object} Object with departments array, hasBlank flag, and hasDept1 flag
     */
    function checkDepartments(rec, sublistId) {
        log.debug('checkDepartments', 'Called with sublistId: ' + sublistId);
        switch (sublistId) {
            case 'item':
                log.debug('checkDepartments', 'Checking item sublist');
                return checkItemSublistDepartments(rec);
            case 'expense':
                log.debug('checkDepartments', 'Checking expense sublist');
                return checkExpenseSublistDepartments(rec);
            default:
                log.error('checkDepartments', 'Unknown sublist ID: ' + sublistId);
                return {
                    departments: [],
                    hasBlank: false,
                    hasDept1: false
                };
        }
    }
    
    /**
     * Sends email notification about department issues
     * @param {Record} rec - The transaction record
     * @param {string} transactionType - The transaction type
     * @param {string} issue - Description of the issue
     */
    function sendEmailNotification(rec, transactionType, issue, deptInfo) {
        log.debug('sendEmailNotification', 'Preparing to send email notification');
        try {
            var tranId = rec.getValue({ fieldId: 'tranid' });
            var recordId = rec.id;
            log.debug('sendEmailNotification', 'Transaction ID: ' + (tranId || 'N/A') + ', Record ID: ' + recordId);
            
            // Generate record URL with full account URL prefix
            log.debug('sendEmailNotification', 'Generating record URL');
            var recordUrlPath = url.resolveRecord({
                recordType: transactionType,
                recordId: recordId,
                isEditMode: false
            });
            
            // Get account domain to ensure full URL
            var accountDomain = url.resolveDomain({
                hostType: url.HostType.APPLICATION
            });
            
            // Construct full URL - if recordUrlPath already starts with http, use it as-is, otherwise prepend domain
            var recordUrl = recordUrlPath;
            if (!recordUrlPath.startsWith('http://') && !recordUrlPath.startsWith('https://')) {
                // If path doesn't start with /, add it
                if (!recordUrlPath.startsWith('/')) {
                    recordUrlPath = '/' + recordUrlPath;
                }
                recordUrl = accountDomain + recordUrlPath;
            }
            
            log.debug('sendEmailNotification', 'Full Record URL: ' + recordUrl);
            
            // Build department list with names
            var deptListHtml = '';
            if (deptInfo && deptInfo.departments && deptInfo.departments.length > 0) {
                var deptNames = deptInfo.departments.map(function(d) {
                    return d.name + ' (ID: ' + d.id + ')';
                });
                deptListHtml = '<p><strong>Departments found:</strong> ' + deptNames.join(', ') + '</p>';
            }
            
            // Create HTML email body with clickable link
            var emailBody = '<html><body>';
            emailBody += '<h2>Department Validation Issue Detected</h2>';
            emailBody += '<p><strong>Issue:</strong> ' + issue + '</p>';
            emailBody += '<p><strong>Transaction ID:</strong> ' + (tranId || 'N/A') + '</p>';
            emailBody += '<p><strong>Transaction Type:</strong> ' + transactionType + '</p>';
            if (deptListHtml) {
                emailBody += deptListHtml;
            }
            emailBody += '<p><strong>View Record:</strong> <a href="' + recordUrl + '">View Record</a></p>';
            emailBody += '</body></html>';
            
            log.debug('sendEmailNotification', 'Sending email to d.hodes@agaimport.com and albert@aga');
            email.send({
                author: runtime.getCurrentUser().id,
                recipients: ['d.hodes@agaimport.com', 'albert@agaimport.com'],
                subject: 'Palladium - Department Validation Issue: ' + (tranId || recordId),
                body: emailBody,
                relatedRecords: {
                    transactionId: recordId
                }
            });
            
            log.audit('sendEmailNotification', 'Email sent successfully for transaction: ' + (tranId || recordId));
        } catch (e) {
            log.error('sendEmailNotification', 'Error sending email: ' + e.toString());
            log.error('sendEmailNotification', 'Stack trace: ' + e.stack);
        }
    }
    
    /**
     * Function executed before record is saved
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record being saved
     * @param {string} scriptContext.type - Trigger type (create, edit, etc.)
     */
    function beforeSubmit(scriptContext) {
        log.debug('beforeSubmit', '=== BEFORE SUBMIT TRIGGERED ===');
        log.debug('beforeSubmit', 'Context type: ' + scriptContext.type);
        try {
            var rec = scriptContext.newRecord;
            var transactionType = rec.type;
            var recordId = rec.id;
            var tranId = rec.getValue({ fieldId: 'tranid' });
            
            log.debug('beforeSubmit', 'Record ID: ' + recordId);
            log.debug('beforeSubmit', 'Transaction ID: ' + (tranId || 'N/A'));
            log.debug('beforeSubmit', 'Transaction type: ' + transactionType);
            
            // Skip Journal Entries
            if (transactionType === record.Type.JOURNAL_ENTRY) {
                log.debug('beforeSubmit', 'Skipping Journal Entry');
                return;
            }
            
            log.debug('beforeSubmit', 'Processing transaction type: ' + transactionType);
            
            // Get the appropriate sublist ID for this transaction type
            var sublistId = getSublistId(transactionType);
            log.debug('beforeSubmit', 'Sublist ID returned: ' + (sublistId || 'NULL'));
            
            if (!sublistId) {
                log.debug('beforeSubmit', 'Transaction type not supported (sublistId is null): ' + transactionType);
                return;
            }
            
            // Check if there are any lines
            var lineCount = rec.getLineCount({ sublistId: sublistId });
            log.debug('beforeSubmit', 'Line count in sublist "' + sublistId + '": ' + lineCount);
            
            if (lineCount === 0) {
                log.debug('beforeSubmit', 'No lines found in sublist: ' + sublistId + ' - exiting');
                return;
            }
            
            // Check departments based on sublist type
            log.debug('beforeSubmit', 'Calling checkDepartments with sublistId: ' + sublistId);
            var deptInfo = checkDepartments(rec, sublistId);
            log.debug('beforeSubmit', 'Department check results - hasBlank: ' + deptInfo.hasBlank + ', hasDept1: ' + deptInfo.hasDept1 + ', departments: [' + deptInfo.departments.join(', ') + ']');
            
            // If any line has department 1, set header department to 1
            if (deptInfo.hasDept1) {
                log.debug('beforeSubmit', 'Found department 1 on lines - setting header department to 1');
                try {
                    rec.setValue({
                        fieldId: 'department',
                        value: '1'
                    });
                    log.debug('beforeSubmit', 'Successfully set header department to 1');
                } catch (e) {
                    log.error('beforeSubmit', 'Error setting header department: ' + e.toString());
                }
            } else {
                log.debug('beforeSubmit', 'No department 1 found on lines - header department not changed');
            }
            
            // Store issue information for afterSubmit email
            // We'll check again in afterSubmit to send email with record link
            if (deptInfo.hasBlank || deptInfo.departments.length > 1) {
                log.debug('beforeSubmit', 'Issues detected - hasBlank: ' + deptInfo.hasBlank + ', multiple departments: ' + (deptInfo.departments.length > 1));
                // Store in a custom field or use a different approach
                // For now, we'll handle in afterSubmit
            } else {
                log.debug('beforeSubmit', 'No department issues detected');
            }
            
            log.debug('beforeSubmit', '=== BEFORE SUBMIT COMPLETED ===');
            
        } catch (e) {
            log.error('beforeSubmit', 'Error in beforeSubmit: ' + e.toString());
            log.error('beforeSubmit', 'Stack trace: ' + e.stack);
        }
    }
    
    /**
     * Function executed after record is saved
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record that was saved
     * @param {string} scriptContext.type - Trigger type (create, edit, etc.)
     */
    function afterSubmit(scriptContext) {
        log.debug('afterSubmit', '=== AFTER SUBMIT TRIGGERED ===');
        log.debug('afterSubmit', 'Context type: ' + scriptContext.type);
        try {
            var rec = scriptContext.newRecord;
            var transactionType = rec.type;
            var recordId = rec.id;
            var tranId = rec.getValue({ fieldId: 'tranid' });
            
            log.debug('afterSubmit', 'Record ID: ' + recordId);
            log.debug('afterSubmit', 'Transaction ID: ' + (tranId || 'N/A'));
            log.debug('afterSubmit', 'Transaction type: ' + transactionType);
            
            // Skip Journal Entries
            if (transactionType === record.Type.JOURNAL_ENTRY) {
                log.debug('afterSubmit', 'Skipping Journal Entry');
                return;
            }
            
            log.debug('afterSubmit', 'Processing transaction type: ' + transactionType + ', ID: ' + recordId);
            
            // Get the appropriate sublist ID for this transaction type
            var sublistId = getSublistId(transactionType);
            log.debug('afterSubmit', 'Sublist ID returned: ' + (sublistId || 'NULL'));
            
            if (!sublistId) {
                log.debug('afterSubmit', 'Transaction type not supported (sublistId is null): ' + transactionType);
                return;
            }
            
            // Reload record to get fresh data
            log.debug('afterSubmit', 'Reloading record with ID: ' + recordId);
            var loadedRec = record.load({
                type: transactionType,
                id: recordId,
                isDynamic: false
            });
            log.debug('afterSubmit', 'Record reloaded successfully');
            
            // Check if there are any lines
            var lineCount = loadedRec.getLineCount({ sublistId: sublistId });
            log.debug('afterSubmit', 'Line count in sublist "' + sublistId + '": ' + lineCount);
            
            if (lineCount === 0) {
                log.debug('afterSubmit', 'No lines found in sublist: ' + sublistId + ' - exiting');
                return;
            }
            
            // Check departments based on sublist type
            log.debug('afterSubmit', 'Calling checkDepartments with sublistId: ' + sublistId);
            var deptInfo = checkDepartments(loadedRec, sublistId);
            var deptListDebug = deptInfo.departments.map(function(d) { return d.id + ' (' + d.name + ')'; }).join(', ');
            log.debug('afterSubmit', 'Department check results - hasBlank: ' + deptInfo.hasBlank + ', hasDept1: ' + deptInfo.hasDept1 + ', departments: [' + deptListDebug + ']');
            
            // Send email if there are issues
            if (deptInfo.hasBlank && deptInfo.departments.length > 1) {
                log.debug('afterSubmit', 'Sending email - Lines have blank departments AND multiple different departments');
                sendEmailNotification(
                    loadedRec,
                    transactionType,
                    'Lines have blank departments AND multiple different departments',
                    deptInfo
                );
            } else if (deptInfo.hasBlank) {
                log.debug('afterSubmit', 'Sending email - One or more lines have blank departments');
                sendEmailNotification(
                    loadedRec,
                    transactionType,
                    'One or more lines have blank departments',
                    deptInfo
                );
            } else if (deptInfo.departments.length > 1) {
                var deptList = deptInfo.departments.map(function(d) { return d.name + ' (ID: ' + d.id + ')'; }).join(', ');
                log.debug('afterSubmit', 'Sending email - Lines have multiple different departments: ' + deptList);
                sendEmailNotification(
                    loadedRec,
                    transactionType,
                    'Lines have multiple different departments: ' + deptList,
                    deptInfo
                );
            } else {
                log.debug('afterSubmit', 'No department issues - no email sent');
            }
            
            log.debug('afterSubmit', '=== AFTER SUBMIT COMPLETED ===');
            
        } catch (e) {
            log.error('afterSubmit', 'Error in afterSubmit: ' + e.toString());
            log.error('afterSubmit', 'Stack trace: ' + e.stack);
        }
    }
    
    return {
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});

