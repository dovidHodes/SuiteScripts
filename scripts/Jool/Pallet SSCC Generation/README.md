# Pallet SSCC Generation

This library generates SSCC-18 barcodes for pallet labels using the same logic as SPS package labels, but with extension digit **1** to differentiate from packages (which use extension digit 0).

## Overview

The SSCC (Serial Shipping Container Code) is an 18-digit barcode used to uniquely identify shipping containers (pallets in this case). This library:

- Retrieves the manufacturer ID from the same configuration as SPS scripts
- Uses extension digit **1** (packages use 0)
- Uses the pallet's internal ID as the base number
- Calculates the check digit using the standard SSCC algorithm
- Saves the SSCC to the pallet record field `custrecord_sscc`

## SSCC Format

**20 digits total:**
- **Two Leading Zeros**: `00` (to bring total to 20 digits)
- **Extension Digit**: `1` (fixed for pallets)
- **Manufacturer ID**: 7-10 digits (from configuration)
- **Serial Number**: Padded pallet ID (fills remaining space to reach 17 digits before check digit)
- **Check Digit**: 1 digit (calculated)

The SSCC is generated as a standard 18-digit SSCC-18 code, then 2 leading zeros are added to make it 20 digits total.

## Configuration

The library retrieves the manufacturer ID from the same location as SPS package labels:

- **Manufacturer ID**: `customrecord_sps_label_access` (ID: 1) → `custrecord_sps_label_login_mfgid`

The manufacturer ID can be 7-10 digits, and the padding will automatically adjust:
- 7 digit mfgId: 9 digits available for serial number
- 8 digit mfgId: 8 digits available for serial number
- 9 digit mfgId: 7 digits available for serial number
- 10 digit mfgId: 6 digits available for serial number

## Usage

### Basic Usage - Generate and Save SSCC

```javascript
var ssccLib = require('./_dsh_lib_pallet_sscc_generator');

// Generate and save SSCC to pallet record
// Manufacturer ID is automatically retrieved from configuration
var sscc = ssccLib.generateAndSaveSSCC('12345'); // palletId
// Returns: "00112345670000123457" (20 digits - 2 leading zeros + 18-digit SSCC)
// Also saves to custrecord_sscc field on pallet record
```

### Generate Only (Don't Save)

```javascript
var ssccLib = require('./_dsh_lib_pallet_sscc_generator');

// Generate SSCC without saving
// Manufacturer ID is automatically retrieved from configuration
var sscc = ssccLib.generateSSCC('12345'); // palletId
// Returns: "00112345670000123457" (20 digits - 2 leading zeros + 18-digit SSCC)
```

## Example Calculation

**Input:**
- Pallet ID: `12345`
- Manufacturer ID: `1234567` (7 digits, automatically retrieved from `customrecord_sps_label_access`)
- Extension Digit: `1` (fixed for pallets)

**Process:**
1. Prefix: `"1" + "1234567" = "11234567"` (8 digits)
2. Calculate serial number space: `17 - 8 = 9` digits available
3. Pad pallet ID: `"000012345"` (9 digits, padded with leading zeros)
4. Combine: `"11234567000012345"` (17 digits before check digit)
5. Check digit: Calculated using SSCC algorithm → `"7"`
6. SSCC-18: `"112345670000123457"` (18 digits)
7. **Final SSCC**: `"00" + "112345670000123457" = "00112345670000123457"` (20 digits)

## Key Differences from Package SSCC

| Feature | Package SSCC | Pallet SSCC |
|---------|--------------|-------------|
| Extension Digit | `0` | `1` |
| Base ID | Package ID | Pallet ID |
| Field | `custrecord_sps_package_ucc` | `custrecord_sscc` |

## Functions

### `generateAndSaveSSCC(palletId)`

Generates an SSCC code and saves it to the pallet record. Manufacturer ID is automatically retrieved from configuration.

**Parameters:**
- `palletId` (required): Pallet record internal ID

**Returns:** 20-digit SSCC string (with 2 leading zeros)

**Throws:** Error if pallet ID is invalid, manufacturer ID not found, or SSCC generation fails

### `generateSSCC(palletId)`

Generates an SSCC code without saving it to the pallet record. Manufacturer ID is automatically retrieved from configuration.

**Parameters:**
- `palletId` (required): Pallet record internal ID

**Returns:** 20-digit SSCC string (with 2 leading zeros)

**Throws:** Error if pallet ID is invalid, manufacturer ID not found, or SSCC generation fails

### `getManufacturerId()`

Retrieves manufacturer ID from configuration. This is called automatically by `generateSSCC()`.

**Returns:** Manufacturer ID string (retrieved from `customrecord_sps_label_access`)

## Error Handling

The library throws errors for:
- Invalid pallet ID
- Manufacturer ID not found
- Invalid SSCC length (must be exactly 18 digits)
- Invalid manufacturer ID format in customer override (must be 7-10 digits)

## Integration Example

```javascript
/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['./_dsh_lib_pallet_sscc_generator'], function (ssccLib) {
  
  function execute(context) {
    // Get all pallets without SSCC
    var palletSearch = search.create({
      type: 'customrecord_asn_pallet',
      filters: [
        ['custrecord_sscc', 'isempty', '']
      ],
      columns: ['internalid', 'custrecord_parent_if']
    });
    
    palletSearch.run().each(function (result) {
      var palletId = result.id;
      
      try {
        var sscc = ssccLib.generateAndSaveSSCC(palletId);
        log.audit('SSCC Generated', 'Pallet: ' + palletId + ', SSCC: ' + sscc);
      } catch (err) {
        log.error('SSCC Generation Failed', 'Pallet: ' + palletId + ', Error: ' + err.toString());
      }
      
      return true;
    });
  }
  
  return {
    execute: execute
  };
});
```

## Notes

- **Simple and Direct**: The SSCC uses the pallet ID directly, padded with leading zeros to fill the serial number space. No offset or modulo calculations needed.
- **Pallet ID Drives Uniqueness**: Since pallet IDs increment as pallets are created, SSCCs naturally increment.
- **Extension Digit 1**: This differentiates pallet SSCCs from package SSCCs (which use 0), ensuring no collisions.
- **SSCC-18 Standard**: The generated code follows the SSCC-18 standard with proper check digit calculation, then 2 leading zeros are added to make it 20 digits total.
- **Automatic Padding**: The pallet ID is automatically padded with leading zeros to fill the available serial number space (17 digits total minus extension digit and manufacturer ID length).
- **20-Digit Format**: The final SSCC is 20 digits: "00" + 18-digit SSCC-18 code.

