# PDFlib Setup Instructions for NetSuite

## Overview
PDFlib (pdf-lib) is a JavaScript library for creating and modifying PDF documents. Since NetSuite's native `N/render` PDF merging doesn't work reliably, we use PDFlib as an alternative.

## Setup Steps

### Option 1: Upload as SuiteScript 2.0 Library (Recommended)

1. **In NetSuite, go to:** Customization > Scripting > Scripts > New

2. **Create a new SuiteScript 2.0 Library File:**
   - Click "New" > "Script"
   - Select "Script Type: SuiteScript 2.0 Library File"
   - Name it: `PDFlib` (or `PDFlib_NS`)

3. **Copy the PDFlib.js content:**
   - Open the `PDFlib.js` file from this repository
   - Copy the entire minified content (it's all on one line)
   - Paste it into the NetSuite script editor

4. **Wrap it for NetSuite:**
   - The file should start with: `define(function() {`
   - Then the PDFlib minified code
   - End with: `return PDFLib; });`
   
   Example structure:
   ```javascript
   /**
    * @NApiVersion 2.1
    * @NModuleScope SameAccount
    */
   define(function() {
       // Paste the entire PDFlib.js minified content here
       !function(t,e){"object"==typeof exports...
       
       // At the end, return PDFLib
       return PDFLib;
   });
   ```

5. **Save and Deploy:**
   - Save the library file
   - Note the Script ID (e.g., `customscript_pdflib`)

### Option 2: Use as External Library (If NetSuite supports it)

If NetSuite allows external libraries, you can reference the minified file directly, but this is less common.

## Usage in Your Scripts

Once uploaded, reference it in your scripts:

```javascript
/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/file', './PDFlib'], function(file, PDFLib) {
    
    function mergePDFs(fileIds) {
        // Load PDF files
        var pdfFiles = fileIds.map(function(id) {
            return file.load({ id: id });
        });
        
        // Convert to ArrayBuffers (you'll need to read file contents)
        // Then use PDFLib to merge:
        // var mergedPdf = await PDFLib.PDFDocument.create();
        // for each pdf: copy pages and add to mergedPdf
        // Save merged PDF back to NetSuite
        
        // Implementation details depend on how you convert NetSuite files
        // to PDFLib-compatible format
    }
    
    return {
        // your functions
    };
});
```

## Important Notes

1. **File Size:** The PDFlib.js file is large (minified). NetSuite has file size limits for scripts.

2. **File Format Conversion:** NetSuite files need to be converted to ArrayBuffer/Uint8Array for PDFLib to work. You may need to:
   - Read file contents using `file.getContents()` or `file.getContentsAsString()`
   - Convert to appropriate format for PDFLib

3. **Async Operations:** PDFLib uses Promises/async. NetSuite SuiteScript 2.0 doesn't natively support async/await, so you may need to use callbacks or wrap in Promise-like structures.

4. **Testing:** Test thoroughly as PDF manipulation can be resource-intensive.

## Alternative: Use RESTlet

If the library is too large or complex for SuiteScript, consider:
- Creating a RESTlet that uses PDFlib
- Calling the RESTlet from your Map/Reduce script
- The RESTlet can handle the PDF merging and return the merged file ID

## Troubleshooting

- **Script too large:** Split into multiple library files or use RESTlet approach
- **Module not found:** Check the Script ID and path in your define() statement
- **PDFLib undefined:** Ensure you're returning PDFLib correctly from the library file

