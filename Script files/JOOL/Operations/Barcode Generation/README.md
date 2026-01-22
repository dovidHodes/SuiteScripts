# Barcode Generation

This library generates barcode images using the QuickChart API for SSCC codes.

## Overview

The library generates GS1-128 barcodes from 20-digit SSCC codes. The SSCC format is converted to the GS1-128 format: `(00)SSCC` where:
- `(00)` is the application identifier (first 2 digits of the 20-digit SSCC)
- `SSCC` is the remaining 18 digits

## API Documentation

QuickChart Barcode API: https://quickchart.io/documentation/barcode-api/

## Usage

### Generate Barcode

```javascript
var barcodeLib = require('./_dsh_lib_barcode_generator');

// Generate barcode (returns result object with file data)
var result = barcodeLib.generateBarcode('00112345670000123457', {
  format: 'png',        // 'png' or 'svg'
  type: 'gs1-128',      // Barcode type
  includeText: true,    // Include human-readable text
  width: 300,          // Optional: width in pixels
  height: 100          // Optional: height in pixels
});

// Result object contains:
// - success: boolean
// - format: 'png' or 'svg'
// - fileType: NetSuite file type
// - fileExtension: 'png' or 'svg'
// - data: Binary/string data from API
// - barcodeText: Formatted barcode text (e.g., "(00)112345670000123457")
// - sscc: Original 20-digit SSCC
// - size: Data size in bytes
// - contentType: MIME type
```

### Save Barcode File (Caller's Responsibility)

The barcode generator only returns image data. The caller is responsible for saving the file:

```javascript
var barcodeLib = require('./_dsh_lib_barcode_generator');
var file = require('N/file');

// Generate barcode (returns image data)
var result = barcodeLib.generateBarcode('00112345670000123457', {
  format: 'png',
  type: 'gs1-128',
  includeText: true
});

// Save file yourself
var barcodeFile = file.create({
  name: 'SSCC_Barcode_12345.png',
  fileType: file.Type.PNG,
  contents: result.data,
  folder: 1373,
  description: 'Barcode for SSCC: 00112345670000123457'
});

var fileId = barcodeFile.save();
```

### Generate Barcode Data URI

```javascript
var barcodeLib = require('./_dsh_lib_barcode_generator');

// Generate barcode as data URI (for embedding in HTML/PDF)
var dataUri = barcodeLib.generateBarcodeDataUri('00112345670000123457', {
  format: 'png'
});

// Returns: "data:image/png;base64,..."
```

## SSCC Format Conversion

**Input:** 20-digit SSCC (e.g., `00112345670000123457`)
- First 2 digits: `00` (application identifier)
- Remaining 18 digits: `112345670000123457` (SSCC-18)

**Output for GS1-128:** `(00)112345670000123457`
- Application identifier in parentheses: `(00)`
- 18-digit SSCC code: `112345670000123457`

## Integration with Pallet Labels

The barcode generator is automatically called by the pallet label generator:

1. **Before PDF Generation**: The pallet label generator gets the SSCC from the pallet record
2. **Barcode Generation**: Calls this library to generate the barcode image data
3. **File Saving**: The pallet label generator saves the barcode file to the file cabinet
4. **File Attachment**: Attaches the barcode file to the pallet record
5. **Template Integration**: Adds `barcodeImageUrl` to the JSON data for use in the PDF template

**Note**: The barcode generator only returns image data. The pallet label generator handles all file operations (saving, attaching, URL generation).

### Template Usage

In your Advanced PDF/HTML template, you can use the barcode image:

```html
<#if barcodeImageUrl??>
  <img src="${barcodeImageUrl}" alt="SSCC Barcode" />
</#if>
```

Or display the SSCC text:

```html
<#if ssccBarcode??>
  <p>SSCC: ${ssccBarcode}</p>
</#if>
```

## Supported Formats

- **PNG**: Raster image format (default)
- **SVG**: Vector image format

## Supported Barcode Types

Currently configured for `gs1-128`, but the API supports many types. See [QuickChart documentation](https://quickchart.io/documentation/barcode-api/) for full list.

## Error Handling

The library includes comprehensive error handling:
- Validates SSCC is exactly 20 digits
- Handles API errors gracefully
- Logs detailed debug information
- Returns structured error objects

## Debugging

The library logs detailed information:
- API URL being called
- Response status and content type
- Response body length and preview
- Generated barcode text format

Check execution logs for debugging information.

