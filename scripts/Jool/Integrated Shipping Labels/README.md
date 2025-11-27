# Integrated Shipping Labels

Automated creation of integrated shipping labels from SPS packages for Item Fulfillments.

## Overview

Scheduled automation that finds Item Fulfillments needing integrated shipping labels and creates package lines from SPS package data. Uses **SCH → MR → Library** pattern for flexible triggering and reusable business logic.

## Architecture

This automation follows the **SCH → MR → Library** pattern:

1. **Scheduled Script** (`_dsh_sch_integrated_shipping_labels.js`)
   - Finds IFs meeting criteria
   - Performs pre-processing (entity filtering, routing checks, SCAC validation)
   - Schedules MR tasks

2. **Map/Reduce Script** (`_dsh_mr_integrated_shipping_labels.js`)
   - Receives IF IDs from SCH
   - Orchestrates processing
   - Sets completion flags

3. **Library Script** (`_dsh_lib_integrated_shipping_labels.js`)
   - Contains core business logic
   - Creates package lines from SPS packages
   - Can be called from MR, Suitelet, or User Event

## Scripts

### `_dsh_sch_integrated_shipping_labels.js`
- **Type**: Scheduled Script
- **Purpose**: Finds IFs needing integrated shipping labels and schedules MR
- **Search Criteria**:
  - Entity has `custentity_create_packages_integrated = true`
  - If entity has `custentity_needs_routing = true`, only when `custbody_routing_status = 3` (routing received)
  - SCAC must be in `custentity_is_small_parcel` list (opposite of BOL exclusion logic)
  - `custbody_requested_integrated_packages = false`
- **Actions**:
  - Sets `custbody_requested_integrated_packages = true` when scheduling MR
  - Schedules MR with IF IDs

### `_dsh_mr_integrated_shipping_labels.js`
- **Type**: Map/Reduce Script
- **Purpose**: Bulk processing of IFs for integrated shipping labels
- **Process**:
  - Receives IF IDs from SCH via parameters
  - Calls library function for each IF
  - Sets `custbody_requested_integrated_packages = true` after successful processing
  - Resets field to false if processing fails (for retry)

### `_dsh_lib_integrated_shipping_labels.js`
- **Type**: Library Script
- **Purpose**: Core business logic for creating integrated shipping labels
- **Functions**:
  - `createIntegratedShippingLabels(ifId)` - Main function
- **Process**:
  1. Sets IF status to "Packed"
  2. Sets shipcarrier from `custentity_carrier_type` (text values)
  3. Sets `thirdpartytypeups` to `_thirdPartyBilling`
  4. Searches SPS packages for the IF
  5. Creates package lines with dimensions (weight, length, width, height)
  6. Sets carton numbers (incrementing)
  7. Sets reference2 to `custbody_amazon_arn`
  8. Gets package content records
  9. Sets shipmethod from `custentity_integrated_shipmethod`
- **Returns**: `{ success: boolean, packagesCreated: number, error?: string }`

## Deployment

### 1. Upload Scheduled Script
1. Go to **Customization → Scripting → Scripts → New**
2. Script Type: **Scheduled Script**
3. Upload `_dsh_sch_integrated_shipping_labels.js`
4. **Deploy**:
   - Create new deployment
   - **No parameters needed**
   - Set schedule in **Scheduling** tab (e.g., hourly, every 15 minutes)
   - Status: Testing/Released

### 2. Upload Map/Reduce Script
1. Go to **Customization → Scripting → Scripts → New**
2. Script Type: **Map/Reduce Script**
3. Upload `_dsh_mr_integrated_shipping_labels.js`
4. **Deploy**:
   - Create new deployment
   - **Parameters**:
     - `custscript_dsh_mr_integrated_labels_json` (Text) - JSON parameter with IF IDs
   - **No schedule needed** - called by SCH script
   - Status: Testing/Released

### 3. Upload Library Script
1. Go to **Customization → Scripting → Scripts → New**
2. Script Type: **Suitelet** (or RESTlet - doesn't matter, won't be deployed)
3. Upload `_dsh_lib_integrated_shipping_labels.js`
4. **Note**: Library scripts are not deployed, just uploaded to File Cabinet

## Required Custom Fields

### Customer (Entity) Fields
- `custentity_create_packages_integrated` (Checkbox) - Enable integrated shipping labels
- `custentity_needs_routing` (Checkbox) - Entity requires routing before processing
- `custentity_is_small_parcel` (Multi-Select List) - SCAC codes that qualify for small parcel
- `custentity_carrier_type` (List/Record) - Carrier type for shipcarrier field
- `custentity_integrated_shipmethod` (List/Record) - Ship method to set on IF

