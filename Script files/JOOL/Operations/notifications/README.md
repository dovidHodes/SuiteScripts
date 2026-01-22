# Routing Not Received Notification

Scheduled script that monitors Item Fulfillments with routing status 2 (routing requested but not received) and sends email notifications when MABD dates are approaching.

## Overview

This scheduled script searches for Item Fulfillments that:
- Have routing status = 2 (routing requested but not received)
- Have MABD date within 2 business days from current date
- Belong to entities in the filter map (hardcoded: includes 1716)

When IFs matching these criteria are found, the script sends an email notification with:
- List of entity names (not internal IDs)
- List of IF transaction IDs with clickable record URLs
- MABD dates for each IF

## Script

### `_dsh_sch_routing_not_received_notification.js`
- **Type**: Scheduled Script
- **Purpose**: Monitor IFs with routing requested but not received
- **Email Recipient**: dhodes@joolbaby.com

## Features

- **Entity Filtering**: Uses hardcoded entity filter map (includes 1716)
- **Business Day Calculation**: Accurately calculates 2 business days from current date (excludes weekends)
- **Entity Name Logging**: Logs entity names (not internal IDs) for better readability
- **Email Notifications**: Sends formatted email with clickable IF record links
- **Record URLs**: Generates proper NetSuite record URLs for each IF

## Configuration

### Entity Filter Map

The script uses a hardcoded entity filter map. To add more entities, edit the `ENTITY_FILTER_MAP` object:

```javascript
var ENTITY_FILTER_MAP = {
    1716: true
    // Add more entities here as needed
    // Example: 1234: true, 5678: true
};
```

### Email Configuration

- **Recipient**: dhodes@joolbaby.com
- **Author ID**: 2536 (hardcoded)
- **Subject**: "Routing Requested But Not Received - Item Fulfillments"

## Search Criteria

The script searches for Item Fulfillments with:
- `custbody_routing_status = 2` (routing requested but not received)
- `custbody_gbs_mabd` within 2 business days from current date
- `entity` in the entity filter map
- `custbody_gbs_mabd` is not empty

## Email Format

The email includes:
- Subject line indicating routing not received
- List of entity names (not IDs)
- Numbered list of IF transaction IDs with:
  - Clickable record URL (link text is the tranid)
  - Entity name
  - MABD date

## Business Day Calculation

The script calculates business days correctly:
- Excludes Saturdays and Sundays
- Counts from current date (inclusive)
- Sets end date to end of day (23:59:59) for proper "on or before" comparison

## Related Scripts

- Routing Calculator Library: `../Calculate and set routing/_dsh_lib_routing_calculator.js`
- Routing Status Values:
  - 1 = Ready for routing request
  - 2 = Routing requested but not received
  - 3 = Routing received
  - 4 = Pickup date could not be set

## Usage

1. Deploy the scheduled script in NetSuite
2. Set the schedule (recommended: daily or multiple times per day)
3. The script will automatically:
   - Search for IFs matching criteria
   - Log entity names (not IDs)
   - Send email notifications when IFs are found

## Notes

- The script only logs entity names, not internal IDs
- Entity names are retrieved from customer records (companyname or entityid field)
- Record URLs are generated using NetSuite's URL resolution API
- Email uses HTML format with clickable links

