# Pallet Assignment Library Script

## Overview

This library script assigns pallets to SPS packages and their package content child records for a given Item Fulfillment. It handles the complete workflow in a single function call, with built-in governance monitoring and batching for large volumes.

## Architecture Decision: Single Library Script

**Why one library script instead of multiple steps?**

1. **Simplicity**: Single function call handles everything
2. **Atomicity**: All updates happen in one execution, reducing partial completion issues
3. **Consistency**: Matches existing patterns in codebase (e.g., `_dsh_lib_bol_generator.js`)
4. **Governance**: Built-in monitoring and batching handles hundreds of packages
5. **Maintainability**: All logic in one place, easier to debug and update

**When to use Map/Reduce instead:**

- If you regularly have **thousands** of packages per IF
- If governance limits are consistently hit
- If you need to process multiple IFs in parallel

For most use cases (hundreds of packages), the library script is sufficient and simpler.

## Setup

### 1. Customize Configuration

Edit `_dsh_lib_assign_pallets.js` and update these constants at the top:

```javascript
// Pallet custom record type
var PALLET_RECORD_TYPE = 'customrecord_pallet'; // Change to your record type

// Field on SPS Package that stores pallet ID
var PACKAGE_PALLET_FIELD = 'custrecord_sps_package_pallet'; // Change to your field ID

// Field on SPS Package Content that stores pallet ID
var PACKAGE_CONTENT_PALLET_FIELD = 'custrecord_sps_content_pallet'; // Change to your field ID

// Optional: Field on pallet record that links to IF
var PALLET_IF_FIELD = 'custrecord_pallet_if'; // Change or set to null if not needed

// Average packages per pallet
var PACKAGES_PER_PALLET = 20; // Adjust as needed
```

### 2. Create Required Custom Fields

**On `customrecord_sps_package`:**
- Add field: `custrecord_sps_package_pallet` (List/Record → `customrecord_pallet`)

**On `customrecord_sps_content`:**
- Add field: `custrecord_sps_content_pallet` (List/Record → `customrecord_pallet`)

**On `customrecord_pallet` (or your pallet record type):**
- Standard `name` field (auto-set)
- Optional: `custrecord_pallet_if` (List/Record → Item Fulfillment) to link back to IF

## Usage

### From a Suitelet

```javascript
define([
  './_dsh_lib_assign_pallets'
], function (palletLib) {
  
  function onRequest(context) {
    var ifId = context.request.parameters.ifid;
    
    if (!ifId) {
      context.response.write('Item Fulfillment ID required');
      return;
    }
    
    var result = palletLib.assignPalletsToPackages(ifId);
    
    if (result.success) {
      context.response.write(JSON.stringify({
        success: true,
        message: 'Assigned ' + result.palletsCreated + ' pallet(s) to ' + 
                 result.packagesProcessed + ' package(s)',
        stats: result
      }));
    } else {
      context.response.write(JSON.stringify({
        success: false,
        errors: result.errors
      }));
    }
  }
  
  return { onRequest: onRequest };
});
```

### From a User Event Script

```javascript
define([
  './_dsh_lib_assign_pallets'
], function (palletLib) {
  
  function afterSubmit(context) {
    if (context.type === context.UserEventType.CREATE || 
        context.type === context.UserEventType.EDIT) {
      
      var ifId = context.newRecord.id;
      
      // Only run if a specific condition is met (e.g., custom field)
      var shouldAssignPallets = context.newRecord.getValue('custbody_assign_pallets');
      
      if (shouldAssignPallets) {
        var result = palletLib.assignPalletsToPackages(ifId);
        
        if (!result.success) {
          log.error('Pallet Assignment Failed', result.errors);
        }
      }
    }
  }
  
  return { afterSubmit: afterSubmit };
});
```

### From a Scheduled Script

