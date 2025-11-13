# Time Tracker Usage Pattern

## Overview
This document describes the standard pattern for adding time tracker lines across all projects. **Always use the library function** to ensure consistency and automatic datetime tracking.

## Library Function

**File:** `_dsh_lib_time_tracker.js`  
**Location:** `scripts/Jool/time tracker/`

## Usage in Any Script

### 1. Import the Library

**IMPORTANT:** Use `./_dsh_lib_time_tracker` when the library is uploaded to the same folder in NetSuite's File Cabinet (SuiteScripts folder).

```javascript
define([
  'N/record',
  'N/log',
  './_dsh_lib_time_tracker'  // Same folder pattern - library must be in same File Cabinet folder
], function (record, log, timeTrackerLib) {
  // Your code here
});
```

**Note:** If the library is uploaded as a library script in NetSuite with a script ID, you may need to use the script ID instead (e.g., `'customscript_dsh_lib_time_tracker'`). The `./` pattern works when both files are in the same SuiteScripts folder structure.

### 2. Call the Function When Adding Lines

```javascript
// After successfully completing an action that should be tracked
try {
  var customerId = record.getValue('entity'); // or wherever customer ID comes from
  if (customerId) {
    timeTrackerLib.addTimeTrackerLine({
      actionId: 6,        // Action ID (see TIME_TRACKER_IMPLEMENTATION.md)
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

## Key Points

1. **Always use the library function** - Don't duplicate the logic
2. **Datetime is automatic** - The library automatically sets `custcol_date_time` to current date/time
3. **Error handling** - Wrap in try/catch so time tracker failures don't break main functionality
4. **Customer ID required** - Only add lines when customer ID is available

## Action IDs

See `TIME_TRACKER_IMPLEMENTATION.md` for the list of action IDs:
- 1. Approve order
- 2. Create Item fulfillment
- 3. Request Routing
- 4. Populate routing
- 5. Autopack IF
- 6. Create BOL
- 7. Print ASN labels
- 8. Batch & upload labels

## Example: BOL Generation

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

## Future Projects

When creating new projects that need time tracking:

1. **Import the library** using `./_dsh_lib_time_tracker` (same folder pattern - library must be in same File Cabinet folder in NetSuite)
2. **Call `addTimeTrackerLine()`** after the tracked action completes
3. **Use try/catch** to prevent time tracker errors from breaking main functionality
4. **Include customer ID check** - only track when customer is available

**Import Pattern (Remember):**
- Use `./_dsh_lib_time_tracker` when both scripts are in the same folder in NetSuite's File Cabinet
- This is the standard pattern used in BOL and Approve Order scripts
- If library is uploaded as a script with a script ID, you may need to use the script ID instead

## Benefits of Using Library

- ✅ Automatic datetime tracking (`custcol_date_time`)
- ✅ Consistent implementation across all projects
- ✅ Single source of truth for time tracker logic
- ✅ Easy to update - change once, applies everywhere
- ✅ Proper error handling built-in

