# Set Routing Info AVC Library Code

Reusable library for calculating and applying Amazon Vendor Central routing information to Item Fulfillments.

## Overview

Centralized library script that handles all routing calculations and field updates for Amazon Item Fulfillments (entity 1716).

## Script

### `_dsh_lib_routing_calculator.js`
- **Type**: Library Script (Module)
- **Purpose**: Shared routing calculation logic
- **Used By**: User Event scripts and Map/Reduce scripts

## Features

- **Centralized Logic**: All routing calculations in one reusable library
- **Amazon Integration**: Calculates Amazon location numbers and routing fields
- **Pickup Date Calculation**: Automatically calculates and sets pickup dates
- **Routing Status**: Sets routing status fields on Item Fulfillments
- **Entity Filtering**: Only processes entity 1716
- **Location-Based**: Uses location record data for calculations

## Key Functions

- `calculateAndApplyRoutingFields(ifId)` - Main function that handles all routing logic
  - Checks entity ID
  - Loads location record
  - Calculates routing fields
  - Sets pickup date
  - Updates routing status

## Usage

Import the library in other scripts:
```javascript
define([
    './_dsh_lib_routing_calculator'
], function(routingLib) {
    // Call library function
    routingLib.calculateAndApplyRoutingFields(ifId);
});
```

## Related Scripts

- Routing User Event: `../Set routing info AVC UE/setAVCroutingIF_UE.js`
- Create IFs: `../Create IFs/autoIF.js`

