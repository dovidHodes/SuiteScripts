# NetSuite Troubleshooting Guide - Jool Scripts

## Common Issues and Solutions

### Search Filter Errors

#### Issue: `SSS_INVALID_SRCH_FILTER_JOIN` Error
**Error Message**: "An nlobjSearchFilter contains an invalid join ID, or is not in proper syntax"

**Problem**: Trying to use a join filter like `entity.custentity_generate_and_attach_bols` directly in a search filter is not supported.

**Solution**: 
1. First search for the related record (e.g., Customer) with the field criteria
2. Collect the internal IDs from that search
3. Then search for the main record using `['field', 'anyof', idArray]`

**Example** (from `_dsh_mr_generate_and_attach_bols.js`):
```javascript
// ❌ WRONG - This causes the error
var ifSearch = search.create({
  type: 'itemfulfillment',
  filters: [
    ['entity.custentity_generate_and_attach_bols', 'is', 'T']  // Invalid join
  ]
});

// ✅ CORRECT - Two-step approach
// Step 1: Find customers with the field
var entityIds = [];
var entitySearch = search.create({
  type: 'customer',
  filters: [['custentity_generate_and_attach_bols', 'is', 'T']],
  columns: [search.createColumn({ name: 'internalid' })]
});
entitySearch.run().each(function(result) {
  entityIds.push(result.id);
  return true;
});

// Step 2: Search IFs using entity IDs
var ifSearch = search.create({
  type: 'itemfulfillment',
  filters: [
    ['entity', 'anyof', entityIds],  // Use 'anyof' with array
    'AND',
    ['custbody_requested_bol', 'is', 'F']
  ]
});
```

---

### Map/Reduce Script Issues

#### Issue: `[object Object]` in Error Logs
**Problem**: Error objects are being logged directly, showing as `[object Object]` instead of readable error messages.

**Solution**: Properly handle error objects in the summarize function:
```javascript
function summarize(summaryContext) {
  if (summaryContext.mapSummary && summaryContext.mapSummary.errors) {
    var mapErrors = summaryContext.mapSummary.errors;
    if (Array.isArray(mapErrors)) {
      log.audit('summarize', 'Map errors: ' + mapErrors.length);
      mapErrors.forEach(function(error, index) {
        log.error('summarize', 'Map error ' + (index + 1) + ': ' + 
          (error.toString ? error.toString() : JSON.stringify(error)));
      });
    } else if (typeof mapErrors === 'object') {
      log.audit('summarize', 'Map errors: ' + JSON.stringify(mapErrors));
    }
  }
  
  // Same for reduceSummary.errors
}
```

---

#### Issue: Map/Reduce Script Not Processing Records
**Symptoms**: Script runs but processes 0 records

**Checklist**:
1. **Search Filters**: Verify all filter criteria are correct
   - Check field IDs are correct
   - Check field types (checkbox = 'T'/'F', select = internal ID, text = string)
   - Check for typos in field names

2. **Empty Entity List**: If using two-step search (entity IDs first), check if any entities match
   ```javascript
   log.debug('getInputData', 'Found ' + entityIds.length + ' entities');
   if (entityIds.length === 0) {
     // Return empty search to avoid errors
     return search.create({
       type: 'itemfulfillment',
       filters: [['internalid', 'none', '@NONE@']]
     });
   }
   ```

3. **Map Function Filtering**: Check if map function is filtering out all records
   - Add debug logs to see why records are being skipped
   - Verify exclusion list logic is correct

---

### Multi-Select Field Access

#### Issue: Getting Text Values from Multi-Select Fields
**Problem**: Need to get text values (not IDs) from multi-select fields on records.

**Solution**: Use `getText()` method which returns comma-separated string:
```javascript
var customerRecord = record.load({
  type: 'customer',
  id: entityId,
  isDynamic: false
});

// Get text values from multi-select field
var dontGenerateBOLsText = customerRecord.getText({
  fieldId: 'custentity_dont_generate_bols'
}) || '';

// Split and process
if (dontGenerateBOLsText && dontGenerateBOLsText.trim() !== '') {
  var exclusionList = dontGenerateBOLsText.split(',').map(function(item) {
    return item.trim();
  });
  // Now compare against exclusion list
}
```

**Note**: `getText()` returns a comma-separated string of text values, not IDs.

---

### Text Field Access in Search Results

#### Issue: Getting Text Field Values from Search Results
**Problem**: Text fields in search results return values directly as strings, not objects.

