# SSCC Generation for Pallet Labels - Integration Guide

## Overview

The pallet label generator now uses the **same SSCC generation logic** as SPS package labels. This ensures consistency across all label types and proper SSCC-18 compliance.

## How It Works

### Function: `generateSSCCForPallet(palletId, ifId, mfgId, offset)`

This function generates an 18-digit SSCC code using the same algorithm as SPS package labels.

**Parameters:**
- `palletId` (required): Pallet record internal ID - used as the base number
- `ifId` (optional): Item Fulfillment ID - used to get customer extension digit
- `mfgId` (optional): Manufacturer ID - will be retrieved if not provided
- `offset` (optional): Offset value - will be retrieved if not provided

**Returns:** 18-digit SSCC string

### Generation Process

1. **Extension Digit**: Retrieved from customer record (`custentity_sps_sscc_ext_digit`) if IF provided, else defaults to `'0'`
2. **Manufacturer ID**: 
   - First checks for customer-specific override (`customrecord_sps_man_id_override`)
   - Falls back to default from `customrecord_sps_label_access` record
3. **Offset**: Static configuration value (does NOT auto-increment)
   - From customer override if exists
   - Otherwise from `customrecord_sps_label_access` → `custrecord_uccuid`
4. **Base Number**: Calculated as `(palletId + offset) % labelLimitModulo`
5. **Check Digit**: Calculated using standard SSCC algorithm
6. **Final SSCC**: 18 digits = Extension Digit + Manufacturer ID + Padded Number + Check Digit

## Example Usage

### Basic Usage (Automatic)
```javascript
// The function is automatically called when generating pallet labels
var result = palletLabelLib.generatePalletLabel(palletId, ifId, pdfFolderId, templateId);
// SSCC is automatically generated and included in the label data
```

### Manual Usage
```javascript
var palletLabelLib = require('./_dsh_lib_pallet_label_generator');

// Generate SSCC for a pallet
var sscc = palletLabelLib.generateSSCCForPallet(
  '12345',  // palletId
  '67890',  // ifId (optional)
  null,     // mfgId (optional, will be retrieved)
  null      // offset (optional, will be retrieved)
);

// Result: "012345670000133457" (18 digits)
```

## Example Calculation

**Input:**
- Pallet ID: `12345`
- IF ID: `67890` (provides customer context)
- Manufacturer ID: `1234567` (retrieved from config)
- Extension Digit: `0` (from customer or default)
- Offset: `1000` (static config value)

**Process:**
1. Base number: `(12345 + 1000) % 1000000000 = 13345`
2. Prefix: `"0" + "1234567" = "01234567"`
3. Pad: `"000013345"` (to reach 17 digits total)
4. Combine: `"01234567000013345"`
5. Check digit: Calculated → `"7"`
6. **Final SSCC**: `"012345670000133457"`

## Integration Points

### 1. `collectPalletData(palletId)`
- Automatically generates SSCC if not stored on pallet record
- Uses `generateSSCCForPallet(palletId, ifId)`

### 2. `collectIFPalletData(ifId, options)`
- Generates SSCC for pallets when creating labels from IF
- Uses `generateSSCCForPallet(palletId, ifId)`

## Benefits

1. **Consistency**: Same SSCC format as package labels
2. **Compliance**: Proper SSCC-18 format with valid check digit
3. **Flexibility**: Supports customer-specific overrides
4. **Reusability**: Can be called independently for any pallet
5. **Fallback**: Gracefully falls back to simple padded ID if generation fails

## Configuration

The function uses the same configuration as SPS package labels:

1. **Default Manufacturer ID**: `customrecord_sps_label_access` (ID: 1) → `custrecord_sps_label_login_mfgid`
2. **Default Offset**: `customrecord_sps_label_access` (ID: 1) → `custrecord_uccuid`
3. **Customer Override**: `customrecord_sps_man_id_override` → `custrecord_sps_man_id_override` and `custrecord_sps_ucc_label_offset_override`
4. **Extension Digit**: Customer record → `custentity_sps_sscc_ext_digit` (defaults to '0')

## Notes

- **Offset is Static**: The offset value does NOT auto-increment. It's a configuration value used to bridge numbering gaps between systems.
- **Pallet ID Drives Uniqueness**: Since pallet IDs increment as pallets are created, SSCCs naturally increment.
- **Caching**: Generated SSCCs can be stored on the pallet record (`custrecord_pallet_sscc`) to avoid regeneration.
- **Error Handling**: If SSCC generation fails, the system falls back to a simple padded pallet ID format.

## Testing

To test SSCC generation:

```javascript
// Test with known values
var sscc = generateSSCCForPallet('12345', '67890');
log.debug('Test SSCC', 'Generated: ' + sscc);
// Expected: 18-digit SSCC starting with extension digit + manufacturer ID
```