### Item Fulfillment Fields
- `custbody_requested_integrated_packages` (Checkbox) - Workflow control field
- `custbody_routing_status` (List) - Routing status (must be 3 for routing received)
- `custbody_sps_carrieralphacode` (Text) - SCAC code
- `custbody_amazon_arn` (Text) - Amazon ARN for reference2

## How It Works

### Automated Flow (Scheduled Script)
1. Scheduled script runs on schedule
2. **Step 1**: Searches for entities with `custentity_create_packages_integrated = true`
3. **Step 2**: Searches for IFs where:
   - `custbody_requested_integrated_packages = false`
   - Entity in eligible list
4. **Step 3**: For each IF:
   - Checks if entity needs routing → verifies `custbody_routing_status = 3`
   - Checks if SCAC is in `custentity_is_small_parcel` list
   - Sets `custbody_requested_integrated_packages = true`
   - Schedules MR task with IF ID
5. **MR Script**:
   - Receives IF IDs from SCH
   - Calls library function for each IF
   - Sets completion flag after success
6. **Library Function**:
   - Sets IF status to "Packed"
   - Sets shipcarrier and thirdpartytypeups
   - Searches SPS packages
   - Creates package lines with dimensions
   - Sets carton numbers, reference2, and shipmethod

### Manual Flow (Future Suitelet)
A Suitelet can be created to call the library directly for button-triggered processing:
```javascript
// Suitelet example
function onRequest(context) {
  var ifId = context.request.parameters.ifId;
  var result = integratedLabelsLib.createIntegratedShippingLabels(ifId);
  context.response.write(JSON.stringify(result));
}
```

## Key Features

- **Entity-Based**: Only processes IFs for entities with checkbox enabled
- **Routing Support**: Respects routing requirements (waits for routing_status = 3)
- **SCAC Validation**: Only processes SCAC codes in small parcel list
- **SPS Integration**: Pulls package data from SPS packages
- **Package Lines**: Creates package sublist lines with dimensions
- **Carton Numbers**: Auto-increments carton numbers
- **Amazon ARN**: Sets reference2 to Amazon ARN from IF
- **Ship Method**: Sets shipmethod from entity configuration

## Field Mappings

### SPS Package Fields → Package Sublist
| SPS Package Field | Package Sublist Field | Notes |
|-------------------|----------------------|-------|
| `custrecord_sps_pk_weight` | `packageweight` | Weight in configured unit |
| `custrecord_sps_package_length` | `packagelength` | Length |
| `custrecord_sps_package_width` | `packagewidth` | Width |
| `custrecord_sps_package_height` | `packageheight` | Height |
| (calculated) | `packagecartonnumber` | Auto-incremented |
| `custbody_amazon_arn` (from IF) | `reference2ups` | Amazon ARN |

### IF Fields Set
- `status` → "Packed" (status 2)
- `shipcarrier` → From `custentity_carrier_type` (text value)
- `thirdpartytypeups` → `_thirdPartyBilling` (value 2)
- `shipmethod` → From `custentity_integrated_shipmethod`

## Troubleshooting

### No IFs Being Processed
1. **Check entity checkbox**: Verify `custentity_create_packages_integrated = true`
2. **Check routing**: If entity has `custentity_needs_routing = true`, verify `custbody_routing_status = 3`
3. **Check SCAC**: Verify SCAC is in `custentity_is_small_parcel` list
4. **Check requested field**: Verify `custbody_requested_integrated_packages = false`

### Package Lines Not Created
1. **Check SPS packages**: Verify SPS packages exist for the IF
2. **Check package dimensions**: Verify SPS package fields have values
3. **Check logs**: Review execution logs for errors

### Carton Number Not Setting
- Field ID may vary: tries `packagecartonnumber` first, then `cartonnumber`
- Check NetSuite version and package sublist field configuration

### Status Not Setting to Packed
- Verify `record.Status.PACKED` constant exists in your NetSuite version
- May need to use numeric value `2` instead

## Related Scripts

- **BOL Generation**: `../BOL/` - Similar entity filtering pattern
- **Batch Print Labels**: `../Batch print labels/` - Similar SCH → MR pattern
- **Auto Pack IFs**: `../Auto Pack IFs/` - Similar SPS package integration

## Architecture Pattern

This script follows the **SCH → MR → Library** pattern documented in `/AUTOMATION_ARCHITECTURE.md`:

- ✅ Complex pre-processing (entity filtering, routing checks, SCAC validation)
- ✅ Flexible triggering (can add Suitelet for button support)
- ✅ Reusable library code (can be called from multiple places)
- ✅ Deployment management (single MR deployment, can add more if needed)

---

**Last Updated**: 2025-01-XX  
**Maintained By**: Development Team

