# PDFlib Usage Guide for NetSuite Map/Reduce Script

## Overview
This guide explains how PDFlib is integrated into the Map/Reduce script and what functions are available.

## PDFlib Functions Exposed

The PDFlib library (pdf-lib) is wrapped in `PDFlib_WRAPPED.js` and exposes the following main functions through the `PDFLib` object:

### Core Functions Used in the Script

1. **`PDFLib.PDFDocument.create()`**
   - **Purpose**: Creates a new, empty PDF document
   - **Returns**: Promise that resolves to a PDFDocument object
   - **Usage**: `PDFLib.PDFDocument.create().then(function(pdfDoc) { ... })`

2. **`PDFLib.PDFDocument.load(bytes)`**
   - **Purpose**: Loads an existing PDF from bytes (Uint8Array)
   - **Parameters**: `bytes` - Uint8Array containing PDF data
   - **Returns**: Promise that resolves to a PDFDocument object
   - **Usage**: `PDFLib.PDFDocument.load(pdfBytes).then(function(pdfDoc) { ... })`

3. **`pdfDoc.getPageCount()`**
   - **Purpose**: Gets the number of pages in a PDF document
   - **Returns**: Number (integer)
   - **Usage**: `var pageCount = pdfDoc.getPageCount();`

4. **`pdfDoc.copyPages(sourceDoc, pageIndices)`**
   - **Purpose**: Copies pages from a source PDF document to the current document
   - **Parameters**: 
     - `sourceDoc` - The source PDFDocument to copy from
     - `pageIndices` - Array of page indices to copy (e.g., [0, 1, 2] for first 3 pages)
   - **Returns**: Array of page objects that can be added to the target document
   - **Usage**: `var copiedPages = mergedPdfDoc.copyPages(sourcePdfDoc, [0, 1, 2]);`

5. **`pdfDoc.addPage(page)`**
   - **Purpose**: Adds a page to the PDF document
   - **Parameters**: `page` - A page object (typically from `copyPages`)
   - **Returns**: The added page object
   - **Usage**: `mergedPdfDoc.addPage(copiedPage);`

6. **`pdfDoc.save()`**
   - **Purpose**: Saves the PDF document as bytes
   - **Returns**: Promise that resolves to Uint8Array containing the PDF bytes
   - **Usage**: `pdfDoc.save().then(function(bytes) { ... })`

## How to Verify PDFlib is Loaded

### Method 1: Check Execution Logs
After running the script, check the execution logs for:
- ✅ **Success**: `"PDFlib loaded successfully"` message
- ❌ **Failure**: `"PDFlib library not loaded correctly"` error

### Method 2: Add Debug Logging
You can add this to the `mergePDFs` function to verify PDFlib is loaded:

```javascript
// Check if PDFlib is loaded
log.debug('PDFlib Check', 'PDFLib type: ' + typeof PDFLib);
log.debug('PDFlib Check', 'PDFDocument exists: ' + (typeof PDFLib.PDFDocument !== 'undefined'));
log.debug('PDFlib Check', 'PDFDocument.create exists: ' + (typeof PDFLib.PDFDocument.create === 'function'));
```

### Method 3: Check for Specific Functions
The script already includes a check at the start of `mergePDFs`:

```javascript
if (!PDFLib || typeof PDFLib.PDFDocument === 'undefined') {
    log.error('mergePDFs', 'PDFlib library not loaded correctly');
    return null;
}
```

## How the Script Uses PDFlib

### Step-by-Step Process

1. **Create Empty PDF**: `PDFLib.PDFDocument.create()` creates a new PDF document to merge into

2. **Load Each Source PDF**: For each file ID:
   - Load the file from NetSuite using `file.load()`
   - Get file contents (base64-encoded string)
   - Convert to Uint8Array using `base64ToUint8Array()`
   - Load into PDFlib using `PDFLib.PDFDocument.load(pdfBytes)`

3. **Copy Pages**: For each loaded PDF:
   - Get page count using `getPageCount()`
   - Create array of all page indices `[0, 1, 2, ..., pageCount-1]`
   - Copy pages using `copyPages(sourceDoc, pageIndices)`
   - Add each copied page to merged document using `addPage()`

4. **Save Merged PDF**: 
   - Save the merged document using `pdfDoc.save()` (returns Uint8Array)
   - Convert Uint8Array to base64 using `uint8ArrayToBase64()`
   - Create new NetSuite file with the merged PDF content

## Important Notes

### Promise-Based API
PDFlib uses Promises for all async operations. Since SuiteScript 2.0 Map/Reduce scripts don't support `async/await`, the script uses `.then()` chains.

### Map/Reduce Limitation
⚠️ **Important**: Map/Reduce scripts expect synchronous operations, but PDFlib operations are asynchronous (Promise-based). The current implementation handles this by:
- Returning a Promise from `mergePDFs()`
- Handling the Promise in the `reduce()` function
- Completing the reduce function before the Promise resolves

**Potential Issue**: The reduce function may complete before the PDF merge finishes. If this causes problems, consider:
- Using a Scheduled Script instead of Map/Reduce
- Using a RESTlet for PDF merging
- Using a different approach that's more compatible with Map/Reduce

### File Path Configuration
Make sure to update the PDFlib path in the `define()` statement:

```javascript
define(['N/search', 'N/record', 'N/file', 'N/url', 'N/log', 'N/runtime', './Merge library/PDFlib_WRAPPED'], 
    function (search, record, file, url, log, runtime, PDFLib) {
```

If you uploaded `PDFlib_WRAPPED.js` to NetSuite as a SuiteScript 2.0 Library File, use the Script ID path:
- Example: `'SuiteScripts/customscript_pdflib'` (replace with your actual Script ID)

## Troubleshooting

### PDFlib Not Found
- **Error**: `"PDFlib library not loaded correctly"`
- **Solution**: 
  1. Verify the path in the `define()` statement matches your NetSuite file location
  2. Ensure `PDFlib_WRAPPED.js` is uploaded as a SuiteScript 2.0 Library File
  3. Check that the library file returns `PDFLib` correctly

### Promise Not Resolving
- **Error**: Merge never completes, or reduce function finishes before merge
- **Solution**: 
  1. Check execution logs for Promise errors
  2. Consider using a Scheduled Script instead of Map/Reduce
  3. Test with a small number of PDFs first

### File Content Conversion Errors
- **Error**: Issues converting between base64 and Uint8Array
- **Solution**: 
  1. Verify `file.getContents()` returns base64-encoded string
  2. Check that helper functions (`base64ToUint8Array`, `uint8ArrayToBase64`) are working correctly
  3. Add debug logging to see what format the file contents are in

## Additional PDFlib Functions (Not Used in This Script)

PDFlib has many other functions available. Some examples:
- `pdfDoc.addPage([width, height])` - Create a new blank page
- `pdfDoc.insertPage(index, page)` - Insert a page at a specific index
- `pdfDoc.removePage(index)` - Remove a page
- `pdfDoc.getPage(index)` - Get a specific page
- `pdfDoc.setTitle(title)` - Set PDF metadata
- `pdfDoc.setAuthor(author)` - Set PDF metadata
- And many more...

For full documentation, see: https://pdf-lib.js.org/

