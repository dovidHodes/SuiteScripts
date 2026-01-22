/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Generic PDF Merging Library - Reusable library for merging multiple PDFs into one
 * 
 * This library can be called from anywhere (Suitelet, Scheduled Script, Map/Reduce, etc.)
 * to merge multiple PDFs into a single PDF file using PDFlib.
 */

// Polyfills for btoa and atob (browser APIs not available in NetSuite)
// These MUST be defined BEFORE the define() call so PDFlib can access them

/**
 * NetSuite-compatible base64 encode (polyfill for btoa)
 * @param {string} binary - Binary string to encode
 * @returns {string} Base64 encoded string
 */
function base64EncodePolyfill(binary) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = '';
    var i = 0;
    while (i < binary.length) {
        var a = binary.charCodeAt(i++);
        var b = i < binary.length ? binary.charCodeAt(i++) : 0;
        var c = i < binary.length ? binary.charCodeAt(i++) : 0;
        var bitmap = (a << 16) | (b << 8) | c;
        output += chars.charAt((bitmap >> 18) & 63);
        output += chars.charAt((bitmap >> 12) & 63);
        output += i - 2 < binary.length ? chars.charAt((bitmap >> 6) & 63) : '=';
        output += i - 1 < binary.length ? chars.charAt(bitmap & 63) : '=';
    }
    return output;
}

/**
 * NetSuite-compatible base64 decode (polyfill for atob)
 * @param {string} base64 - Base64 encoded string
 * @returns {string} Decoded binary string
 */
function base64DecodePolyfill(base64) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = '';
    var i = 0;
    base64 = base64.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    while (i < base64.length) {
        var enc1 = chars.indexOf(base64.charAt(i++));
        var enc2 = chars.indexOf(base64.charAt(i++));
        var enc3 = chars.indexOf(base64.charAt(i++));
        var enc4 = chars.indexOf(base64.charAt(i++));
        var bitmap = (enc1 << 18) | (enc2 << 12) | (enc3 << 6) | enc4;
        if (enc3 === 64) {
            output += String.fromCharCode((bitmap >> 16) & 255);
        } else if (enc4 === 64) {
            output += String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255);
        } else {
            output += String.fromCharCode((bitmap >> 16) & 255, (bitmap >> 8) & 255, bitmap & 255);
        }
    }
    return output;
}

/**
 * NetSuite-compatible setTimeout polyfill (PDFlib needs this)
 * @param {Function} callback - Function to execute
 * @param {number} delay - Delay in milliseconds (ignored in NetSuite)
 * @returns {number} Timer ID (for compatibility)
 */
function setTimeoutPolyfill(callback, delay) {
    // In NetSuite, execute immediately since we're in a synchronous environment
    if (typeof callback === 'function') {
        callback();
    }
    return 1;
}

/**
 * NetSuite-compatible clearTimeout polyfill (PDFlib needs this)
 * @param {number} timerId - Timer ID to clear (ignored in NetSuite)
 */
function clearTimeoutPolyfill(timerId) {
    // No-op in NetSuite since we execute immediately
}

// Assign to global scope for PDFlib to access
if (typeof global !== 'undefined') {
    global.btoa = base64EncodePolyfill;
    global.atob = base64DecodePolyfill;
    global.setTimeout = setTimeoutPolyfill;
    global.clearTimeout = clearTimeoutPolyfill;
} else if (typeof window !== 'undefined') {
    window.btoa = base64EncodePolyfill;
    window.atob = base64DecodePolyfill;
    window.setTimeout = setTimeoutPolyfill;
    window.clearTimeout = clearTimeoutPolyfill;
} else {
    // In SuiteScript, assign without var to make them global
    btoa = base64EncodePolyfill;
    atob = base64DecodePolyfill;
    setTimeout = setTimeoutPolyfill;
    clearTimeout = clearTimeoutPolyfill;
}

