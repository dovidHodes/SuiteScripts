# Pallet Label Generation

## Overview

This project generates pallet label PDFs using NetSuite's Advanced PDF/HTML Template system, following the same pattern as the BOL generation scripts.

## Architecture

The pallet label generation uses a **Library Script** that can be called from anywhere:

```
Any Script (Suitelet, Scheduled, Map/Reduce, etc.)
    ↓
Library Script (_dsh_lib_pallet_label_generator.js)
    ↓
Advanced PDF/HTML Template (_dsh_pallet_label_template.xml)
    ↓
Pallet Label PDF Generated
```

## Files

### `_dsh_lib_pallet_label_generator.js` - **Library Script** ⭐
- **Purpose**: Contains all shared pallet label generation logic
- **Key Functions**:
  - `generatePalletLabel(palletId, ifId, pdfFolderId, templateId, options)` - Main function
  - `collectPalletData(palletId)` - Collects data from pallet record
  - `collectIFPalletData(ifId, options)` - Collects data from IF (for all pallets)
  - `renderPalletLabelPdf(jsonData, recordId, pdfFolderId, templateId)` - Generates PDF

### `_dsh_sl_pallet_label_generate.js` - **Suitelet** (Optional)
- **Purpose**: HTTP endpoint for manual pallet label generation
- **Script ID**: `customscript_dsh_sl_pallet_label`
- **Deployment ID**: `customdeploy_dsh_sl_pallet_label`
- **Parameters**:
  - `custscript_dsh_pallet_label_folder_id` (Number) - File cabinet folder ID for PDFs
  - `custscript_dsh_pallet_label_template_id` (Text) - Advanced PDF/HTML Template ID (optional)

### `_dsh_pallet_label_template.xml` - **Advanced PDF/HTML Template**
- **Purpose**: Defines pallet label PDF layout
- **Template ID**: `CUSTTMPL_DSH_PALLET_LABEL` (default)
- **Location**: Customization → Forms → Advanced PDF/HTML Templates
- **Data Source**: Library script passes `jsonData` object to template
- **Template Access**: `${JSON.record.fieldName}` in template

## Setup

### 1. Upload Library Script

1. Navigate to **Customization → Scripting → Scripts → New**
2. Upload `_dsh_lib_pallet_label_generator.js`
3. Set Script Type: **Library**
4. **Note the Script ID** - it will be something like `customscript_dsh_lib_pallet_label_generator`

### 2. Upload Suitelet (Optional)

1. Navigate to **Customization → Scripting → Scripts → New**
2. Upload `_dsh_sl_pallet_label_generate.js`
3. Set Script Type: **Suitelet**
4. Set Script ID: `customscript_dsh_sl_pallet_label`
5. Set Deployment ID: `customdeploy_dsh_sl_pallet_label`
6. Add Script Parameter:
   - `custscript_dsh_pallet_label_folder_id` (Number) - Default: 1373
   - `custscript_dsh_pallet_label_template_id` (Text) - Default: `CUSTTMPL_DSH_PALLET_LABEL`

### 3. Create Advanced PDF/HTML Template

1. Navigate to **Customization → Forms → Advanced PDF/HTML Templates → New**
2. Set Template ID: `CUSTTMPL_DSH_PALLET_LABEL`
3. Set Name: "DSH Pallet Label"
4. Copy contents from `_dsh_pallet_label_template.xml`
5. **Customize the template** based on your sample PDF (see below)
6. Save

## Usage

### From Suitelet (HTTP Request)

```
GET /app/site/hosting/scriptlet.nl?script=customscript_dsh_sl_pallet_label&deploy=customdeploy_dsh_sl_pallet_label&palletid=123
```

Or with IF ID and pallet number:

```
GET /app/site/hosting/scriptlet.nl?script=customscript_dsh_sl_pallet_label&deploy=customdeploy_dsh_sl_pallet_label&ifid=456&palletnumber=Pallet 1
```

### From Any Script (Direct Function Call)

