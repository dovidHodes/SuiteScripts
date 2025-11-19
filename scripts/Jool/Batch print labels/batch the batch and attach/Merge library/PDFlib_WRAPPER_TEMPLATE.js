/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * 
 * NetSuite Wrapper for PDFlib (pdf-lib)
 * 
 * INSTRUCTIONS:
 * 1. Copy the ENTIRE content from PDFlib.js (the minified code)
 * 2. Paste it where it says "PASTE PDFLIB MINIFIED CODE HERE"
 * 3. Upload this file as a SuiteScript 2.0 Library File in NetSuite
 * 4. Name it: PDFlib (or PDFlib_NS)
 */

define(function() {
    'use strict';
    
    // ============================================
    // PASTE PDFLIB MINIFIED CODE HERE
    // ============================================
    // Copy everything from PDFlib.js starting from:
    // !function(t,e){"object"==typeof exports...
    // 
    // And paste it here (it's all on one line)
    // ============================================
    
    // After pasting the minified code, PDFLib will be available globally
    // We need to return it for NetSuite's module system

    
    
    // If PDFLib is in global scope (window.PDFLib or self.PDFLib):
    if (typeof PDFLib !== 'undefined') {
        return PDFLib;
    }
    
    // If it was defined via AMD but not returned:
    // The minified code should have created PDFLib, so try to access it
    if (typeof self !== 'undefined' && self.PDFLib) {
        return self.PDFLib;
    }
    
    // If using the UMD pattern from the minified code:
    // The code pattern: e((t=t||self).PDFLib={}) should create PDFLib
    // So we can return it directly if it exists
    var PDFLib = (typeof self !== 'undefined' && self.PDFLib) || 
                 (typeof window !== 'undefined' && window.PDFLib) ||
                 (typeof global !== 'undefined' && global.PDFLib);
    
    if (PDFLib) {
        return PDFLib;
    }
    
    // If none of the above work, you may need to modify the minified code
    // to explicitly return PDFLib at the end
    throw new Error('PDFLib not found. Make sure you pasted the entire PDFlib.js content above.');
});

