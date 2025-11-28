# Automation Architecture Pattern

## Standard Pattern: SCH → MR → Library

**All scheduled automation scripts follow this pattern:**

```
Automated Path (Scheduled):
┌─────────────┐
│  Scheduled  │  Finds records, validates, batches
│  Script     │  Tries multiple MR deployments
└──────┬──────┘
       │ task.create()
       ↓
┌─────────────┐
│ Map/Reduce  │  Receives IF IDs, orchestrates
│   Script    │  Calls library for each record
└──────┬──────┘
       │ direct call
       ↓
┌─────────────┐
│   Library   │  Core business logic
│   Script    │  Reusable from anywhere
└─────────────┘

Manual Path (Button/Trigger):
┌─────────────┐
│ User Event  │  Adds button to IF form
│  + Button   │
└──────┬──────┘
       │ click
       ↓
┌─────────────┐
│   Client    │  Handles click, calls Suitelet
│   Script    │  Shows success/error messages
└──────┬──────┘
       │ HTTP request
       ↓
┌─────────────┐
│  Suitelet   │  Validates criteria, calls library
│   (SL)      │  Returns JSON response
└──────┬──────┘
       │ direct call
       ↓
┌─────────────┐
│   Library   │  Same core business logic
│   Script    │  (shared with automated path)
└─────────────┘
```

### Why This Pattern?

✅ **Effective Batching**: SCH batches records before calling MR  
✅ **Button Support**: Library can be called from Suitelet (button/link)  
✅ **Deployment Management**: SCH tries multiple MR deployments if one is busy  
✅ **Code Reusability**: Same library logic for automated + manual triggers  

## Components

### 1. Scheduled Script (SCH)
- **Purpose**: Find records, validate, batch, schedule MR
- **Key Features**:
  - Entity filtering
  - Field validation
  - Duplicate prevention
  - Batching logic
  - **Multiple MR deployment management** (tries all if one is busy)
- **Sets workflow flags** before scheduling MR

### 2. Map/Reduce Script (MR)
- **Purpose**: Orchestrate bulk processing
- **Key Features**:
  - Receives record IDs from SCH via parameters
  - Calls library function for each record
  - Sets completion flags after success
  - Resets flags on failure (for retry)

### 3. Library Script
- **Purpose**: Core business logic
- **Key Features**:
  - Reusable from MR, Suitelet, User Event, RESTlet
  - Contains all processing logic
  - Returns success/error status

### 4. Suitelet (Optional - for buttons)
- **Purpose**: HTTP endpoint for button/link triggers
- **Key Features**:
  - Validates same criteria as SCH
  - Calls library directly
  - Returns JSON response
  - Used with User Event + Client Script for UI

## Multiple MR Deployments

**Always create multiple MR deployments** and try them all in SCH:

```javascript
var mrDeployIds = [
  'customdeploy_mr_script_0',
  'customdeploy_mr_script_1',
  'customdeploy_mr_script_2',
  // ... more deployments
];

// Try each deployment until one succeeds
for (var d = 0; d < mrDeployIds.length && taskId === null; d++) {
  try {
    var mrTask = task.create({
      taskType: task.TaskType.MAP_REDUCE,
      scriptId: mrScriptId,
      deploymentId: mrDeployIds[d],
      params: {...}
    });
    taskId = mrTask.submit();
    break; // Success
  } catch (e) {
    if (e.name === 'MAP_REDUCE_ALREADY_RUNNING') {
      continue; // Try next deployment
    }
  }
}
```

## Button/Link Implementation

To add a button/link on IF record:

1. **User Event** - Adds button/link to form
2. **Client Script** - Handles click, calls Suitelet, shows messages
3. **Suitelet** - Validates, calls library, returns JSON

**Note**: You need User Event to add UI element. Client Script alone cannot add buttons/links to forms.

## Examples

### Integrated Shipping Labels
- **SCH**: `_dsh_sch_integrated_shipping_labels.js`
- **MR**: `_dsh_mr_integrated_shipping_labels.js`
- **Library**: `_dsh_lib_integrated_shipping_labels.js`
- **Suitelet**: `_dsh_sl_integrated_shipping_labels.js` (button trigger)

### Autopack
- **SCH**: `autopackScheduled.js`
- **MR**: SPS autopack MR (11 deployments)
- **Pre-processing**: Entity filtering, routing checks, date filters

### Batch Print Labels
- **SCH**: `_dsh_sch_batch_print_labels.js`
- **MR**: SPS batch label MR (11 deployments)
- **Pre-processing**: Entity filtering, multi-field validation

## Best Practices

1. **Always use SCH → MR → Library pattern** for scheduled automation
2. **Create multiple MR deployments** (0-10 or more)
3. **Try all deployments** in SCH if one is busy
4. **Set workflow flags in SCH** before scheduling MR
5. **Set completion flags in MR** after library success
6. **Library should NOT set workflow flags** (that's orchestration logic)
7. **Suitelet validates same criteria** as SCH before calling library

---

**Last Updated**: 2025-01-XX  
**Maintained By**: Development Team
