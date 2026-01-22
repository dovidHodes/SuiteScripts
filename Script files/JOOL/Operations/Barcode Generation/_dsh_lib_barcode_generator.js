/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Barcode Generation Library - Generates barcodes using QuickChart API
 * 
 * This library generates barcode images (PNG or SVG) from SSCC codes using the QuickChart API.
 * For GS1-128 barcodes, the format is: (00)SSCC where (00) is the application identifier
 * and SSCC is the 18-digit code (20-digit input with first 2 zeros removed).
 * 
 * API Documentation: https://quickchart.io/documentation/barcode-api/
 */

define([
  'N/https',
  'N/log',
  'N/file',
  'N/error'
], function (https, log, file, error) {
  
  /**
   * Generate barcode image from SSCC code
   * @param {string} sscc - 20-digit SSCC code
   * @param {Object} options - Options object
   * @param {string} [options.format='png'] - Output format: 'png' or 'svg'
   * @param {string} [options.type='gs1-128'] - Barcode type (default: gs1-128)
   * @param {boolean} [options.includeText=true] - Include human-readable text
   * @param {number} [options.width] - Width in pixels
   * @param {number} [options.height] - Height in pixels
   * @returns {Object} Result object with file data and metadata
   */
  function generateBarcode(sscc, options) {
    try {
      options = options || {};
      
      // Validate SSCC is 20 digits
      if (!sscc || typeof sscc !== 'string') {
        throw error.create({
          name: 'INVALID_SSCC',
          message: 'SSCC must be a string',
          notifyOff: true
        });
      }
      
      // Remove any non-digit characters
      var ssccDigits = sscc.replace(/\D/g, '');
      
      if (ssccDigits.length !== 20) {
        throw error.create({
          name: 'INVALID_SSCC_LENGTH',
          message: 'SSCC must be exactly 20 digits. Received: ' + ssccDigits.length + ' digits',
          notifyOff: true
        });
      }
      
      // Format for GS1-128: (00) + 18-digit SSCC (remove first 2 zeros)
      // Input: 00112345670000123457 (20 digits)
      // Output: (00)112345670000123457 (application identifier + 18 digits)
      var applicationIdentifier = ssccDigits.substring(0, 2); // First 2 digits
      var sscc18 = ssccDigits.substring(2); // Remaining 18 digits
      var barcodeText = '(' + applicationIdentifier + ')' + sscc18;
      
      log.debug('Barcode Text Format', 'SSCC: ' + ssccDigits + ' -> Barcode Text: ' + barcodeText);
      
      // Build API URL
      var format = options.format || 'png';
      var barcodeType = options.type || 'gs1-128';
      // Only include includeText parameter if explicitly set to true
      var includeText = options.includeText === true;
      
      // Default dimensions (can be overridden)
      var barcodeWidth = options.width || 160;
      var barcodeHeight = options.height || 40;
      
      var apiUrl = 'https://quickchart.io/barcode?' +
        'type=' + encodeURIComponent(barcodeType) +
        '&text=' + encodeURIComponent(barcodeText) +
        (includeText ? '&includeText=true' : '') +
        '&format=' + encodeURIComponent(format) +
        '&width=' + barcodeWidth +
        '&height=' + barcodeHeight;
      
      log.debug('QuickChart API URL', apiUrl);
      
      // Call QuickChart API
      var response = https.get({
        url: apiUrl
      });
      
      if (!response || !response.body) {
        throw error.create({
          name: 'API_RESPONSE_ERROR',
          message: 'No response body from QuickChart API',
          notifyOff: true
        });
      }
      
      // Debug: Log response details
      log.debug('API Response', 'Status: ' + response.code + ', Content-Type: ' + (response.headers['content-type'] || 'unknown'));
      log.debug('Response Body Length', response.body.length + ' bytes');
      log.debug('Response Body Preview', 'First 100 bytes: ' + response.body.substring(0, 100));
      
      // Check if response is successful
      if (response.code !== 200) {
        throw error.create({
          name: 'API_ERROR',
          message: 'QuickChart API returned error code: ' + response.code + ', Body: ' + response.body.substring(0, 500),
          notifyOff: true
        });
      }
      
      // Determine file type from format
      // NetSuite file types: Use string values that NetSuite recognizes
      // PNG files use 'PNGIMAGE', SVG files use 'SVG'
      var fileType = format === 'svg' ? 'SVG' : 'PNGIMAGE';
      var fileExtension = format === 'svg' ? 'svg' : 'png';
      
      log.debug('File Type Selected', 'Format: ' + format + ', FileType: ' + fileType);
      
      // Handle response body - NetSuite's https.get returns body as string
      // The API returns PNG as base64-encoded string (starts with "iVBORw0KGgo...")
      var fileData = response.body;
      
      // For PNG, the response is base64-encoded
      // NetSuite's file.create can accept base64 strings directly for PNG files
      // The fileType will tell NetSuite how to interpret the data
      if (format === 'png' && typeof fileData === 'string' && fileData.length > 0) {
        // Check if it's base64 (starts with "iVBORw0KGgo" or similar)
        // PNG files in base64 start with "iVBORw0KGgo"
        if (fileData.substring(0, 4) === 'iVBOR' || fileData.substring(0, 4) === 'iVBOR') {
          log.debug('PNG Data Format', 'PNG data is base64-encoded, length: ' + fileData.length);
          // NetSuite's file.create will handle base64 strings when fileType is PNG
        } else {
          log.debug('PNG Data Format', 'PNG data format: ' + fileData.substring(0, 20) + ', length: ' + fileData.length);
        }
      }
      
      // Ensure fileType is properly set
      if (!fileType) {
        log.error('FileType Not Set', 'Format: ' + format + ', fileType should be set but is: ' + fileType);
        fileType = format === 'svg' ? file.Type.SVG : file.Type.PNG;
      }
      
      // Return result object with file data
      var result = {
        success: true,
        format: format,
        fileType: fileType,
        fileExtension: fileExtension,
        data: fileData,
        barcodeText: barcodeText,
        sscc: ssccDigits,
        size: fileData.length,
        contentType: response.headers['content-type'] || (format === 'svg' ? 'image/svg+xml' : 'image/png')
      };
      
      log.debug('Barcode Generated', 'Format: ' + format + ', FileType: ' + fileType + ', Size: ' + result.size + ' bytes, Barcode Text: ' + barcodeText);
      log.debug('Barcode Result Object', 'fileType: ' + result.fileType + ', fileExtension: ' + result.fileExtension + ', hasData: ' + (result.data ? 'yes' : 'no'));
      
      return result;
      
    } catch (err) {
      log.error('generateBarcode Error', 'SSCC: ' + sscc + ', Error: ' + err.toString());
      throw err;
    }
  }
  
  
  /**
   * Generate barcode and return as base64 data URI (for embedding in HTML/PDF)
   * @param {string} sscc - 20-digit SSCC code
   * @param {Object} options - Options object (same as generateBarcode)
   * @returns {string} Data URI string (e.g., "data:image/png;base64,...")
   */
  function generateBarcodeDataUri(sscc, options) {
    try {
      // Generate barcode
      var barcodeResult = generateBarcode(sscc, options);
      
      // Convert to base64
      var base64Data = barcodeResult.data;
      
      // If data is already a string (SVG), encode it
      // If it's binary (PNG), we need to handle it differently
      // NetSuite's https.get returns body as string, but PNG is binary
      // We'll need to handle this based on format
      
      var dataUri;
      if (barcodeResult.format === 'svg') {
        // SVG is text, just encode it
        dataUri = 'data:image/svg+xml;base64,' + base64Data;
      } else {
        // PNG is binary - the response.body should already be the binary data
        // In NetSuite, we may need to convert it properly
        // For now, we'll return the data and let the caller handle it
        // Note: NetSuite's file.create can handle binary data directly
        dataUri = 'data:image/png;base64,' + base64Data;
      }
      
      return dataUri;
      
    } catch (err) {
      log.error('generateBarcodeDataUri Error', 'SSCC: ' + sscc + ', Error: ' + err.toString());
      throw err;
    }
  }
  
  return {
    generateBarcode: generateBarcode,
    generateBarcodeDataUri: generateBarcodeDataUri
  };
});

