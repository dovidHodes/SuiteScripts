# Add Packages to Item Fulfillment - Map/Reduce Script

## Overview

This Map/Reduce script demonstrates how to programmatically add packages to the package sublist on Item Fulfillment records with weight and dimensions.

## Important Notes

### Package Weight and Dimensions Fields

The package sublist on Item Fulfillment records has fields for weight and dimensions that **may not be visible in the UI** but can be set programmatically:

- **`packageweight`** - Package weight (in the unit of measure configured in NetSuite)
- **`packagelength`** - Package length
- **`packagewidth`** - Package width
- **`packageheight`** - Package height

These fields are standard NetSuite fields and can be set via SuiteScript even if they don't appear in the UI when manually adding packages.

### Why Fields May Not Be Visible

NetSuite's package sublist UI may hide certain fields by default or based on your account configuration. However, the underlying fields exist and can be set programmatically. This is common with NetSuite - many fields are available via API that aren't shown in the standard UI.

## Usage

### 1. Customize the Search Filters

Edit the `getInputData` function to specify which Item Fulfillment records should be processed:

```javascript
var ifSearch = search.create({
  type: 'itemfulfillment',
  filters: [
    // Add your filters here
    ['status', 'anyof', ['Fulfilled']],
    'AND',
    ['custbody_your_custom_field', 'is', 'T']
  ],
  // ...
});
```

### 2. Customize Package Data

In the `reduce` function, customize how package data is determined:

- **Static data**: Set weight/dimensions directly (as shown in example)
- **From custom records**: Load package data from custom records
- **From item data**: Calculate based on items in the fulfillment
- **From external source**: Fetch from API or other source

### 3. Add Multiple Packages

To add multiple packages, loop through your package data:

```javascript
var packages = [
  { weight: 10.5, length: 12, width: 8, height: 6 },
  { weight: 5.2, length: 10, width: 6, height: 4 }
];

packages.forEach(function(pkg, index) {
  var lineIndex = ifRecord.getLineCount({ sublistId: 'package' });
  ifRecord.insertLine({
    sublistId: 'package',
    line: lineIndex
  });
  
  ifRecord.setSublistValue({
    sublistId: 'package',
    fieldId: 'packageweight',
    line: lineIndex,
    value: pkg.weight
  });
  
  // Set dimensions...
});
```

## Field Reference

### Package Sublist Fields

| Field ID | Description | Type | Notes |
|----------|-------------|------|-------|
| `packageweight` | Package weight | Decimal | Unit depends on NetSuite configuration |
| `packagelength` | Package length | Decimal | Typically in inches |
| `packagewidth` | Package width | Decimal | Typically in inches |
| `packageheight` | Package height | Decimal | Typically in inches |
| `packagetype` | Package type | List/Record | Reference to package type record (if configured) |

### Additional Package Fields

You may also be able to set:
- `packagequantity` - Quantity of items in package
- `packagetrackingnumber` - Tracking number
- `packagepackagedate` - Package date

## Deployment

1. Create a new Map/Reduce script deployment in NetSuite
2. Set the script type to "Map/Reduce"
3. Configure scheduling (if needed) or run manually
4. Set appropriate execution context (e.g., Administrator)
5. Test with a small subset of records first

## Troubleshooting

### Fields Not Setting

If fields aren't being set:
1. Verify the field IDs are correct for your NetSuite version
2. Check that the record is in edit mode (use `isDynamic: true`)
3. Ensure the sublist line is inserted before setting values
4. Check script execution logs for errors

### Weight/Dimensions Not Visible in UI

This is expected - these fields may not appear in the UI but are stored in the database. To verify they're set:
1. Use a saved search on Item Fulfillment with package sublist columns
2. Check via SuiteScript by loading the record and reading the values
3. Use the NetSuite API to query the data

## Example: Getting Package Data from Custom Records

If you have custom package records (like `customrecord_sps_package`), you can load them:

```javascript
// Search for packages related to this IF
var packageSearch = search.create({
  type: 'customrecord_sps_package',
  filters: [
    ['custrecord_sps_pack_asn', 'anyof', ifId]
  ],
  columns: [
    'custrecord_sps_pk_weight',
    'custrecord_sps_pk_length',  // if you have these fields
    'custrecord_sps_pk_width',
    'custrecord_sps_pk_height'
  ]
});

packageSearch.run().each(function(result) {
  var lineIndex = ifRecord.getLineCount({ sublistId: 'package' });
  ifRecord.insertLine({
    sublistId: 'package',
    line: lineIndex
  });
  
  var weight = result.getValue('custrecord_sps_pk_weight') || 0;
  ifRecord.setSublistValue({
    sublistId: 'package',
    fieldId: 'packageweight',
    line: lineIndex,
    value: weight
  });
  
  // Set dimensions if available...
  return true;
});
```

## Library Module

A reusable library module (`_dsh_lib_add_packages.js`) is provided for adding packages. This can be used from any script type (Map/Reduce, Suitelet, User Event, etc.).

### Using the Library

```javascript
define([
  './_dsh_lib_add_packages'
], function (packageLib) {
  
  // Add a single package
  var result = packageLib.addPackage(ifId, {
    weight: 10.5,
    length: 12,
    width: 8,
    height: 6
  });
  
  // Add multiple packages
  var packages = [
    { weight: 10.5, length: 12, width: 8, height: 6 },
    { weight: 5.2, length: 10, width: 6, height: 4 }
  ];
  var result = packageLib.addPackages(ifId, packages);
  
  // Copy packages from custom records
  var result = packageLib.copyPackagesFromCustomRecords(ifId);
  
  // Get existing packages
  var packages = packageLib.getPackages(ifId);
});
```

### Library Functions

- **`addPackage(ifId, packageData, options)`** - Adds a single package
- **`addPackages(ifId, packagesArray, options)`** - Adds multiple packages efficiently
- **`copyPackagesFromCustomRecords(ifId, options)`** - Copies packages from custom SPS package records
- **`getPackages(ifId)`** - Retrieves existing packages from an IF

## Related Scripts

- `AGA/reconcilePackages/reconcilePackagesSuitelet (1).js` - Example of adding packages to IF
- `AGA/deletePackages.js` - Example of removing packages from IF