define([
  'N/file',
  'N/log',
  'N/url',
  './PDFlib_WRAPPED'
], function (file, log, url, PDFLib) {
  
  /**
   * Merges multiple PDFs into one
   * @param {Array<string>} fileIds - Array of file internal IDs to merge
   * @param {string} fileName - Name for the merged PDF file
   * @param {number} folderId - File cabinet folder ID (optional)
   * @param {boolean} duplicatePages - If true, duplicate each page (for pallet labels - one per side)
   * @returns {Object} {success: true/false, fileId: string, pdfUrl: string, error: string}
   */
  function mergePDFs(fileIds, fileName, folderId, duplicatePages) {
    try {
      if (!fileIds || fileIds.length === 0) {
        return { success: false, error: 'No file IDs provided' };
      }
      
      // Default duplicatePages to false for backward compatibility
      duplicatePages = duplicatePages === true;
      
      if (!PDFLib || typeof PDFLib.PDFDocument === 'undefined') {
        log.error('mergePDFs', 'PDFlib not loaded correctly');
        return { success: false, error: 'PDFlib not loaded' };
      }
      
      log.debug('mergePDFs', 'Starting to merge ' + fileIds.length + ' PDF file(s)' + (duplicatePages ? ' (with page duplication)' : ''));
      
      // Sanitize filename
      if (fileName) {
        fileName = fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
      } else {
        fileName = 'Merged_PDF_' + new Date().getTime() + '.pdf';
      }
      
      // Convert base64 to Uint8Array helper
      function base64ToUint8Array(base64) {
        var base64Data = base64.replace(/^data:.*?;base64,/, '');
        var binary = base64DecodePolyfill(base64Data);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      }
      
      // Convert Uint8Array to base64 helper
      function uint8ArrayToBase64(bytes) {
        var binary = '';
        for (var i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return base64EncodePolyfill(binary);
      }
      
      // Merge PDFs using Promise chain
      return PDFLib.PDFDocument.create().then(function(mergedPdfDoc) {
        log.debug('mergePDFs', 'Created merged PDF document');
        
        var loadPromises = [];
        
        // Load each PDF
        for (var i = 0; i < fileIds.length; i++) {
          try {
            var pdfFile = file.load({ id: fileIds[i] });
            var fileContents = pdfFile.getContents();
            var pdfBytes = base64ToUint8Array(fileContents);
            loadPromises.push(PDFLib.PDFDocument.load(pdfBytes));
          } catch (e) {
            log.error('mergePDFs', 'Error loading file ' + fileIds[i] + ': ' + e.toString());
          }
        }
        
        // Process PDFs sequentially
        return processPDFs(loadPromises, mergedPdfDoc, duplicatePages);
        
      }).then(function(mergedPdfDoc) {
        log.debug('mergePDFs', 'All PDFs processed, saving merged document');
        return mergedPdfDoc.save();
        
      }).then(function(mergedPdfBytes) {
        log.debug('mergePDFs', 'Merged PDF bytes generated (' + mergedPdfBytes.length + ' bytes), saving to NetSuite');
        
        var base64Content = uint8ArrayToBase64(mergedPdfBytes);
        var mergedFile = file.create({
          name: fileName,
          fileType: file.Type.PDF,
          contents: base64Content,
          folder: folderId || null
        });
        
        var mergedFileId = mergedFile.save();
        log.audit('mergePDFs', 'Merged PDF saved with ID: ' + mergedFileId + ', Name: ' + fileName);
        
        // Get PDF URL
        var pdfUrl = '';
        try {
          var pdfFileObj = file.load({ id: mergedFileId });
          var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
          pdfUrl = 'https://' + domain + pdfFileObj.url;
        } catch (urlError) {
          log.error('mergePDFs', 'Error getting PDF URL: ' + urlError.toString());
        }
        
        return {
          success: true,
          fileId: mergedFileId,
          pdfUrl: pdfUrl
        };
        
      }).catch(function(error) {
        log.error('mergePDFs', 'Error merging PDFs: ' + error.toString());
        return { success: false, error: error.message || error.toString() };
      });
      
    } catch (e) {
      log.error('mergePDFs', 'Error: ' + e.toString());
      return { success: false, error: e.message || e.toString() };
    }
  }
  
  /**
   * Processes PDFs sequentially to merge them into the target document
   * @param {Array<Promise>} loadPromises - Array of PDF loading promises
   * @param {Object} mergedPdfDoc - The target PDF document to merge into
   * @param {boolean} duplicatePages - If true, duplicate each page
   * @returns {Promise} Promise that resolves when all PDFs are merged
   */
  function processPDFs(loadPromises, mergedPdfDoc, duplicatePages) {
    if (loadPromises.length === 0) {
      return Promise.resolve(mergedPdfDoc);
    }
    
    return loadPromises[0].then(function(sourcePdfDoc) {
      var pageCount = sourcePdfDoc.getPageCount();
      log.debug('processPDFs', 'PDF has ' + pageCount + ' page(s)');
      
      if (pageCount === 0) {
        return processPDFs(loadPromises.slice(1), mergedPdfDoc, duplicatePages);
      }
      
      // Build array of all page indices
      var pageIndices = [];
      for (var i = 0; i < pageCount; i++) {
        pageIndices.push(i);
      }
      
      if (duplicatePages) {
        // Copy pages TWICE - once for original, once for duplicate (warehouse needs one on each side of pallet)
        var copyResult1 = mergedPdfDoc.copyPages(sourcePdfDoc, pageIndices);
        var copyPromise1 = (copyResult1 && typeof copyResult1.then === 'function') 
          ? copyResult1 
          : Promise.resolve(copyResult1);
        
        // Copy pages again for the duplicate
        var copyResult2 = mergedPdfDoc.copyPages(sourcePdfDoc, pageIndices);
        var copyPromise2 = (copyResult2 && typeof copyResult2.then === 'function') 
          ? copyResult2 
          : Promise.resolve(copyResult2);
        
        // Wait for both copies to complete
        return Promise.all([copyPromise1, copyPromise2]).then(function(results) {
          var copiedPages1 = results[0];
          var copiedPages2 = results[1];
          
          // Handle different return types from copyPages - first copy
          var pages1 = [];
          if (Array.isArray(copiedPages1)) {
            pages1 = copiedPages1;
          } else if (copiedPages1 && typeof copiedPages1.length !== 'undefined') {
            for (var j = 0; j < copiedPages1.length; j++) {
              if (copiedPages1[j] !== undefined && copiedPages1[j] !== null) {
                pages1.push(copiedPages1[j]);
              }
            }
          } else if (copiedPages1) {
            pages1 = [copiedPages1];
          }
          
          // Handle different return types from copyPages - second copy
          var pages2 = [];
          if (Array.isArray(copiedPages2)) {
            pages2 = copiedPages2;
          } else if (copiedPages2 && typeof copiedPages2.length !== 'undefined') {
            for (var j = 0; j < copiedPages2.length; j++) {
              if (copiedPages2[j] !== undefined && copiedPages2[j] !== null) {
                pages2.push(copiedPages2[j]);
              }
            }
          } else if (copiedPages2) {
            pages2 = [copiedPages2];
          }
          
          // Add each page from first copy to merged document
          for (var k = 0; k < pages1.length; k++) {
            if (pages1[k] && typeof pages1[k] === 'object') {
              try {
                mergedPdfDoc.addPage(pages1[k]);
              } catch (addError) {
                log.error('processPDFs', 'Error adding page (first copy): ' + addError.toString());
              }
            }
          }
          
          // Add each page from second copy to merged document (duplicate for other side of pallet)
          for (var k = 0; k < pages2.length; k++) {
            if (pages2[k] && typeof pages2[k] === 'object') {
              try {
                mergedPdfDoc.addPage(pages2[k]);
              } catch (addError) {
                log.error('processPDFs', 'Error adding page (second copy): ' + addError.toString());
              }
            }
          }
          
          log.debug('processPDFs', 'Added ' + (pages1.length * 2) + ' page(s) from PDF (duplicated for both sides of pallet)');
          
          // Continue with next PDF
          return processPDFs(loadPromises.slice(1), mergedPdfDoc, duplicatePages);
          
        }).catch(function(copyError) {
          log.error('processPDFs', 'Error copying pages: ' + copyError.toString());
          // Continue with next PDF even if this one failed
          return processPDFs(loadPromises.slice(1), mergedPdfDoc, duplicatePages);
        });
      } else {
        // Original behavior - single copy (for carton labels or other uses)
        var copyResult = mergedPdfDoc.copyPages(sourcePdfDoc, pageIndices);
        var copyPromise = (copyResult && typeof copyResult.then === 'function') 
          ? copyResult 
          : Promise.resolve(copyResult);
        
        return copyPromise.then(function(copiedPages) {
          // Handle different return types from copyPages
          var pages = [];
          if (Array.isArray(copiedPages)) {
            pages = copiedPages;
          } else if (copiedPages && typeof copiedPages.length !== 'undefined') {
            for (var j = 0; j < copiedPages.length; j++) {
              if (copiedPages[j] !== undefined && copiedPages[j] !== null) {
                pages.push(copiedPages[j]);
              }
            }
          } else if (copiedPages) {
            pages = [copiedPages];
          }
          
          // Add each page to merged document
          for (var k = 0; k < pages.length; k++) {
            if (pages[k] && typeof pages[k] === 'object') {
              try {
                mergedPdfDoc.addPage(pages[k]);
              } catch (addError) {
                log.error('processPDFs', 'Error adding page: ' + addError.toString());
              }
            }
          }
          
          log.debug('processPDFs', 'Added ' + pages.length + ' page(s) from PDF');
          
          // Continue with next PDF
          return processPDFs(loadPromises.slice(1), mergedPdfDoc, duplicatePages);
          
        }).catch(function(copyError) {
          log.error('processPDFs', 'Error copying pages: ' + copyError.toString());
          // Continue with next PDF even if this one failed
          return processPDFs(loadPromises.slice(1), mergedPdfDoc, duplicatePages);
        });
      }
      
    }).catch(function(loadError) {
      log.error('processPDFs', 'Error loading PDF: ' + loadError.toString());
      // Continue with next PDF
      return processPDFs(loadPromises.slice(1), mergedPdfDoc, duplicatePages);
    });
  }
  
  return {
    mergePDFs: mergePDFs
  };
});

