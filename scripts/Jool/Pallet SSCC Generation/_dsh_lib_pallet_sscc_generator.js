/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pallet SSCC Generation Library - Generates SSCC-20 barcodes for pallet labels
 * 
 * This library generates SSCC codes for pallets using extension digit 1 to differentiate
 * from packages (which use 0). The SSCC is built from:
 * - Two Leading Zeros: "00" (to bring total to 20 digits)
 * - Extension Digit: 1 (fixed for pallets)
 * - Manufacturer ID: Retrieved from customrecord_sps_label_access (same as SPS scripts)
 * - Serial Number: Pallet ID padded with leading zeros to fill remaining space
 * - Check Digit: Calculated using the same algorithm as SPS
 * 
 * SSCC Format: 20 digits = "00" + Extension Digit (1) + Manufacturer ID + Padded Pallet ID + Check Digit
 */

define([
  'N/search',
  'N/record',
  'N/log',
  'N/error'
], function (search, record, log, error) {
  
  /**
   * Main function to generate and save SSCC for a pallet
   * @param {string|number} palletId - Pallet record internal ID
   * @returns {string} 20-digit SSCC code (with 2 leading zeros)
   */
  function generateAndSaveSSCC(palletId) {
    try {
      // Generate SSCC (manufacturer ID retrieved automatically)
      var sscc = generateSSCC(palletId);
      
      // Save to pallet record
      try {
        record.submitFields({
          type: 'customrecord_asn_pallet',
          id: palletId,
          values: {
            custrecord_sscc: sscc
          }
        });
        log.audit('SSCC Saved', 'SSCC ' + sscc + ' saved to pallet ' + palletId);
      } catch (saveError) {
        log.error('Error saving SSCC to pallet', 'Pallet ID: ' + palletId + ', Error: ' + saveError.toString());
        throw saveError;
      }
      
      return sscc;
    } catch (err) {
      log.error('generateAndSaveSSCC Error', 'Pallet ID: ' + palletId + ', Error: ' + err.toString());
      throw err;
    }
  }
  
  /**
   * Generate SSCC code for a pallet (without saving)
   * @param {string|number} palletId - Pallet record internal ID
   * @returns {string} 20-digit SSCC code (with 2 leading zeros)
   */
  function generateSSCC(palletId) {
    try {
      // Convert palletId to string/number
      palletId = String(palletId);
      var palletIdNum = parseInt(palletId, 10);
      
      if (isNaN(palletIdNum)) {
        throw error.create({
          name: 'INVALID_PALLET_ID',
          message: 'Invalid pallet ID: ' + palletId,
          notifyOff: true
        });
      }
      
      // Get manufacturer ID from configuration (retrieved automatically)
      var mfgId = getManufacturerId();
      
      // Validate manufacturer ID
      if (!mfgId || mfgId === '') {
        throw error.create({
          name: 'MANUFACTURER_ID_NOT_FOUND',
          message: 'Manufacturer ID could not be found. Please ensure customrecord_sps_label_access record exists.',
          notifyOff: true
        });
      }
      
      // Extension digit is 1 for pallets (to differentiate from packages which use 0)
      var extensionDigit = '1';
      
      // Build prefix: Extension Digit + Manufacturer ID
      var uccBase = extensionDigit + mfgId;
      
      // Calculate how many digits we need for the serial number (pallet ID + padding)
      // Total SSCC is 18 digits: 1 (extension) + mfgId length + serial number + 1 (check digit)
      // So before check digit we need 17 digits total
      // Serial number portion = 17 - uccBase.length
      // This works for any manufacturer ID length (7-10 digits):
      //   - 7 digit mfgId: 1 + 7 = 8, so serial = 17 - 8 = 9 digits
      //   - 8 digit mfgId: 1 + 8 = 9, so serial = 17 - 9 = 8 digits
      //   - 9 digit mfgId: 1 + 9 = 10, so serial = 17 - 10 = 7 digits
      //   - 10 digit mfgId: 1 + 10 = 11, so serial = 17 - 11 = 6 digits
      var serialNumberLength = 17 - uccBase.length;
      
      // Convert pallet ID to string and pad with leading zeros to fill serial number space
      var palletIdStr = palletIdNum.toString();
      while (palletIdStr.length < serialNumberLength) {
        palletIdStr = '0' + palletIdStr;
      }
      
      // If pallet ID is longer than available space, truncate (shouldn't happen in practice)
      if (palletIdStr.length > serialNumberLength) {
        palletIdStr = palletIdStr.slice(-serialNumberLength);
        log.warning('Pallet ID Truncated', 'Pallet ID ' + palletId + ' was too long and was truncated to fit in SSCC');
      }
      
      var uccId = palletIdStr;
      
      // Combine base + padded number (17 digits)
      var uccFinal = uccBase + uccId;
      
      // Calculate check digit using the same algorithm as SPS
      var uccArr = [0, 0];
      for (var i = 0; i < uccFinal.length; i++) {
        uccArr[Math.ceil((i + 1) % 2)] += parseInt(uccFinal.charAt(i));
      }
      var checkDigit = (10 - (uccArr[1] * 3 + uccArr[0] - 10 * Math.floor((uccArr[1] * 3 + uccArr[0]) / 10))).toString();
      if (checkDigit === '10') {
        checkDigit = '0';
      }
      
      // Final SSCC: 18 digits (SSCC-18 standard)
      var sscc18 = uccFinal + checkDigit;
      
      // Validate SSCC-18 length
      if (sscc18.length !== 18) {
        throw error.create({
          name: 'INVALID_SSCC_LENGTH',
          message: 'Generated SSCC is not 18 digits. Length: ' + sscc18.length + ', SSCC: ' + sscc18,
          notifyOff: true
        });
      }
      
      // Add 2 leading zeros to bring total to 20 digits
      var sscc = '00' + sscc18;
      
      // Validate final SSCC length (should be 20 digits)
      if (sscc.length !== 20) {
        throw error.create({
          name: 'INVALID_SSCC_LENGTH',
          message: 'Final SSCC is not 20 digits. Length: ' + sscc.length + ', SSCC: ' + sscc,
          notifyOff: true
        });
      }
      
      log.debug('SSCC Generated', 'Pallet ID: ' + palletId + ', SSCC: ' + sscc);
      
      return sscc;
    } catch (err) {
      log.error('generateSSCC Error', 'Pallet ID: ' + palletId + ', Error: ' + err.toString());
      throw err;
    }
  }
  
  /**
   * Get manufacturer ID from configuration
   * Manufacturer ID: Retrieved from customrecord_sps_label_access (same as SPS scripts)
   * 
   * @returns {string} Manufacturer ID
   */
  function getManufacturerId() {
    try {
      // Get manufacturer ID from customrecord_sps_label_access (same as SPS scripts)
      var labelAccessRec = search.lookupFields({
        type: 'customrecord_sps_label_access',
        id: 1,
        columns: ['custrecord_sps_label_login_mfgid']
      });
      
      var mfgId = labelAccessRec.custrecord_sps_label_login_mfgid;
      
      if (!mfgId) {
        log.error('Manufacturer ID Not Found', 'Could not find manufacturer ID in customrecord_sps_label_access record (ID: 1)');
        return null;
      }
      
      return mfgId.toString();
    } catch (err) {
      log.error('getManufacturerId Error', err.toString());
      throw err;
    }
  }
  
  return {
    generateSSCC: generateSSCC,
    generateAndSaveSSCC: generateAndSaveSSCC,
    getManufacturerId: getManufacturerId
  };
});

