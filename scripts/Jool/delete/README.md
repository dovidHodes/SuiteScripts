# Delete Packages

Diagnostic script for checking package deletion dependencies and issues.

## Overview

Comprehensive diagnostic script to identify everything preventing package deletion, including dependencies, user event scripts, and field relationships.

## Script

### `checkPackageDependencies.js`
- **Type**: Scheduled Script
- **Purpose**: Diagnostic tool to check package deletion blockers
- **Usage**: Run manually with specific IF ID to diagnose deletion issues

## Features

- **Comprehensive Diagnostics**: Checks all potential blockers for package deletion
- **User Event Detection**: Identifies user event scripts that run on package delete
- **Dependency Checking**: Verifies relationships and dependencies
- **Field Analysis**: Inspects all package record fields
- **Performance Analysis**: Identifies performance bottlenecks in deletion process

## Common Issues Found

- User Event scripts that run on package delete can significantly slow deletion
- Package content records may have dependencies
- Field relationships may prevent deletion
- Large numbers of packages (6000+) can cause performance issues

## Usage

1. Set `IF_ID` variable to the Item Fulfillment ID to check
2. Set `SAMPLE_SIZE` to number of packages to check in detail
3. Run script as scheduled script
4. Review execution logs for diagnostic information

## Related Scripts

- SPS Package Scripts: `../SPS Scripts/`

