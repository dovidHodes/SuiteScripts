# EDI Error Record Structure Reference

## Record Type
- **Internal ID**: `customrecord_edi_error`

## Required Fields
- **Record**: `custrecord_edi_error_record` (Transaction ID - Invoice ID, Sales Order ID, Item Fulfillment ID, etc.)
- **Action**: `custrecord233` (Set to internal ID 8 for general errors, 9 for Get POD)
- **Trading Partner**: `custrecord232` (Entity ID)
- **Error Message**: `custrecord234` (Long text field)
- **Status**: `custrecord235` (Set to internal ID 1 - New)

## Optional Fields
- **PO Number**: `custrecord_edi_error_po_number` (Free-form text)
- **Package Record**: `custrecord236` (Package record ID for POD-related errors)

## Action Internal IDs
- **1**: Create sales order
- **2**: Send ASN
- **3**: Send Invoice
- **4**: Send Routing Request
- **5**: Other
- **6**: Updating Invoice Payment Status
- **7**: Create IF for Westmark
- **8**: Auto Approve EDI
- **9**: Fetch PODs

## Field Usage by Script Type

### Invoice/Item Fulfillment Scripts
- **Record Field**: `custrecord_edi_error_record` - Use Invoice ID or Item Fulfillment ID
- **Action**: `custrecord233` - Use internal ID 8 (Auto Approve EDI)
- **Package Record**: `custrecord236` - Not used

### POD Retrieval Scripts
- **Record Field**: `custrecord_edi_error_record` - Use Package record ID
- **Action**: `custrecord233` - Use internal ID 9 (Fetch PODs)
- **Package Record**: `custrecord236` - Use Package record ID (same as Record field)

## Usage Examples

### For Invoice/Item Fulfillment Scripts
```javascript
function createEDIErrorRecord(invoiceId, errorMessage, tradingPartnerId) {
    const ediErrorRecord = record.create({
        type: 'customrecord_edi_error'
    });
    
    ediErrorRecord.setValue({
        fieldId: 'custrecord_edi_error_record',
        value: invoiceId // Invoice ID or Item Fulfillment ID
    });
    
    ediErrorRecord.setValue({
        fieldId: 'custrecord233', // Action field
        value: 8 // Auto Approve EDI
    });
    
    ediErrorRecord.setValue({
        fieldId: 'custrecord234', // Error Message field
        value: errorMessage
    });

    ediErrorRecord.setValue({
        fieldId: 'custrecord235', // Status field
        value: 1 // New
    });

    if (tradingPartnerId) {
        ediErrorRecord.setValue({
            fieldId: 'custrecord232', // Trading Partner field
            value: tradingPartnerId
        });
    }
    
    return ediErrorRecord.save();
}
```

### For POD Retrieval Scripts
```javascript
function createEDIErrorRecord(packageRecordId, errorMessage, tradingPartnerId) {
    const ediErrorRecord = record.create({
        type: 'customrecord_edi_error'
    });
    
    ediErrorRecord.setValue({
        fieldId: 'custrecord_edi_error_record',
        value: packageRecordId // Package record ID
    });
    
    ediErrorRecord.setValue({
        fieldId: 'custrecord233', // Action field
        value: 9 // Fetch PODs
    });
    
    ediErrorRecord.setValue({
        fieldId: 'custrecord234', // Error Message field
        value: errorMessage
    });

    ediErrorRecord.setValue({
        fieldId: 'custrecord235', // Status field
        value: 1 // New
    });

    if (tradingPartnerId) {
        ediErrorRecord.setValue({
            fieldId: 'custrecord232', // Trading Partner field
            value: tradingPartnerId
        });
    }
    
    // For POD scripts, also set the package record field
    ediErrorRecord.setValue({
        fieldId: 'custrecord236', // Package Record field
        value: packageRecordId
    });
    
    return ediErrorRecord.save();
}
``` 