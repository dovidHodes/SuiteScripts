# Pallet Label Suitelet Usage

## Suitelet Parameters

The Suitelet accepts the following URL parameters:

### Required (one of):
- **`palletid`** (string) - Pallet record internal ID
  - Example: `palletid=123`
  - Use this when calling from a pallet record

### Optional:
- **`ifid`** (string) - Item Fulfillment internal ID
  - Example: `ifid=456`
  - Use this when you want to generate a label from an IF (requires `palletnumber` if multiple pallets exist)
  
- **`palletnumber`** (string) - Pallet number/name to filter
  - Example: `palletnumber=Pallet 1`
  - Only used when `ifid` is provided and there are multiple pallets

## Suitelet URL Format

### From Pallet Record (Recommended)
```
/app/site/hosting/scriptlet.nl?script=customscript_dsh_sl_pallet_label&deploy=customdeploy_dsh_sl_pallet_label&palletid=123
```

### From Item Fulfillment (with specific pallet)
```
/app/site/hosting/scriptlet.nl?script=customscript_dsh_sl_pallet_label&deploy=customdeploy_dsh_sl_pallet_label&ifid=456&palletnumber=Pallet 1
```

## Suitelet Script Parameters (Deployment Settings)

These are set in the Suitelet deployment, not URL parameters:

- **`custscript_dsh_pallet_label_folder_id`** (Number)
  - File cabinet folder ID where PDFs are stored
  - Default: `1373`

- **`custscript_dsh_pallet_label_template_id`** (Text)
  - Advanced PDF/HTML Template ID to use
  - Default: `CUSTTMPL_DSH_PALLET_LABEL`

## Response Format

### Success Response
```json
{
  "success": true,
  "fileId": "789",
  "pdfUrl": "https://...",
  "message": "Pallet label PDF generated successfully"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message here"
}
```

## Calling from Pallet Record

### Direct URL Call

From any script, workflow, or button, you can call the Suitelet directly:

```javascript
var suiteletURL = url.resolveScript({
  scriptId: 'customscript_dsh_sl_pallet_label',
  deploymentId: 'customdeploy_dsh_sl_pallet_label',
  params: {
    palletid: palletId
  }
});

// Then use in workflow action, button, or redirect
```

### Direct Function Call (From Script)

```javascript
define(['./_dsh_lib_pallet_label_generator'], function(palletLabelLib) {
  
  var result = palletLabelLib.generatePalletLabel(
    palletId,        // Pallet record ID
    null,            // IF ID (not needed if palletId provided)
    1373,            // PDF folder ID (optional, defaults to 1373)
    'CUSTTMPL_DSH_PALLET_LABEL', // Template ID (optional)
    {                // Options
      attachToRecord: true
    }
  );
  
  if (result.success) {
    log.audit('Success', 'PDF generated: ' + result.fileId);
  } else {
    log.error('Error', result.error);
  }
});
```

## Examples

### Example 1: From Workflow
Create a workflow action that calls the Suitelet URL with the pallet record ID.

### Example 2: From Scheduled Script
```javascript
// Search for pallets that need labels
var palletSearch = search.create({
  type: 'customrecord_asn_pallet',
  filters: [
    // Add your filters here
  ],
  columns: ['internalid']
});

palletSearch.run().each(function(result) {
  var palletId = result.id;
  
  // Call library directly (more efficient than Suitelet)
  var result = palletLabelLib.generatePalletLabel(
    palletId,
    null,
    1373,
    'CUSTTMPL_DSH_PALLET_LABEL',
    { attachToRecord: true }
  );
  
  return true;
});
```

## Notes

- The Suitelet uses **GET** method only
- PDFs are automatically attached to the pallet record (or IF if called with `ifid`)
- The template uses data from the pallet record and its parent IF record
- All IF fields are accessed via `custrecord_parent_if.fieldname` in the template

