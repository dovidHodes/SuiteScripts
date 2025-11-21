# Approve AVC Orders

Automated approval of AVC (Amazon Vendor Central) orders with warehouse-specific buffer stock logic.

## Overview

This User Event script automatically approves Sales Orders for entity 1716 based on inventory availability and warehouse buffer stock requirements.

## Script

### `setAndApproveAVCOrders.js`
- **Type**: User Event Script
- **Deployed On**: Sales Order
- **Event**: beforeSubmit
- **Entity Filter**: Only processes entity 1716

## Features

- **Warehouse Buffer Stock Management**: Maintains minimum buffer stock levels per warehouse
  - Rutgers (ID: 38): 250 units buffer
  - Westmark (ID: 4): 250 units buffer
- **Automatic Approval**: Approves orders when inventory is sufficient after accounting for buffer stock
- **Time Tracking**: Integrates with time tracker library for billing purposes
- **Entity-Specific**: Only processes orders for entity 1716

## How It Works

1. Script triggers on Sales Order beforeSubmit
2. Checks if entity is 1716 (if not, exits)
3. For each warehouse, calculates available inventory (on-hand minus buffer stock)
4. Compares order quantity against available inventory
5. If sufficient inventory, automatically approves the order
6. Logs time tracking entry for "Approve order" action

## Related Scripts

- Time Tracker: `../time tracker/_dsh_lib_time_tracker.js`