```javascript
define(['./_dsh_lib_pallet_label_generator'], function(palletLabelLib) {
  
  // Generate label for specific pallet
  var result = palletLabelLib.generatePalletLabel(
    '123',           // palletId
    null,            // ifId (not needed if palletId provided)
    1373,            // pdfFolderId
    'CUSTTMPL_DSH_PALLET_LABEL', // templateId (optional)
    {                // options
      attachToRecord: true
    }
  );
  
  // Or generate label from IF
  var result = palletLabelLib.generatePalletLabel(
    null,            // palletId (not needed if ifId provided)
    '456',           // ifId
    1373,            // pdfFolderId
    'CUSTTMPL_DSH_PALLET_LABEL', // templateId
    {                // options
      palletNumber: 'Pallet 1',
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

## Template Customization

### Available Data Fields

The template receives a `jsonData` object with the following structure:

```javascript
{
  palletId: "123",
  palletName: "Pallet 1 - IF 456",
  palletNumber: "Pallet 1 - IF 456",
  date: "01/15/2025",
  packages: [
    {
      packageId: "pkg1",
      packageName: "PKG-001",
      weight: 25.5
    }
  ],
  packageCount: 5,
  totalWeight: "125.50",
  ifId: "456",
  ifTranId: "IF-001",
  poNumber: "PO-12345",
  customerName: "ABC Company",
  shipToAddress: {
    company: "ABC Company",
    address1: "123 Main St",
    address2: "",
    city: "New York",
    state: "NY",
    zip: "10001",
    country: "United States"
  },
  shipFromAddress: {
    fullAddress: "456 Warehouse Rd<br/>City, State 12345",
    locationName: "Main Warehouse"
  },
  locationName: "Main Warehouse",
  barcode: "123",  // Pallet ID for barcode generation
  qrCode: "123"    // Pallet ID for QR code generation
}
```

### Template Syntax

Access data in the template using FreeMarker syntax:

```xml
${record.palletName}           <!-- Pallet name -->
${record.date}                 <!-- Date -->
${record.packageCount}         <!-- Number of packages -->
${record.totalWeight}          <!-- Total weight -->
${record.shipToAddress.company} <!-- Customer company -->
```

### Customizing Based on Sample PDF

1. **Upload your sample PDF** to the File Cabinet
2. **Examine the layout** - note fields, positions, fonts, sizes
3. **Update the template XML** to match:
   - Adjust table structure
   - Change font sizes and styles
   - Reposition elements
   - Add/remove fields
   - Customize barcode area
4. **Test** by generating a label and comparing to sample

### Example: Adding a Barcode

If you need to generate a barcode, you can use NetSuite's barcode functions or add a placeholder:

```xml
<div class="barcode-area">
    <#-- Barcode will be generated here -->
    <span style="font-size: 16pt; font-family: 'Code 128';">${record.barcode}</span>
</div>
```

## Response Format

```json
{
  "success": true,
  "fileId": "789",
  "pdfUrl": "https://...",
  "message": "Pallet label PDF generated successfully"
}
```

Or on error:

```json
{
  "success": false,
  "error": "Error message here"
}
```

## Integration Examples

### Generate Labels for All Pallets on an IF

```javascript
// In a Map/Reduce or Scheduled Script
var palletSearch = search.create({
  type: 'customrecord_pallet',
  filters: [
    ['custrecord_parent_if', 'anyof', ifId]
  ],
  columns: ['internalid', 'name']
});

palletSearch.run().each(function(result) {
  var palletId = result.id;
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

### Add Button to Pallet Record

Create a User Event script that adds a "Generate Label" button to pallet records, similar to the BOL button pattern.

## Troubleshooting

### Template Not Found
- Verify template ID matches: `CUSTTMPL_DSH_PALLET_LABEL`
- Check template is saved and published in NetSuite
- Verify template ID in script parameter matches

### Data Not Showing in Template
- Check field names match between library and template
- Use `${record.fieldName!''}` to handle missing fields gracefully
- Check execution logs for data being passed to template

### PDF Not Generating
- Verify folder ID exists and is accessible
- Check script permissions
- Review execution logs for errors

## Related Scripts

- **BOL Generation**: `../BOL/` - Similar template generation pattern
- **Pallet Assignment**: `../Pallet Assignment/` - Creates pallet records

