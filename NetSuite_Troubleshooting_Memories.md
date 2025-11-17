# NetSuite Troubleshooting Memories & Lessons Learned

**IMPORTANT: Read this file at the start of every new NetSuite project and add to it as you learn new things!**

## Search Issues & Solutions

### Item Fulfillment Search Problems
**Problem**: Search returning no results for Item Fulfillments
**Solution**: Use correct search pattern:
```javascript
const search = search.create({
    type: search.Type.TRANSACTION,  // Base type
    filters: [
        ['type', 'is', 'ItemFulfillment'],  // Specific transaction type
        'AND',
        ['createdfrom', 'is', salesOrderId]
    ]
});
```

**What Doesn't Work**:
- ❌ `type: search.Type.ITEM_FULFILLMENT` with `['transtype', 'is', 'ItemFulfillment']`
- ❌ `type: search.Type.ITEM_FULFILLMENT` with `['type', 'is', 'itemfulfillment']` (lowercase)
- ❌ Redundant type filters

**What Works**:
- ✅ `type: search.Type.ITEM_FULFILLMENT` with proper column syntax
- ✅ `search.createColumn({ name: 'fieldname' })` instead of string arrays

### ASN Status Values
**Lesson**: ASN status 2 OR 16 both indicate "ASN sent" and "No ASN needed" (acceptable for EDI approval)
```javascript
if (asnStatus !== '2' && asnStatus !== '16') {
    // Not ASN sent or no ASN needed
}
```

## Error Handling Best Practices

### EDI Error Record Creation
**Always include**:
- Transaction ID in Record field (Invoice ID, Sales Order ID, etc. - whatever transaction the script is working on)
- Action field set to internal ID 8
- Trading Partner ID when available
- Error Message (descriptive)
- Status field set to internal ID 1 (New)

**Function signature**:
```javascript
createEDIErrorRecord(invoiceId, errorMessage, tradingPartnerId)
```

### Debugging Search Issues
**Add these debug logs**:
```javascript
log.debug('Search Debug', `Searching with filters: ${JSON.stringify(filters)}`);
const searchCount = search.runPaged().count;
log.debug('Search Count', `Found ${searchCount} results`);
```

## Customer-Specific Logic Patterns

### TP Target Logic (Entity 546)
**Pattern**: Set integration status AND EDI approval, then skip processing
```javascript
if (entityId === 546) {
    record.submitFields({
        type: record.Type.INVOICE,
        id: invoiceId,
        values: {
            'custbodyintegrationstatus': 9,
            'custbody_approved_to_send_edi': true
        }
    });
    return true; // Skip further processing
}
```

## Common NetSuite Gotchas

### Integer Parsing
**Always parse entity IDs as integers**:
```javascript
const entityId = parseInt(result.getValue('entity'));
```

### Field ID Consistency
**Use exact field IDs from NetSuite**:
- `custbody_approved_to_send_edi` (not `custbody_approved_to_send`)
- `custbodyintegrationstatus` (not `custbody_integration_status`)

## Testing Strategies

### Error Testing
**Add temporary test errors**:
```javascript
// TEST ERROR - Remove after testing
if (invoiceId) throw new Error('Test main processing error');
```

**Test different sections**:
1. Main processing loop
2. Customer-specific logic
3. Sibling check logic

## Performance Tips

### Search Optimization
- Use `runPaged().count` for counting results
- Use `run().each()` for processing results
- Add appropriate filters to reduce result set

## Future Additions
**Add to this file when you discover**:
- New search patterns that work/don't work
- Common error messages and solutions
- Performance optimizations
- Customer-specific requirements
- Field ID patterns
- Debugging techniques

## POD Retrieval Patterns

### FedEx API Integration
**Pattern**: OAuth token flow followed by document retrieval
```javascript
// Get access token first
const tokenResponse = https.post({
    url: 'https://apis.fedex.com/oauth/token',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-locale': 'en_US'
    },
    body: tokenRequestBody
});

// Use token for document request
const podResponse = https.post({
    url: 'https://apis.fedex.com/track/v1/trackingdocuments',
    headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US'
    },
    body: JSON.stringify(requestBody)
});
```

### Dynamic Date Range Generation
**Pattern**: Use record creation date as start, add one month for end
```javascript
const startDate = new Date(createdDate);
const endDate = new Date(startDate);
endDate.setMonth(endDate.getMonth() + 1);

const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};
```

### Account Number Mapping
**Pattern**: Build map from custom transaction record lines
```javascript
const facilityToAccountMap = {};
const lineCount = mappingRecord.getLineCount({sublistId: 'line'});

for (let i = 0; i < lineCount; i++) {
    const facilityNumber = mappingRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_wm_facility_number',
        line: i
    });
    
    const accountNumber = mappingRecord.getSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_account_number',
        line: i
    });
    
    if (facilityNumber && accountNumber) {
        facilityToAccountMap[facilityNumber] = accountNumber;
    }
}
```

