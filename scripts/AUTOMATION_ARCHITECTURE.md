# Automation Architecture Patterns

## Overview

All scheduled automation scripts in this codebase follow one of two architectural patterns to ensure flexibility and reusability:

1. **⭐ Library → MR Pattern** (Preferred): Library code called by MR (so code can be called from buttons or other triggers)
2. **SCH → MR Pattern**: Scheduled Script calls Map/Reduce (for complex pre-processing or deployment management)

### Quick Answer: Which is Better?

**Library → MR is generally better** when both patterns achieve reusability because:
- Simpler (2 components vs 3)
- More reusable (library callable from anywhere)
- Easier to maintain and test

**Use SCH → MR only when you need** complex pre-processing, multiple deployments, or advanced batching.

## Pattern 1: SCH → MR (Scheduled Script Calls Map/Reduce)

### When to Use
- Need complex pre-processing before MR execution
- Want to support both automated (SCH) and manual (button/Suitelet) triggers
- Need deployment management (multiple MR deployments)
- Require field validation, entity filtering, or batching logic

### How It Works
1. **Scheduled Script** runs on timer
2. SCH script performs pre-processing:
   - Entity filtering
   - Field validation
   - Duplicate prevention
   - Batching logic
   - Deployment management
3. SCH script uses `task.create()` to schedule MR tasks
4. MR script processes records passed via parameters

### Examples in Codebase

#### Example 1: Autopack (`autopackScheduled.js` → SPS MR)
- **SCH Script**: `Jool/Auto Pack IFs/autopackScheduled.js`
- **MR Script**: SPS autopack MR (`customscript_sps_mr_auto_pack_2x`)
- **Pre-processing**:
  - Filters entities with `custentity_auto_create_packages = true`
  - Validates `custbody_requested_autopack = false`
  - Applies date filter (after Nov 1, 2025)
  - Prevents duplicates with field checks
  - Manages 11 MR deployments with fallback logic
- **Can also be triggered by**: User Event, Suitelet, or RESTlet

#### Example 2: Batch Print Labels (`_dsh_sch_batch_print_labels.js` → SPS MR)
- **SCH Script**: `Jool/Batch print labels/_dsh_sch_batch_print_labels.js`
- **MR Script**: SPS batch label MR (`customscript_sps_mr_batch_label`)
- **Pre-processing**:
  - Filters entities with `custentity_auto_batch_print = true`
  - Validates multiple fields (`custbody_requested_batch_print`, `custbody_sps_batched_print_com`, `custbody_routing_status`)
  - Prevents duplicate processing
  - Manages 11 MR deployments

#### Example 3: Batch and Attach (`_dsh_sch_batch_and_attach.js` → MR)
- **SCH Script**: `Jool/Batch print labels/batch the batch and attach/_dsh_sch_batch_and_attach.js`
- **MR Script**: `customscript_dsh_mr_merge_labels`
- **Also triggered by**: User Event (`_dsh_ue_if_merge_labels.js`) when checkbox is checked
- **Flexibility**: Same MR can be called from SCH (automated) or UE (manual/event-driven)

### Benefits
✅ **Flexible Triggering**: MR can be called from:
   - Scheduled Script (automated)
   - User Event (record changes)
   - Suitelet (button clicks)
   - RESTlet (external systems)
   - Workflow Actions

✅ **Complex Pre-processing**: SCH handles:
   - Entity relationship checks
   - Multi-field validation
   - Date filtering
   - Batching logic
   - Deployment management

✅ **Parameter Passing**: MR receives specific record IDs via JSON parameters

## Pattern 2: Library → MR (Library Code Called by MR)

### When to Use
- Simple, self-contained processing logic
- Need to reuse same code from multiple places
- Want button/Suitelet to call same logic as MR
- MR can handle its own record discovery

### How It Works
1. **Library Script** contains the core business logic
2. **Map/Reduce Script** runs on timer
3. MR's `getInputData()` searches for records to process
4. MR's `reduce()` calls library functions
5. **Suitelet/Button** can also call library functions directly

### Examples in Codebase

#### Example 1: BOL Generation (`_dsh_lib_bol_generator.js` ← MR)
- **Library**: `Jool/BOL/_dsh_lib_bol_generator.js`
- **MR Script**: `Jool/BOL/_dsh_mr_generate_and_attach_bols.js`
- **Suitelet**: `Jool/BOL/_dsh_sl_single_bol_generate.js` (button trigger)
- **How it works**:
  - MR runs on schedule, searches for IFs needing BOLs
  - MR calls `bolLib.generateAndAttachBOL(ifId, ...)`
  - Suitelet (button) also calls `bolLib.generateAndAttachBOL(ifId, ...)`
  - Same code, different triggers

