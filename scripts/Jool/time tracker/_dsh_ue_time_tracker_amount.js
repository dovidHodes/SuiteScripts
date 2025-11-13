/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * @description User Event script to set amount field to 0 on time tracker transaction lines
 * This script runs after lines are saved to override the amount from 0.01 to 0
 */

define(['N/record', 'N/log'], function (record, log) {
  
  /**
   * Function to execute before record is submitted
   * @param {Object} context
   * @param {Record} context.newRecord - The record being submitted
   * @param {Record} context.oldRecord - The record before changes (null for create)
   * @param {string} context.type - The execution context type
   */
  function beforeSubmit(context) {
    try {
      var newRecord = context.newRecord;
      var lineCount = newRecord.getLineCount({
        sublistId: 'line'
      });
      
      // Loop through all lines and set amount to 0 if it's 0.01
      for (var i = 0; i < lineCount; i++) {
        try {
          var currentAmount = newRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'amount',
            line: i
          });
          
          // If amount is 0.01 (set by script to bypass validation), change it to 0
          if (currentAmount === 0.01 || currentAmount === '0.01') {
            newRecord.setSublistValue({
              sublistId: 'line',
              fieldId: 'amount',
              line: i,
              value: 0
            });
            log.debug('Amount Update', 'Set amount to 0 on line ' + i);
          }
        } catch (lineError) {
          log.error('Line Error', 'Error processing line ' + i + ': ' + lineError.toString());
        }
      }
    } catch (e) {
      log.error('beforeSubmit Error', 'Error in time tracker UE script: ' + e.toString());
      // Don't throw - allow record to save even if this fails
    }
  }
  
  /**
   * Function to execute after record is submitted
   * @param {Object} context
   * @param {Record} context.newRecord - The record that was submitted
   * @param {Record} context.oldRecord - The record before changes (null for create)
   * @param {string} context.type - The execution context type
   */
  function afterSubmit(context) {
    try {
      var newRecord = context.newRecord;
      var recordId = newRecord.id;
      
      // Reload the record to check if any amounts need to be updated
      var reloadedRecord = record.load({
        type: 'customtransaction_time_tracker',
        id: recordId,
        isDynamic: true
      });
      
      var lineCount = reloadedRecord.getLineCount({
        sublistId: 'line'
      });
      
      var needsUpdate = false;
      
      // Check if any line has amount = 0.01
      for (var i = 0; i < lineCount; i++) {
        try {
          var currentAmount = reloadedRecord.getSublistValue({
            sublistId: 'line',
            fieldId: 'amount',
            line: i
          });
          
          if (currentAmount === 0.01 || currentAmount === '0.01') {
            needsUpdate = true;
            break;
          }
        } catch (lineError) {
          // Continue checking other lines
        }
      }
      
      // If any line needs update, update all lines with 0.01 to 0
      if (needsUpdate) {
        for (var j = 0; j < lineCount; j++) {
          try {
            var amount = reloadedRecord.getSublistValue({
              sublistId: 'line',
              fieldId: 'amount',
              line: j
            });
            
            if (amount === 0.01 || amount === '0.01') {
              reloadedRecord.selectLine({
                sublistId: 'line',
                line: j
              });
              
              reloadedRecord.setCurrentSublistValue({
                sublistId: 'line',
                fieldId: 'amount',
                value: 0
              });
              
              reloadedRecord.commitLine({
                sublistId: 'line'
              });
              
              log.debug('Amount Update', 'Updated amount to 0 on line ' + j + ' in afterSubmit');
            }
          } catch (lineError) {
            log.error('Line Update Error', 'Error updating line ' + j + ': ' + lineError.toString());
          }
        }
        
        // Save the record with updated amounts
        reloadedRecord.save();
        log.audit('Amount Update', 'Updated amounts to 0 for time tracker record: ' + recordId);
      }
    } catch (e) {
      log.error('afterSubmit Error', 'Error in time tracker UE script afterSubmit: ' + e.toString());
      // Don't throw - allow record to save even if this fails
    }
  }
  
  return {
    beforeSubmit: beforeSubmit,
    afterSubmit: afterSubmit
  };
});

