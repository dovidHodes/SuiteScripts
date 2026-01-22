# Pallet Assignment

## Overview

This project calculates optimal pallet assignments for SPS packages based on Item Fulfillment data and creates pallet records. It uses a two-phase approach:

1. **Phase 1 (Library + Suitelet)**: Calculate pallets and create pallet records
2. **Phase 2 (Map/Reduce)**: Update packages and package content with pallet IDs (placeholder for now)

## Architecture

### Phase 1: Calculation and Pallet Creation
- **Library Script**: `_dsh_lib_create_and_link_pallets.js`
  - Gets IF location
  - Loads item records and gets UPP (units per pallet) based on location
  - Searches SPS packages and package content
  - Calculates optimal pallet assignments (minimize pallets, items can share)
  - Creates pallet records
  - Returns assignment data for Map/Reduce

- **Suitelet**: `_dsh_sl_assign_pallets.js`
  - Takes IF ID as parameter (`ifid`)
  - Calls library function
  - Returns JSON result

### Phase 2: Package Updates (Future)
- **Map/Reduce Script**: (To be created)
  - Receives pallet assignments from Phase 1
  - Updates packages with pallet IDs
  - Updates package content records with pallet IDs

## Setup

### 1. Customize Configuration

Edit `_dsh_lib_create_and_link_pallets.js`:

```javascript
var PALLET_RECORD_TYPE = 'customrecord_pallet'; // Your pallet record type
var PALLET_IF_FIELD = 'custrecord_parent_if'; // Field on pallet to link to IF
```

### 2. Required Custom Fields

**On `customrecord_pallet`:**
- `name` (standard field)
- `custrecord_parent_if` (List/Record → Item Fulfillment)

**On `customrecord_sps_package`:**
- `custrecord_sps_package_qty` (Number) - Quantity in package
- `custrecord_sps_package_pallet` (List/Record → Pallet) - For Phase 2

**On `customrecord_sps_content`:**
- `custrecord_sps_content_item` (List/Record → Item)
- `custrecord_sps_content_pallet` (List/Record → Pallet) - For Phase 2

**On Item Fulfillment:**
- `custbody_ship_from_location` (List/Record → Location)

**On Inventory Item:**
- `custitemunits_per_pallet` (Number) - For location 38
- `custitem_units_per_pallet_westmark` (Number) - For location 4

## Usage

### Call Suitelet

```
GET /app/site/hosting/scriptlet.nl?script=customscript_dsh_sl_assign_pallets&deploy=customdeploy_dsh_sl_assign_pallets&ifid=123
```

### Response Format

```json
{
  "success": true,
  "ifId": "123",
  "palletsCreated": 5,
  "palletAssignments": [
    {
      "palletId": "456",
      "packageIds": ["p1", "p2", "p3"],
      "contentIds": ["c1", "c2", "c3"]
    }
  ],
  "itemSummary": {
    "item1": {
      "totalQty": 120,
      "totalCartons": 20,
      "upp": 100,
      "cartonsPerPallet": 5
    }
  },
  "errors": [],
  "warnings": []
}
```

## How It Works

### 1. Get Item UPP Values
- Loads IF and gets `custbody_ship_from_location`
- For each item on IF:
  - Loads item record
  - Gets UPP based on location:
    - Location 38: `custitemunits_per_pallet`
    - Location 4: `custitem_units_per_pallet_westmark`

### 2. Get Package Data
- Searches all SPS packages for IF
- For each package:
  - Gets package ID and `custrecord_sps_package_qty`
  - Gets first package content record
  - Gets item ID from package content

### 3. Calculate Optimal Pallets
- Groups packages by item
- Calculates cartons per pallet for each item (UPP ÷ carton qty)
- Assigns packages to pallets:
  - Items can share pallets
  - Can't break cartons
  - Minimizes total pallets
  - Fills existing pallets before creating new ones

### 4. Create Pallet Records
- Creates pallet records
- Sets `custrecord_parent_if` to IF ID
- Assigns packages to pallets

### 5. Logging
- Logs each pallet with:
  - Items on pallet
  - Quantities per item
  - Cartons per item
- Logs totals:
  - Total pallets
  - Total packages
  - Item summaries

## Governance

### Phase 1 (Library + Suitelet)
- Search packages: ~200 units
- Get package content: ~200-400 units
- Load items for UPP: ~100 units
- Create pallets: ~800 units (80 pallets × 10)
- **Total: ~1,200-1,500 units** (within Suitelet 5,000 limit)

### Phase 2 (Map/Reduce - Future)
- Update packages: ~5 units each
- Update package content: ~5 units each
- Per batch (200 packages): ~2,000 units (within 10,000 limit)

## Next Steps

1. **Create Map/Reduce Script** for Phase 2:
   - Takes pallet assignments from Phase 1
   - Updates packages with pallet IDs
   - Updates package content with pallet IDs

2. **Integration**:
   - Add button to IF record
   - Or scheduled script to process multiple IFs
   - Or User Event to auto-assign on IF save

## Troubleshooting

### "No ship from location found"
- Ensure `custbody_ship_from_location` is set on IF

### "No UPP for item"
- Check item has UPP field set for the location
- Location 38: `custitemunits_per_pallet`
- Location 4: `custitem_units_per_pallet_westmark`

### "Invalid carton qty"
- Ensure `custrecord_sps_package_qty` is set on packages
- Must be > 0

### "No packages found"
- Verify packages exist for IF
- Check `custrecord_sps_pack_asn` field on packages