#### Example 2: Routing Calculator (`_dsh_lib_routing_calculator.js` ← MR)
- **Library**: `Jool/Calculate and set routing/_dsh_lib_routing_calculator.js`
- **MR Script**: `Jool/Calculate and set routing/_dsh_sl_calculate_routing.js` (Suitelet, but could be MR)
- **User Event**: `Jool/Calculate and set routing/UE/setAVCroutingIF_UE.js`
- **How it works**:
  - Library contains routing calculation logic
  - Can be called from MR, Suitelet, or User Event
  - Same logic, multiple entry points

### Benefits
✅ **Code Reusability**: Same library functions used by:
   - Map/Reduce (automated bulk processing)
   - Suitelet (button-triggered single record)
   - User Event (record change-triggered)
   - RESTlet (external API calls)

✅ **Simpler Architecture**: MR handles its own record discovery

✅ **Consistent Logic**: Same business rules applied regardless of trigger

## Comparison Table

| Aspect | SCH → MR Pattern | Library → MR Pattern |
|--------|------------------|---------------------|
| **Pre-processing** | Extensive (in SCH) | Minimal (in MR getInputData) |
| **Button Trigger** | ✅ Yes (can call MR) | ✅ Yes (calls library) |
| **Deployment Management** | ✅ Multiple deployments | ❌ Single deployment |
| **Field Validation** | ✅ Advanced (in SCH) | ⚠️ Basic (in MR map) |
| **Batching Logic** | ✅ Yes (in SCH) | ⚠️ Limited (MR handles) |
| **Code Reusability** | ⚠️ MR-specific | ✅ High (library) |
| **Complexity** | Higher | Lower |
| **Best For** | Complex workflows, SPS integrations | Simple processing, reusable logic |

## Decision Guide

### ⭐ Default: Choose Library → MR
**Prefer this pattern unless you have specific needs for SCH → MR**

**Why Library → MR is generally better:**
- ✅ **Simpler architecture** (2 components vs 3)
- ✅ **Maximum code reusability** (library callable from anywhere)
- ✅ **Easier to maintain** (less moving parts)
- ✅ **Better separation of concerns** (business logic in library, orchestration in MR)
- ✅ **Easier testing** (test library independently)

### Choose SCH → MR when you specifically need:
- ✅ Complex pre-processing (entity filtering, multi-field validation, date logic)
- ✅ Managing multiple MR deployments with fallback logic
- ✅ Advanced batching or queue management before MR
- ✅ Parameterized MR calls with different data sets
- ✅ Working with SPS or external integrations requiring deployment management

### Choose Library → MR when:
- ✅ Simple, self-contained processing
- ✅ Want maximum code reusability
- ✅ Need button/Suitelet to call same logic
- ✅ MR can handle its own record discovery
- ✅ Prefer simpler architecture (default choice)

## Current Implementation Status

### SCH → MR Pattern
- ✅ `Jool/Auto Pack IFs/autopackScheduled.js` → SPS MR
- ✅ `Jool/Batch print labels/_dsh_sch_batch_print_labels.js` → SPS MR
- ✅ `Jool/Batch print labels/batch the batch and attach/_dsh_sch_batch_and_attach.js` → MR
- ✅ `Jool/SPS Scripts/Autopack/sps_rest_manual_pack.js` → SPS MR (RESTlet)

### Library → MR Pattern
- ✅ `Jool/BOL/_dsh_lib_bol_generator.js` ← MR + Suitelet
- ✅ `Jool/Calculate and set routing/_dsh_lib_routing_calculator.js` ← MR + Suitelet + UE
- ✅ `Jool/Add Packages to IF/_dsh_mr_add_packages.js` (could be refactored to use library)

## Best Practices

1. **Always use one of these two patterns** for scheduled automation
2. **Document which pattern** each script follows
3. **For SCH → MR**: Keep pre-processing logic in SCH, keep processing logic in MR
4. **For Library → MR**: Keep business logic in library, keep orchestration in MR
5. **Enable flexible triggering** - design MRs to accept parameters, design libraries to be callable from anywhere

## Migration Notes

If you have an MR that runs on timer but want button support:
- **Option 1**: Refactor to SCH → MR pattern (add SCH that calls MR)
- **Option 2**: Extract logic to library, have MR call library, add Suitelet that also calls library

---

**Last Updated**: 2025-01-XX  
**Maintained By**: Development Team

