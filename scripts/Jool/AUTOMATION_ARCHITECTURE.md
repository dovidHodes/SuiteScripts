# Automation Architecture Pattern

## Standard Pattern: SCH → MR → Library

**All scheduled automation scripts follow this pattern:**

```
Automated Path              Suitelet Path                 Button UI
┌─────────────┐            ┌─────────────────────┐      ┌─────────────┐
│  Scheduled  │            │Dynamic URL in record│      │ User Event  │
│  Script     │            └─────────────────────┘      │    (UE)     │
│  (SCH)      │                    │                    └──────┬──────┘
└──────┬──────┘                    │                           │
       │ task.create()             │                           │ click
       ↓                           │                           ↓
┌─────────────┐                    │                    ┌─────────────┐
│ Map/Reduce  │             ┌─────────────┐             │   Client    │
│   Script    │             │  Suitelet   │ ←────────── │   Script    │
│    (MR)     │             │    (SL)     │             │    (CL)     │
└──────┬──────┘             └──────┬──────┘             └─────────────┘
       │                           │
       │ direct call               │ direct call
       ↓                           ↓
┌───────────────────────────────────────────┐
│              Library Script               │
│           (Core functionality)            │
└───────────────────────────────────────────┘
```

- **Effective Batching**: SCH batches records before calling MR  
- **Button Support**: Library can be called from Suitelet (button/link)  
- **Deployment Management**: SCH tries multiple MR deployments if one is busy  
- **Code Reusability**: Same library logic for automated + manual triggers  

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

### 4. Suitelet (SL)
- **Purpose**: HTTP endpoint for button/link triggers
- **Key Features**:
  - Validates same criteria as SCH
  - Calls library directly
  - Returns JSON response
  - Can be triggered from link on record (without UE/CL)

### 5. User Event (UE)
- **Purpose**: Adds button/link to form
- **Key Features**:
  - Adds UI element to record form
  - Sets Client Script module path
  - Only needed for button UI (not for direct links)

### 6. Client Script (CL)
- **Purpose**: Handles button click, shows messages
- **Key Features**:
  - Handles button click event
  - Calls Suitelet via HTTP
  - Shows success/error messages
  - Reloads page on success

## Multiple MR Deployments

**Always create multiple MR deployments** and try them all in SCH. If one deployment is busy, try the next one until one succeeds.

## Button/Link Implementation

To add a button/link on IF record:

1. **User Event** - Adds button/link to form
2. **Client Script** - Handles click, calls Suitelet, shows messages
3. **Suitelet** - Validates, calls library, returns JSON

**Alternative**: Suitelet can be triggered directly from a link on the record (without UE/CL), but won't show messages in the UI.

## Examples

### Autopack
- **SCH**: `autopackScheduled.js`
- **MR**: SPS autopack MR (11 deployments)
- **Pre-processing**: Entity filtering, routing checks, date filters

### Batch Print Labels
- **SCH**: `_dsh_sch_batch_print_labels.js`
- **MR**: SPS batch label MR (11 deployments)
- **Pre-processing**: Entity filtering, multi-field validation

## Best Practices

- **Always use SCH → MR → Library pattern** for scheduled automation
- **Create multiple MR deployments** (0-10 or more)
- **Try all deployments** in SCH if one is busy
- **Set workflow flags in SCH** before scheduling MR
- **Set completion flags in MR** after library success
- **Library should NOT set workflow flags** (that's orchestration logic)
- **Suitelet validates same criteria** as SCH before calling library

---

**Last Updated**: 2025-01-XX  
**Maintained By**: Development Team
