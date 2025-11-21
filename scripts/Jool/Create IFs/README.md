# Create IFs

Automated creation of Item Fulfillments from Sales Orders.

## Overview

Map/Reduce script that automatically creates Item Fulfillments grouped by location for Sales Orders that meet specific criteria.

## Script

### `autoIF.js`
- **Type**: Map/Reduce Script
- **Purpose**: Creates Item Fulfillments from Sales Orders
- **Search Criteria**:
  - Entity has `custentity_auto_create_ifs = true`
  - Sales order has `custbody_sent_po_ack = true`
  - Sales order has `custbody_ifs_created = false`

## Features

- **Automated IF Creation**: Creates Item Fulfillments automatically from Sales Orders
- **Location Grouping**: Groups items by location for fulfillment
- **Entity-Based**: Only processes orders for entities with `custentity_auto_create_ifs = true`
- **Routing Integration**: Uses routing calculator library to set routing information
- **Time Tracking**: Tracks "Create Item fulfillment" action for billing
- **Status Management**: Sets `custbody_ifs_created = true` after successful creation

## How It Works

1. Map/Reduce script runs on schedule
2. **getInputData**: Searches for Sales Orders meeting criteria
3. **map**: Groups orders by location and entity
4. **reduce**: Creates Item Fulfillments for each group
5. Applies routing information using routing calculator library
6. Sets `custbody_ifs_created = true` after creation
7. Logs time tracking entries

## Related Scripts

- Routing Calculator: `../Set routing info AVC library code/_dsh_lib_routing_calculator.js`
- Time Tracker: `../time tracker/_dsh_lib_time_tracker.js`

