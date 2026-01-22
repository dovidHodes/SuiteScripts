# Time Tracker Implementation Guide

## Overview
This document outlines the requirements and usage patterns for implementing time tracking functionality in SuiteScripts. When certain tasks are executed, lines should be added to a custom transaction to track time saved.

## Custom Transaction Details

### Transaction Type
- **Type:** `customtransaction_time_tracker`
- **Internal ID:** `15829943`

## Required Fields for Each Line Item

When adding a line to the custom transaction, the following fields must be populated:

| Field | Value/Type | Description |
|-------|-----------|-------------|
| `account` | `621` | Account ID (fixed value) |
| `amount` | `0` | Amount (fixed value, set to 0.01 initially, then changed to 0 by User Event script) |
| `custcol_action` | Internal ID (varies) | Action being performed (see Action List below) |
| `custcol_trading_partner` | Internal ID | Customer ID for whom the action is being run |
| `custcol_employee` | `5` | Employee who saved time (currently hardcoded to internal ID 5) |
| `custcol_time_saved` | Integer (seconds) | Time saved in seconds, passed as integer |
| `custcol_date_time` | Date/Time | **REQUIRED** - Current date/time when line is added (use `new Date()`) |

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

## Usage Pattern: Always Use the Library Function

**For all new projects, use the library function** located at:
- Local file path: `scripts/Jool/time tracker/_dsh_lib_time_tracker.js`

The library automatically handles datetime tracking (`custcol_date_time`) and provides consistent implementation across all projects.

### Import the Library

**CRITICAL - PATH REQUIREMENT:**

**ALL scripts are uploaded to the SAME SuiteScripts folder in NetSuite's File Cabinet, regardless of local file structure.**

- **Local file structure:** Scripts may be organized in subfolders (e.g., `scripts/Jool/Create IFs/`, `scripts/Jool/BOL/`, etc.)
- **NetSuite File Cabinet:** ALL scripts are uploaded to the SAME SuiteScripts folder
- **Import path:** ALWAYS use `'./_dsh_lib_time_tracker'` (same folder reference)

**DO NOT use relative paths based on local file structure** (e.g., `'../time tracker/_dsh_lib_time_tracker'` or `'./time tracker/_dsh_lib_time_tracker'`)

```javascript
define([
  'N/record',
  'N/log',
  './_dsh_lib_time_tracker'  // ALWAYS use this - assumes same SuiteScripts folder in NetSuite
], function (record, log, timeTrackerLib) {
  // Your code here
});
```

**Note:** If the library is uploaded as a library script in NetSuite with a script ID, you may need to use the script ID instead (e.g., `'customscript_dsh_lib_time_tracker'`). However, the standard pattern is `'./_dsh_lib_time_tracker'` when all scripts are in the same SuiteScripts folder.

### Call the Function When Adding Lines

```javascript
// After successfully completing an action that should be tracked
try {
  var customerId = record.getValue('entity'); // or wherever customer ID comes from
  if (customerId) {
    timeTrackerLib.addTimeTrackerLine({
      actionId: 6,        // Action ID (see Action List above)
      customerId: customerId,
      timeSaved: 60,      // Time saved in seconds
      employeeId: 5       // Optional, defaults to 5
    });
  }
} catch (timeTrackerError) {
  // Log error but don't fail the main functionality
  log.error('Time Tracker Error', 'Failed to add time tracker line: ' + timeTrackerError.toString());
}
```

### Example: BOL Generation

```javascript
// After BOL PDF is generated and attached
try {
  var customerId = ifRecord.getValue('entity');
  if (customerId) {
    timeTrackerLib.addTimeTrackerLine({
      actionId: 6, // Create BOL
      customerId: customerId,
      timeSaved: 60, // 60 seconds saved
      employeeId: 5
    });
  }
} catch (timeTrackerError) {
  log.error('Time Tracker Error', 'Failed to add time tracker line: ' + timeTrackerError.toString());
}
```

## Key Points

1. **Always use the library function** - Don't duplicate the logic
2. **Datetime is automatic** - The library automatically sets `custcol_date_time` to current date/time
3. **Error handling** - Wrap in try/catch so time tracker failures don't break main functionality
4. **Customer ID required** - Only add lines when customer ID is available

## Implementation Notes

### When to Add Lines
- Add a line to the custom transaction each time one of the tracked tasks/actions is executed
- The line should be added immediately after the action completes successfully

### Data Requirements
- **custcol_trading_partner:** Must be the internal ID of the customer record for whom the action is being performed
- **custcol_time_saved:** Should be calculated or passed as the number of seconds saved by automating this action
- **custcol_employee:** Currently hardcoded to internal ID `5`, but may need to be dynamic in the future

## Manual Implementation Pattern (Legacy - Not Recommended)

If you cannot use the library function, use this pattern:

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
            value: 621
        });
        
        timeTrackerRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'amount',
            line: lineId,
            value: 0.01 // Will be set to 0 by User Event script
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
        
        // Set datetime when line was added (current date/time) - REQUIRED
        var currentDateTime = new Date();
        timeTrackerRecord.setSublistValue({
            sublistId: 'line',
            fieldId: 'custcol_date_time',
            line: lineId,
            value: currentDateTime
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

## Benefits of Using Library

- ✅ Automatic datetime tracking (`custcol_date_time`)
- ✅ Consistent implementation across all projects
- ✅ Single source of truth for time tracker logic
- ✅ Easy to update - change once, applies everywhere
- ✅ Proper error handling built-in

## Future Projects

When creating new projects that need time tracking:

1. **Import the library** using `'./_dsh_lib_time_tracker'` (ALWAYS use this path - all scripts are in the same SuiteScripts folder in NetSuite)
2. **Call `addTimeTrackerLine()`** after the tracked action completes
3. **Use try/catch** to prevent time tracker errors from breaking main functionality
4. **Include customer ID check** - only track when customer is available

**Import Pattern (CRITICAL - ALWAYS USE THIS):**
- **ALWAYS use:** `'./_dsh_lib_time_tracker'`
- **DO NOT use:** Relative paths based on local file structure (e.g., `'../time tracker/_dsh_lib_time_tracker'`)
- **Reason:** All scripts are uploaded to the SAME SuiteScripts folder in NetSuite's File Cabinet, regardless of local folder organization
- This is the standard pattern used in all scripts (BOL, Approve Order, Create IFs, etc.)
- If library is uploaded as a script with a script ID, you may need to use the script ID instead, but the standard is `'./_dsh_lib_time_tracker'`

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

