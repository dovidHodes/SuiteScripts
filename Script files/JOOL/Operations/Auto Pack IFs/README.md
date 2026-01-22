# Auto Pack IFs

Automated packing of Item Fulfillments using SPS Commerce integration.

## Overview

Scheduled script that finds Item Fulfillments needing autopack and schedules the SPS Map/Reduce autopack script for processing.

## Scripts

### `autopackScheduled.js`
- **Type**: Scheduled Script
- **Purpose**: Finds IFs needing autopack and schedules SPS autopack Map/Reduce script
- **Search Criteria**:
  - `custbody_requested_autopack = false`
  - Entity has `custentity_auto_create_packages = true`
  - Created date after November 1, 2025

### `sps_mr_auto_pack_2x_custom.js`
- **Type**: Map/Reduce Script (SPS)
- **Purpose**: Custom autopack implementation for SPS Commerce integration

## Features

- **Automated Discovery**: Finds Item Fulfillments that need packing
- **SPS Integration**: Schedules SPS Commerce autopack Map/Reduce script
- **Entity-Based**: Only processes IFs for entities with `custentity_auto_create_packages = true`
- **Time Tracking**: Tracks "Autopack IF" action for billing
- **Status Management**: Sets `custbody_requested_autopack = true` after successful scheduling

## How It Works

1. Scheduled script runs on schedule
2. Searches for entities with `custentity_auto_create_packages = true`
3. Finds IFs where `custbody_requested_autopack = false`
4. Schedules SPS autopack Map/Reduce script for each IF
5. Sets `custbody_requested_autopack = true` after successful scheduling
6. Logs time tracking entries

## Related Scripts

- SPS Autopack Scripts: `../SPS Scripts/Autopack/`
- Time Tracker: `../time tracker/_dsh_lib_time_tracker.js`