```javascript
define([
  './_dsh_lib_assign_pallets',
  'N/search'
], function (palletLib, search) {
  
  function execute(context) {
    // Search for IFs that need pallet assignment
    var ifSearch = search.create({
      type: 'itemfulfillment',
      filters: [
        ['custbody_assign_pallets', 'is', 'T'],
        'AND',
        ['custbody_pallets_assigned', 'is', 'F']
      ],
      columns: ['internalid']
    });
    
    var processed = 0;
    var errors = 0;
    
    ifSearch.run().each(function (result) {
      var ifId = result.id;
      
      try {
        var result = palletLib.assignPalletsToPackages(ifId);
        
        if (result.success) {
          // Mark as processed
          record.submitFields({
            type: 'itemfulfillment',
            id: ifId,
            values: {
              custbody_pallets_assigned: true
            }
          });
          processed++;
        } else {
          errors++;
          log.error('Pallet Assignment Failed', 'IF: ' + ifId + ', Errors: ' + result.errors);
        }
      } catch (error) {
        errors++;
        log.error('Pallet Assignment Exception', 'IF: ' + ifId + ', Error: ' + error);
      }
      
      return true; // Continue processing
    });
    
    log.audit('Scheduled Script Complete', 
      'Processed: ' + processed + ', Errors: ' + errors);
  }
  
  return { execute: execute };
});
```

### From a Map/Reduce Script (for very large volumes)

If you need to process multiple IFs with hundreds of packages each, you can use Map/Reduce:

```javascript
define([
  './_dsh_lib_assign_pallets'
], function (palletLib) {
  
  function getInputData(inputContext) {
    // Return array of IF IDs to process
    var ifIds = ['123', '456', '789']; // Your IF IDs
    return ifIds;
  }
  
  function map(mapContext) {
    var ifId = mapContext.value;
    mapContext.write(ifId, ifId);
  }
  
  function reduce(reduceContext) {
    var ifId = reduceContext.key;
    
    try {
      var result = palletLib.assignPalletsToPackages(ifId);
      
      if (!result.success) {
        log.error('Pallet Assignment Failed', 'IF: ' + ifId + ', Errors: ' + result.errors);
      }
    } catch (error) {
      log.error('Pallet Assignment Exception', 'IF: ' + ifId + ', Error: ' + error);
    }
  }
  
  return {
    getInputData: getInputData,
    map: map,
    reduce: reduce
  };
});
```

## How It Works

1. **Search Packages**: Finds all SPS packages related to the IF using `custrecord_sps_pack_asn`
2. **Count Items**: For each package, counts package content records
3. **Calculate Pallets**: Determines number of pallets needed (packages / packagesPerPallet)
4. **Create Pallets**: Creates pallet records, optionally linking to IF
5. **Assign Packages**: Distributes packages evenly across pallets using `submitFields` for efficiency
6. **Update Package Content**: For each package, finds all package content records and assigns the same pallet ID

## Governance & Performance

- **Governance Monitoring**: Checks remaining usage before major operations
- **Batching**: Updates packages in batches with periodic governance checks
- **Error Handling**: Continues processing even if individual records fail
- **Efficient Updates**: Uses `submitFields` instead of `load/save` for better performance

### Expected Governance Usage

For 200 packages with ~5 items each:
- Package search: ~100 units
- Pallet creation (10 pallets): ~200 units
- Package updates (200): ~2000 units
- Package content updates (1000): ~5000 units
- **Total: ~7,300 units** (well within typical limits)

## Return Value

The function returns an object:

```javascript
{
  success: true/false,
  ifId: "123",
  packagesProcessed: 200,
  palletsCreated: 10,
  packageContentRecordsUpdated: 1000,
  errors: [],
  warnings: []
}
```

## Troubleshooting

### "No SPS packages found"
- Verify the IF has SPS packages
- Check that `custrecord_sps_pack_asn` field is set correctly on packages

### "Failed to create pallet records"
- Verify `PALLET_RECORD_TYPE` is correct
- Check that pallet record type exists and is accessible
- Ensure required fields on pallet record are set

### "Governance limits exceeded"
- Reduce `PACKAGES_PER_PALLET` to create fewer pallets
- Use Map/Reduce for very large volumes
- Process in smaller batches

### "Field not found" errors
- Verify all custom field IDs are correct
- Ensure fields exist and are accessible
- Check field types match (List/Record for pallet fields)

## Alternative Approach: Two-Step Process

If you prefer a two-step approach:

1. **Step 1**: Create pallets and assign to packages
2. **Step 2**: Scheduled script on pallets that searches related packages and updates package content

This is more complex and less atomic, but can be useful if:
- You want to separate pallet creation from content updates
- You need to review pallet assignments before updating content
- You have very strict governance requirements

The single library script approach is recommended for most use cases.

