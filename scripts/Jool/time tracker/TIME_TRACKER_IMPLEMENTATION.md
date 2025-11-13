# Time Tracker Custom Transaction Implementation Guide

## Overview
This document outlines the requirements for implementing time tracking functionality in SuiteScripts. When certain tasks are executed, lines should be added to a custom transaction to track time saved.

## Custom Transaction Details

### Transaction Type
- **Type:** `customtransaction_time_tracker`
- **Internal ID:** `15829943`

## Required Fields for Each Line Item

When adding a line to the custom transaction, the following fields must be populated:

| Field | Value/Type | Description |
|-------|-----------|-------------|
| `account` | `619` | Account ID (fixed value) |
| `amount` | `0` | Amount (fixed value) |
| `custcol_action` | Internal ID (varies) | Action being performed (see Action List below) |
| `custcol_trading_partner` | Internal ID | Customer ID for whom the action is being run |
| `custcol_employee` | `5` | Employee who saved time (currently hardcoded to internal ID 5) |
| `custcol_time_saved` | Integer (seconds) | Time saved in seconds, passed as integer |

## Action List (custcol_action Values)

Based on the workflow, the following actions need to be tracked. Each action has its own internal ID that should be used for the `custcol_action` field:

1. **Approve order**
2. **Create Item fulfillment**
3. **Request Routing**
4. **Populate routing**
5. **Autopack IF**
6. **Create BOL**
7. **Print ASN labels**
8. **Batch & upload labels**

> **Note:** The internal IDs for each action need to be determined from the NetSuite custom field setup. These IDs will vary based on your NetSuite configuration.

## Implementation Notes

### When to Add Lines
- Add a line to the custom transaction each time one of the tracked tasks/actions is executed
- The line should be added immediately after the action completes successfully

### Data Requirements
- **custcol_trading_partner:** Must be the internal ID of the customer record for whom the action is being performed
- **custcol_time_saved:** Should be calculated or passed as the number of seconds saved by automating this action
- **custcol_employee:** Currently hardcoded to internal ID `5`, but may need to be dynamic in the future

### Example Implementation Pattern

```javascript
/**
 * Function to add a time tracking line to the custom transaction
 * @param {Object} options
 * @param {number} options.actionId - Internal ID of the action (custcol_action)
 * @param {number} options.customerId - Internal ID of the customer (custcol_trading_partner)
 * @param {number} options.timeSaved - Time saved in seconds (custcol_time_saved)
 * @param {number} [options.employeeId=5] - Employee ID (custcol_employee), defaults to 5
 */
function addTimeTrackerLine(options) {
    try {
        var timeTrackerRecord = record.load({
            type: 'customtransaction_time_tracker',
            id: 15829943,
            isDynamic: true
        });
        
        var lineId = timeTrackerRecord.appendLine({
            sublistId: 'line'
        });
        
        timeTrackerRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'account',
            line: lineId,
            value: 619
        });
        
        timeTrackerRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'amount',
            line: lineId,
            value: 0
        });
        
        timeTrackerRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_action',
            line: lineId,
            value: options.actionId
        });
        
        timeTrackerRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_trading_partner',
            line: lineId,
            value: options.customerId
        });
        
        timeTrackerRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_employee',
            line: lineId,
            value: options.employeeId || 5
        });
        
        timeTrackerRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_time_saved',
            line: lineId,
            value: options.timeSaved
        });
        
        var recordId = timeTrackerRecord.save();
        log.debug('Time Tracker', 'Added line to time tracker record: ' + recordId);
        
        return recordId;
    } catch (e) {
        log.error('Time Tracker Error', 'Failed to add time tracker line: ' + e.toString());
        throw e;
    }
}
```

## User Event Script

A User Event script (`_dsh_ue_time_tracker_amount.js`) has been created to automatically set the amount field to 0 on all lines. This is necessary because:

- The amount field is required and cannot be set to 0 during initial line creation via script
- Scripts set the amount to 0.01 initially to bypass validation
- The UE script runs on `beforeSubmit` and `afterSubmit` to change any 0.01 values to 0

### Deployment Instructions

1. Go to **Customization > Scripting > Scripts > New**
2. Upload the file `_dsh_ue_time_tracker_amount.js`
3. Set the script type to **User Event Script**
4. Create a deployment:
   - **Applies To:** `customtransaction_time_tracker`
   - **Status:** Released
   - **Log Level:** Debug (for testing) or Error (for production)
   - **Execute As:** Administrator
5. Save and activate the deployment

## Next Steps

1. **Deploy UE Script:** Deploy the User Event script to automatically set amounts to 0
2. **Determine Action Internal IDs:** Map each action name to its corresponding internal ID in NetSuite
3. **Identify Integration Points:** Determine which scripts need to be modified to include time tracking
4. **Calculate Time Saved:** Establish methodology for calculating or determining time saved for each action
5. **Testing:** Test the implementation to ensure lines are being added correctly
6. **Error Handling:** Implement proper error handling so that time tracking failures don't break main functionality

## Files to Update

The following scripts may need to be updated to include time tracking:
- Scripts that handle order approval
- Scripts that create item fulfillments
- Scripts that handle routing requests
- Scripts that populate routing
- Autopack IF scripts
- BOL creation scripts
- ASN label printing scripts
- Label batching and upload scripts

