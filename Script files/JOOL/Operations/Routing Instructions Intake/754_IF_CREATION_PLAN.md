# 754 Line Item Fulfillment Creation Script

## Overview
User Event script that runs on `customtransaction_754` record lines (afterSubmit) to automatically create Item Fulfillments from Sales Orders when pallet counts match. The script calculates total pallets on SOs using location-specific UPP (Units Per Pallet) fields and creates IFs when SO pallets equal the 754 line pallet count.

## Key Requirements

1. **Event**: `afterSubmit` (create only)
2. **Field**: `custcol_quantity_shipping` on 754 line contains pallet count
3. **Sales Order Reference**: `custcol_754_sales_order` on 754 line
4. **UPP Fields**: Location-based (Location 38: `custitemunits_per_pallet`, Location 4: `custitem_units_per_pallet_westmark`)
5. **Initial Logic**: Only create IF when SO total pallets = 754 line pallets (split logic placeholder for future)

## Implementation Details

### File Location
`Script files/JOOL/Operations/Routing Instructions Intake/_dsh_ue_754_create_ifs.js`

### Main Functions

#### 1. `afterSubmit(scriptContext)`
- Process each line on the 754 record
- Get `custcol_quantity_shipping` (pallet count) from line
- Get `custcol_754_sales_order` (SO ID) from line
- Skip if either field is missing
- Load Sales Order record
- Calculate total pallets on SO
- Compare to 754 line pallet count
- Create IF if pallets match

#### 2. `calculateSOTotalPallets(soRecord)`
- Iterate through all SO line items
- For each line:
  - Get item ID and quantity
  - Get location from SO line
  - Determine UPP field based on location (38 or 4)
  - Load item record and get UPP value
  - Calculate pallet fraction: `quantity / UPP`
  - Sum all pallet fractions
- Return total pallets

#### 3. `getUPPForItem(itemId, locationId)`
- Check location ID:
  - Location 38: use `custitemunits_per_pallet`
  - Location 4: use `custitem_units_per_pallet_westmark`
- Load item record
- Return UPP value (or 0 if missing)

#### 4. `checkCommittedQuantities(soId)`
- **Research needed**: How to check which lines are already committed on an IF
- Search for existing IFs created from the SO (`createdfrom` field)
- For each IF, sum quantities by SO line sequence
- Return map of `{lineSequence: committedQty}` or similar structure
- **Note**: This function needs to be researched and implemented based on NetSuite's available fields/methods

#### 5. `createItemFulfillment(soRecord, locationId, lineIndices)`
- Transform SO to IF using `record.transform()`
- Filter lines by location (set `itemreceive` = true for matching location)
- Set `custbody_ship_from_location` field
- Save IF record
- Return IF ID

#### 6. `splitItemsAcrossIFs(soRecord, totalPallets, targetPallets)` - PLACEHOLDER
- **Future implementation**: Logic to split items across multiple IFs when SO pallets > 754 pallets
- Goal: Minimize splitting of items across IFs
- Keep complete items together when possible
- For now: Return empty array or log that split logic is not yet implemented

### Governance Estimate

For 4 Sales Orders per 754 record:
- Load 4 SOs: ~40 units (10 per SO)
- Get UPP for items: ~50-100 units (depends on unique items, ~5-10 per item load)
- Create 4 IFs: ~400-800 units (100-200 per IF transform + save)
- **Total: ~500-1000 units** (well within 10,000 unit User Event limit)

### Code Structure

```javascript
define([
    'N/record',
    'N/log',
    'N/search'
], function(record, log, search) {
    
    function afterSubmit(scriptContext) {
        // Main processing logic
    }
    
    function calculateSOTotalPallets(soRecord) {
        // Calculate total pallets on SO
    }
    
    function getUPPForItem(itemId, locationId) {
        // Get UPP based on location
    }
    
    function checkCommittedQuantities(soId) {
        // Check which SO lines are already fulfilled
    }
    
    function createItemFulfillment(soRecord, locationId, lineIndices) {
        // Create IF from SO
    }
    
    function splitItemsAcrossIFs(soRecord, totalPallets, targetPallets) {
        // Placeholder for future split logic
    }
    
    return {
        afterSubmit: afterSubmit
    };
});
```

### Key Implementation Notes

1. **UPP Field Selection**: Follow pattern from `_dsh_lib_routing_calculator.js` and `_dsh_lib_create_and_link_pallets.js`
2. **IF Creation**: Follow pattern from `autoIF.js` `createItemFulfillment()` function
3. **Location Handling**: Get location from SO line item, not SO header
4. **Error Handling**: Log errors but don't throw (allow 754 record to save)
5. **Committed Quantities**: Research NetSuite methods to check `quantityremaining` on SO lines or search existing IFs

### Research Needed

- **How to check which lines are already committed on an IF**: 
  - Option 1: Use `quantityremaining` field on SO line items
  - Option 2: Search for existing IFs and sum quantities by line sequence
  - Option 3: Use SO line `quantityfulfilled` field if available
  - Need to verify which approach works best in NetSuite

### Testing Considerations

- Test with SOs that have multiple locations
- Test with items missing UPP values
- Test with SOs that already have partial IFs
- Test with SO pallets > 754 pallets (should skip for now)
- Test with SO pallets < 754 pallets (should skip)
- Test with SO pallets = 754 pallets (should create IF)

## Implementation Tasks

1. **Research committed quantities**: Research how to check which SO lines are already committed/fulfilled on existing IFs (quantityremaining field, IF search, or other method)
2. **Create main script**: Create `_dsh_ue_754_create_ifs.js` with afterSubmit function and main processing logic
3. **Implement pallet calculation**: Implement `calculateSOTotalPallets()` function with location-based UPP field selection
4. **Implement UPP getter**: Implement `getUPPForItem()` function following pattern from routing calculator library
5. **Implement committed check**: Implement `checkCommittedQuantities()` function based on research findings
6. **Implement IF creation**: Implement `createItemFulfillment()` function following pattern from autoIF.js
7. **Add split placeholder**: Add `splitItemsAcrossIFs()` placeholder function for future split logic when SO pallets > 754 pallets
8. **Add error handling**: Add comprehensive error handling and logging throughout the script

