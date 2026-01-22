# PO Status and SO Link UE

User Event script that automatically sets Purchase Order status and links to related Sales Orders.

## Overview

User Event script that triggers after Purchase Order submission to:
1. Set the `transtatus` field based on `custbody_status` value
2. Search for and link related Sales Orders (on create only)

## Script

### `_dsh_ue_po_status_so_link.js`
- **Type**: User Event Script
- **Deployed On**: Purchase Order
- **Event**: afterSubmit
- **Triggers**: create, edit

## Features

### Status Field Mapping (Create & Edit)
- Automatically sets `transtatus` field based on `custbody_status` internal ID:
  - `custbody_status` = 1 → `transtatus` = 'A'
  - `custbody_status` = 2 → `transtatus` = 'B'
  - `custbody_status` = 3 → `transtatus` = 'C'

### Sales Order Linking (Create Only)
- On Purchase Order creation, searches for related Sales Orders using:
  - Entity from `custbody_sps_cx_tpid` field (parsed to integer)
  - PO Number from `custbody_sps_cx_ponumber` field
- Search criteria: Sales Order where `entity` matches and `otherrefnum` matches PO number
- **If exactly one SO found**: Sets `custbody_sps_cx_related_trxn` to the Sales Order internal ID
- **If multiple SOs found**: Sets `custbody_sps_cx_updatesummary` with message "More than one found: [list of SO IDs]"

## How It Works

### On Create or Edit:
1. Script triggers on Purchase Order afterSubmit
2. Loads the Purchase Order record
3. Checks `custbody_status` field value
4. Maps internal ID (1, 2, or 3) to status letter (A, B, or C)
5. Updates `transtatus` field if different from current value

### On Create Only:
1. Retrieves PO number from `custbody_sps_cx_ponumber`
2. Retrieves entity ID from `custbody_sps_cx_tpid` (parsed to integer)
3. Searches for Sales Orders matching entity and otherrefnum
4. If exactly one SO found:
   - Sets `custbody_sps_cx_related_trxn` to SO internal ID
5. If multiple SOs found:
   - Sets `custbody_sps_cx_updatesummary` with warning message and comma-separated list of SO IDs
6. Saves the Purchase Order record with updates

## Field Requirements

### Required Fields:
- `custbody_status` - Custom status field (internal ID 1, 2, or 3)
- `transtatus` - Standard NetSuite status field (will be set to A, B, or C)

### Fields Used for SO Linking (Create Only):
- `custbody_sps_cx_ponumber` - PO Number to search for
- `custbody_sps_cx_tpid` - Entity ID (will be parsed to integer)
- `custbody_sps_cx_related_trxn` - Related transaction field (set when one SO found)
- `custbody_sps_cx_updatesummary` - Update summary field (set when multiple SOs found)

## Deployment Notes

- Deploy as User Event Script on Purchase Order record type
- Set trigger to `afterSubmit`
- Enable for both `create` and `edit` events
- No additional filters required

## Error Handling

- Script logs all operations for debugging
- Errors are caught and logged without failing the record save
- Missing fields are handled gracefully (skips SO search if fields are empty)
- Invalid entity IDs are logged as errors