**Solution**: Access text fields directly (no `.value` property needed):
```javascript
var searchResult = JSON.parse(mapContext.value);

// Text field - access directly
if (searchResult.values.custbody_sps_carrieralphacode) {
  scac = searchResult.values.custbody_sps_carrieralphacode || '';
}

// Select field - may have .value property
if (searchResult.values.entity) {
  entityId = searchResult.values.entity.value || searchResult.values.entity;
}
```

---

### Field Update Errors

#### Issue: `record.submitFields()` Failing
**Problem**: Field updates failing with errors about mandatory fields or sourcing.

**Solution**: Use proper options:
```javascript
record.submitFields({
  type: 'itemfulfillment',
  id: ifId,
  values: {
    custbody_requested_bol: true
  },
  options: {
    enableSourcing: false,      // Don't trigger field sourcing
    ignoreMandatoryFields: true // Don't fail on missing required fields
  }
});
```

---

### Library Script Import Errors

#### Issue: "is not a function" or "Library script not loaded"
**Problem**: Library script not being found or imported correctly.

**Solutions**:
1. **Verify Library is Uploaded**: Library scripts must be uploaded to NetSuite File Cabinet
2. **Check File Path**: Use relative path if in same folder:
   ```javascript
   './_dsh_lib_bol_generator'  // Same folder
   ```
3. **Check Script ID**: If using script ID, verify it's correct:
   ```javascript
   'customscript_dsh_lib_bol_generator'  // Full script ID
   ```
4. **Verify Module Exports**: Library must return the functions:
   ```javascript
   return {
     generateAndAttachBOL: generateAndAttachBOL,
     collectIFData: collectIFData
   };
   ```

---

### Debug Logging Best Practices

#### Adding Comprehensive Debug Logs
**When to Use**:
- Search criteria and results
- Field values being checked
- Filtering decisions
- Function parameters and return values
- Error details with stack traces

**Example**:
```javascript
log.debug('map', 'TranID: ' + tranId + ' - Processing IF (ID: ' + ifId + ')');
log.debug('map', 'Search result values: ' + JSON.stringify(searchResult.values));
log.debug('map', 'Customer exclusion list: ' + (dontGenerateBOLsText || 'empty'));
log.debug('map', 'Comparing SCAC "' + scac + '" against exclusion list');

// For errors
log.error('map', 'Error: ' + e.toString());
log.error('map', 'Error stack: ' + (e.stack || 'No stack trace'));
log.debug('map', 'Error details: ' + JSON.stringify(e));
```

---

### Common Field Type Issues

#### Checkbox Fields
- Use `'T'` for true, `'F'` for false in searches
- Use `true`/`false` (boolean) when setting values

#### Select/List Fields
- Use internal ID (number) in searches: `['field', 'is', 3]`
- Use internal ID when setting: `value: 3`
- Use `getText()` to get text value from record

#### Multi-Select Fields
- Use `getText()` to get comma-separated text values
- Cannot use in search filters directly (must search related records first)

#### Text Fields
- Use string values in searches: `['field', 'is', 'value']`
- Access directly from search results (no `.value` property)

---

### Performance Issues

#### Issue: Map/Reduce Script Taking Too Long
**Solutions**:
1. **Limit Search Results**: Add date filters or status filters to limit scope
2. **Optimize Map Function**: Avoid loading records if possible, use search result values
3. **Batch Processing**: Process in smaller batches if needed
4. **Check Governance**: Monitor usage in summarize function

---

### Testing Tips

1. **Test Search First**: Run the search manually in NetSuite UI to verify it returns expected results
2. **Test with One Record**: Start with a single record to verify logic
3. **Check Execution Logs**: Review all log levels (Audit, Debug, Error)
4. **Verify Field IDs**: Double-check field IDs match actual NetSuite fields
5. **Test Edge Cases**: Empty lists, null values, missing fields

---

## Quick Reference

### Search Filter Operators
- `'is'` - Equals
- `'anyof'` - In array (use with array of IDs)
- `'none'` - Not equal / Not in
- `'contains'` - Text contains
- `'isempty'` - Field is empty

### Field Value Types
- **Checkbox**: `'T'` / `'F'` (search), `true` / `false` (set)
- **Select**: Internal ID (number)
- **Text**: String value
- **Date**: Date object or string in format

### Common Error Codes
- `SSS_INVALID_SRCH_FILTER_JOIN` - Invalid join in search filter
- `INVALID_FLD_VALUE` - Invalid field value
- `MISSING_REQD_ARGUMENT` - Missing required parameter
- `SSS_MISSING_REQD_ARGUMENT` - Missing required search argument

---

## Getting Help

When reporting issues, include:
1. Full error message and stack trace
2. Script name and function where error occurred
3. Sample record IDs (if applicable)
4. Execution log entries (especially Debug level)
5. What you expected vs what actually happened

