# Set Routing Info AVC UE

User Event script that automatically sets Amazon Vendor Central routing information on Item Fulfillments.

## Overview

User Event script that triggers after Item Fulfillment submission to calculate and apply Amazon routing fields using the routing calculator library.

## Script

### `setAVCroutingIF_UE.js`
- **Type**: User Event Script
- **Deployed On**: Item Fulfillment
- **Event**: afterSubmit
- **Entity Filter**: Only processes entity 1716

## Features

- **Automatic Routing**: Automatically calculates and sets routing information after IF creation
- **Library Integration**: Uses routing calculator library for all calculations
- **Time Tracking**: Tracks "Request Routing" and "Populate routing" actions
- **Entity-Specific**: Only processes Item Fulfillments for entity 1716
- **Post-Submit Processing**: Runs after record is saved to ensure all data is available

## How It Works

1. Script triggers on Item Fulfillment afterSubmit
2. Checks if entity is 1716 (if not, exits)
3. Calls routing calculator library function
4. Library calculates and applies all routing fields:
   - Amazon location number
   - Routing fields
   - Pickup date
   - Routing status
5. Logs time tracking entries for routing actions

## Related Scripts

- Routing Library: `../Set routing info AVC library code/_dsh_lib_routing_calculator.js`
- Time Tracker: `../time tracker/_dsh_lib_time_tracker.js`