### File Attachment from Base64
**Pattern**: Create file from base64 and attach to record
```javascript
const fileObj = file.create({
    name: fileName,
    fileType: file.Type.PDF,
    contents: base64Data,
    encoding: file.Encoding.BASE_64,
    folder: 7459
});

const fileId = fileObj.save();

record.attach({
    record: {
        type: 'file',
        id: fileId
    },
    to: {
        type: 'customrecord_sps_package',
        id: recordId
    }
});
```

### EDI Error Record with ASN Reference
**Pattern**: Use ASN field value instead of record ID for EDI error records
```javascript
const asnValue = packageRecord.getValue('custrecord_sps_pack_asn');

ediErrorRecord.setValue({
    fieldId: 'custrecord_edi_error_record',
    value: asnValue
});
```

## Error Handling Best Practices

### Centralized Error Handling Pattern
**Pattern**: Handle errors where they occur, avoid error bubbling
```javascript
// DON'T do this (causes duplicate error records)
try {
    // some code
} catch (error) {
    createEDIErrorRecord(recordId, error.message);
    throw error; // This causes bubbling and duplicate error records
}

// DO this instead (handles error locally)
try {
    // some code
} catch (error) {
    createEDIErrorRecord(recordId, error.message);
    return { success: false, error: error.message }; // No bubbling
}
```

### Scheduled Script URL Generation
**Problem**: `url.resolveScript()` generates relative URLs that fail HTTPS requests
**Solution**: Build fully qualified URLs manually
```javascript
// DON'T do this
const suiteletUrl = url.resolveScript({
    scriptId: 'customscript_retrieve_and_attach_pods',
    deploymentId: 'customdeploy_retrieve_and_attach_pods',
    params: { tracking: trackingNumber, recordId: recordId }
});

// DO this instead
const baseUrl = 'https://6448561.app.netsuite.com';
const suiteletUrl = `${baseUrl}/app/site/hosting/scriptlet.nl?script=2844&deploy=1&compid=6448561&tracking=${encodeURIComponent(trackingNumber)}&recordId=${recordId}`;
```

### Saved Search Deduplication
**Problem**: Saved searches with joins return duplicate records
**Solution**: Use Set to track processed IDs
```javascript
const processedPackageIds = new Set();

for (let i = 0; i < searchResultRange.length; i++) {
    const recordId = searchResultRange[i].id;
    
    if (processedPackageIds.has(recordId)) {
        log.audit('Debug', `Skipping duplicate package ${recordId}`);
        continue;
    }
    
    processedPackageIds.add(recordId);
    // Process the package
}
```

### Logging Method Issues
**Problem**: NetSuite doesn't support `log.warning` or `log.warn`
**Solution**: Use `log.audit` for warnings
```javascript
// DON'T do this
log.warning('Message'); // Not supported
log.warn('Message');    // Not supported

// DO this instead
log.audit('Warning', 'Message');
```

### Field Name Validation
**Pattern**: Always verify field names in NetSuite before using in scripts
**Common Issues**:
- `custrecord_tracking_number` vs `custrecord_sps_track_num`
- `customrecord_shipping_account_list` vs `customtransaction_shipping_account_list`
- Sublist names: `'item'` vs `'line'`

## Time Tracker Library Import Pattern

### IMPORTANT: NetSuite File Cabinet Paths
**Problem**: Scripts are organized in different local folders, but in NetSuite they're all uploaded to the same SuiteScripts folder
**Solution**: Always use `'./_dsh_lib_time_tracker'` for time tracker library imports, NOT relative paths like `'../time tracker/_dsh_lib_time_tracker'`

```javascript
// ✅ CORRECT - Use same folder pattern (all scripts in same NetSuite File Cabinet folder)
define(['N/record', 'N/log', './_dsh_lib_time_tracker'], function (record, log, timeTrackerLib) {
    // Script code
});

// ❌ WRONG - Don't use local file system paths
define(['N/record', 'N/log', '../time tracker/_dsh_lib_time_tracker'], function (record, log, timeTrackerLib) {
    // This won't work in NetSuite!
});
```

**Key Points**:
- All scripts are uploaded to the same SuiteScripts folder in NetSuite's File Cabinet
- The `./` pattern means "same folder" in NetSuite, not local file system
- If library is uploaded as a script with a script ID, use the script ID instead: `'customscript_dsh_lib_time_tracker'`
- This applies to ALL library imports in NetSuite scripts

## Repository Management Best Practices

### Adding New Scripts
**Always follow this process**:
1. **Create script in scripts/ folder**: All NetSuite scripts go in the `scripts/` directory
2. **Update README.md**: Add script description and custom logic to the Scripts section
3. **Update project structure**: Add new script to the file tree in README.md
4. **Add to troubleshooting memories**: Document any new patterns or lessons learned

### Script Documentation Template
```markdown
### scriptName.js
Brief description of what the script does.

#### Custom Logic
• Customer Name (entity ID): Description of specific logic
```

---
*Last Updated: [Current Date]*
*Project: retrieve_and_attach_PODs.js* 