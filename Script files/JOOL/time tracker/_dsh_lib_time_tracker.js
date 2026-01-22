/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Time Tracker Library - Reusable function for adding time tracker lines
 * Use this library function in all scripts that need to track time saved
 */

define([
  'N/record',
  'N/log'
], function (record, log) {
  
  /**
   * Add a line to the time tracker custom transaction
   * @param {Object} options - Configuration options
   * @param {number} options.actionId - Internal ID of the action (custcol_action)
   * @param {number} options.customerId - Internal ID of the customer (custcol_trading_partner)
   * @param {number} options.timeSaved - Time saved in seconds (custcol_time_saved)
   * @param {number} [options.employeeId=5] - Employee ID (custcol_employee), defaults to 5
   * @param {number} [options.timeTrackerRecordId=15829943] - Time tracker transaction ID, defaults to 15829943
   * @param {number} [options.accountId=621] - Account ID, defaults to 621
   * @returns {string} Record ID of the time tracker transaction
   */
  function addTimeTrackerLine(options) {
    try {
      log.debug('Time Tracker - Start', 'Function called with options: ' + JSON.stringify(options));
      
      // Validate required parameters
      if (!options || !options.actionId || !options.customerId || options.timeSaved === undefined) {
        log.error('Time Tracker - Validation Failed', 'Missing required parameters. Options: ' + JSON.stringify(options));
        throw new Error('Missing required parameters: actionId, customerId, and timeSaved are required');
      }
      
      // Load the existing time tracker transaction
      var timeTrackerRecordId = options.timeTrackerRecordId || 15829943;
      log.debug('Time Tracker - Loading Record', 'Loading time tracker record ID: ' + timeTrackerRecordId);
      
      var timeTrackerRecord = record.load({
        type: 'customtransaction_time_tracker',
        id: timeTrackerRecordId,
        isDynamic: true
      });
      
      // Get the current line count
      var lineCount = timeTrackerRecord.getLineCount({
        sublistId: 'line'
      });
      
      log.debug('Time Tracker - Line Count', 'Current line count: ' + lineCount + ', About to insert new line at position: ' + lineCount);
      
      // Insert a new line at the end of the sublist
      timeTrackerRecord.insertLine({
        sublistId: 'line',
        line: lineCount // Inserts at the end (0-indexed)
      });
      
      log.debug('Time Tracker - Line Inserted', 'Successfully inserted line at position: ' + lineCount);
      
      // Select the newly inserted line
      timeTrackerRecord.selectLine({
        sublistId: 'line',
        line: lineCount
      });
      
      // Set values for fields on the newly inserted line
      var accountId = options.accountId || 621;
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: accountId
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'amount',
        value: 0.01 // Will be set to 0 by User Event script
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_action',
        value: options.actionId
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_trading_partner',
        value: options.customerId
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_employee',
        value: options.employeeId || 5
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_time_saved',
        value: options.timeSaved
      });
      
      // Set datetime when line was added (current date/time) - REQUIRED
      var currentDateTime = new Date();
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_date_time',
        value: currentDateTime
      });
      
      // Commit the line
      log.debug('Time Tracker - Committing Line', 'About to commit line');
      timeTrackerRecord.commitLine({
        sublistId: 'line'
      });
      
      // Save the record
      log.debug('Time Tracker - Saving Record', 'About to save time tracker record');
      var recordId = timeTrackerRecord.save();
      
      log.audit('Time Tracker', 'Added line to time tracker record: ' + recordId + 
                ' for customer: ' + options.customerId + 
                ', action: ' + options.actionId + 
                ', time saved: ' + options.timeSaved + ' seconds');
      
      log.debug('Time Tracker - Complete', 'Successfully added and saved line. Record ID: ' + recordId);
      
      return recordId;
    } catch (e) {
      log.error('Time Tracker Error', 'Failed to add time tracker line: ' + e.toString());
      throw e;
    }
  }
  
  return {
    addTimeTrackerLine: addTimeTrackerLine
  };
});

