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
    'N/runtime'
], function(record, log, email, url, runtime) {
    
    /**
     * Gets the appropriate sublist ID based on transaction type
     * @param {string} transactionType - The transaction type
     * @returns {string|null} The sublist ID or null if not supported
     */
    function getSublistId(transactionType) {
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
            case record.Type.VENDOR_PAYMENT:  // Bill Payment
            case record.Type.VENDOR_PREPAYMENT:
            case record.Type.VENDOR_PREPAYMENT_APPLICATION:  // Prepayment Application
            case record.Type.CHECK:
            case record.Type.DEPOSIT:
            case record.Type.CUSTOMER_DEPOSIT:
            case record.Type.CHARGE:
                return 'item';
            
            // Transactions that use 'expense' sublist
            case record.Type.VENDOR_BILL:
            case record.Type.EXPENSE_REPORT:
                return 'expense';
            
            // Journal Entries are excluded - return null to skip processing
            case record.Type.JOURNAL_ENTRY:
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
     * @returns {Object} Object with departments array, hasBlank flag, and hasDept1 flag
     */
    function checkItemSublistDepartments(rec) {
        var departments = [];
        var hasBlank = false;
        var hasDept1 = false;
        var lineCount = rec.getLineCount({ sublistId: 'item' });
        
        for (var i = 0; i < lineCount; i++) {
            var department = rec.getSublistValue({
                sublistId: 'item',
                fieldId: 'department',
                line: i
            });
            
            if (!department || department === '') {
                hasBlank = true;
            } else {
                if (department == '1') {
                    hasDept1 = true;
                }
                if (departments.indexOf(department) === -1) {
                    departments.push(department);
                }
            }
        }
        
        return {
            departments: departments,
            hasBlank: hasBlank,
            hasDept1: hasDept1
        };
    }
    
    /**
     * Checks department on lines for transactions using 'expense' sublist
     * @param {Record} rec - The transaction record
     * @returns {Object} Object with departments array, hasBlank flag, and hasDept1 flag
     */
    function checkExpenseSublistDepartments(rec) {
        var departments = [];
        var hasBlank = false;
        var hasDept1 = false;
        var lineCount = rec.getLineCount({ sublistId: 'expense' });
        
        for (var i = 0; i < lineCount; i++) {
            var department = rec.getSublistValue({
                sublistId: 'expense',
                fieldId: 'department',
                line: i
            });
            
            if (!department || department === '') {
                hasBlank = true;
            } else {
                if (department == '1') {
                    hasDept1 = true;
                }
                if (departments.indexOf(department) === -1) {
                    departments.push(department);
                }
            }
        }
        
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
        switch (sublistId) {
            case 'item':
                return checkItemSublistDepartments(rec);
            case 'expense':
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
    function sendEmailNotification(rec, transactionType, issue) {
        try {
            var tranId = rec.getValue({ fieldId: 'tranid' });
            var recordId = rec.id;
            
            // Generate record URL
            var recordUrl = url.resolveRecord({
                recordType: transactionType,
                recordId: recordId,
                isEditMode: false
            });
            
            var emailBody = 'Department Validation Issue Detected\n\n';
            emailBody += 'Issue: ' + issue + '\n';
            emailBody += 'Transaction ID: ' + (tranId || 'N/A') + '\n';
            emailBody += 'Transaction Type: ' + transactionType + '\n';
            emailBody += 'Record ID: ' + recordId + '\n\n';
            emailBody += 'View Record: ' + recordUrl;
            
            email.send({
                author: runtime.getCurrentUser().id,
                recipients: 'd.hodes@agaimport.com',
                subject: 'AGA - Department Validation Issue: ' + (tranId || recordId),
                body: emailBody
            });
            
            log.audit('sendEmailNotification', 'Email sent for transaction: ' + (tranId || recordId));
        } catch (e) {
            log.error('sendEmailNotification', 'Error sending email: ' + e.toString());
        }
    }
    
    /**
     * Function executed before record is saved
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record being saved
     * @param {string} scriptContext.type - Trigger type (create, edit, etc.)
     */
    function beforeSubmit(scriptContext) {
        try {
            var rec = scriptContext.newRecord;
            var transactionType = rec.type;
            
            // Skip Journal Entries
            if (transactionType === record.Type.JOURNAL_ENTRY) {
                return;
            }
            
            log.debug('beforeSubmit', 'Processing transaction type: ' + transactionType);
            
            // Get the appropriate sublist ID for this transaction type
            var sublistId = getSublistId(transactionType);
            
            if (!sublistId) {
                log.debug('beforeSubmit', 'Transaction type not supported: ' + transactionType);
                return;
            }
            
            // Check if there are any lines
            var lineCount = rec.getLineCount({ sublistId: sublistId });
            if (lineCount === 0) {
                log.debug('beforeSubmit', 'No lines found in sublist: ' + sublistId);
                return;
            }
            
            // Check departments based on sublist type
            var deptInfo = checkDepartments(rec, sublistId);
            
            // If any line has department 1, set header department to 1
            if (deptInfo.hasDept1) {
                try {
                    rec.setValue({
                        fieldId: 'department',
                        value: '1'
                    });
                    log.debug('beforeSubmit', 'Set header department to 1');
                } catch (e) {
                    log.error('beforeSubmit', 'Error setting header department: ' + e.toString());
                }
            }
            
            // Store issue information for afterSubmit email
            // We'll check again in afterSubmit to send email with record link
            if (deptInfo.hasBlank || deptInfo.departments.length > 1) {
                // Store in a custom field or use a different approach
                // For now, we'll handle in afterSubmit
            }
            
        } catch (e) {
            log.error('beforeSubmit', 'Error in beforeSubmit: ' + e.toString());
        }
    }
    
    /**
     * Function executed after record is saved
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record that was saved
     * @param {string} scriptContext.type - Trigger type (create, edit, etc.)
     */
    function afterSubmit(scriptContext) {
        try {
            var rec = scriptContext.newRecord;
            var transactionType = rec.type;
            var recordId = rec.id;
            
            // Skip Journal Entries
            if (transactionType === record.Type.JOURNAL_ENTRY) {
                return;
            }
            
            log.debug('afterSubmit', 'Processing transaction type: ' + transactionType + ', ID: ' + recordId);
            
            // Get the appropriate sublist ID for this transaction type
            var sublistId = getSublistId(transactionType);
            
            if (!sublistId) {
                log.debug('afterSubmit', 'Transaction type not supported: ' + transactionType);
                return;
            }
            
            // Reload record to get fresh data
            var loadedRec = record.load({
                type: transactionType,
                id: recordId,
                isDynamic: false
            });
            
            // Check if there are any lines
            var lineCount = loadedRec.getLineCount({ sublistId: sublistId });
            if (lineCount === 0) {
                log.debug('afterSubmit', 'No lines found in sublist: ' + sublistId);
                return;
            }
            
            // Check departments based on sublist type
            var deptInfo = checkDepartments(loadedRec, sublistId);
            
            // Send email if there are issues
            if (deptInfo.hasBlank && deptInfo.departments.length > 1) {
                sendEmailNotification(
                    loadedRec,
                    transactionType,
                    'Lines have blank departments AND multiple different departments'
                );
            } else if (deptInfo.hasBlank) {
                sendEmailNotification(
                    loadedRec,
                    transactionType,
                    'One or more lines have blank departments'
                );
            } else if (deptInfo.departments.length > 1) {
                sendEmailNotification(
                    loadedRec,
                    transactionType,
                    'Lines have multiple different departments: ' + deptInfo.departments.join(', ')
                );
            }
            
        } catch (e) {
            log.error('afterSubmit', 'Error in afterSubmit: ' + e.toString());
        }
    }
    
    return {
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});

