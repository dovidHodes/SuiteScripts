/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description BOL Generation Library - Contains all BOL generation logic
 * Moved from suitelet to allow direct calling from scheduled scripts
 */

define([
  'N/search',
  'N/render',
  'N/record',
  'N/log'
], function (search, render, record, log) {
  
  
  /**
   * Main function to generate and attach BOL PDF to Item Fulfillment
   * @param {string} ifId - Item Fulfillment internal ID
   * @param {number} pdfFolderId - File cabinet folder ID for PDF storage
   * @param {string} templateId - Advanced PDF/HTML Template ID (optional)
   * @returns {Object} Result object with success status and fileId
   */
  function generateAndAttachBOL(ifId, pdfFolderId, templateId) {
    try {
      // Get transaction ID for logging (more user-friendly than internal ID)
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      var tranId = ifRecord.getValue('tranid') || ifId;
      log.audit('Generate BOL', 'Starting for IF: ' + tranId + ' (Internal ID: ' + ifId + ')');
      
      // Step 1: Collect data from IF
      var jsonData;
      try {
        jsonData = collectIFData(ifId);
      } catch (collectError) {
        log.error('collectIFData Failed', collectError);
        return {
          success: false,
          error: collectError.message || 'Could not collect data from Item Fulfillment'
        };
      }
      
      if (!jsonData) {
        return {
          success: false,
          error: 'Could not collect data from Item Fulfillment'
        };
      }
      
      // Step 2: Use provided folder ID or default
      // NOTE: Script parameters can be set in Suitelet/Scheduled Script deployments:
      //   - custscript_dsh_bol_folder_id (Number) - PDF storage folder ID
      //   - custscript_dsh_bol_template_id (Text) - Template ID for customization
      pdfFolderId = pdfFolderId || 1373;
      
      // Step 3: Generate PDF using render module
      // IMPORTANT: If templateId is null/undefined/empty, use new default
      if (!templateId || templateId === '' || templateId === 'CUSTTMPL_108_6448561_565') {
        templateId = 'CUSTTMPL_DSH_SVC_BOL';
        log.audit('Template ID Override', 'Template ID was empty/old, using default: ' + templateId);
      }
      log.audit('Template ID Final', 'About to render PDF with template: ' + templateId);
      var fileId = renderBolPdf(jsonData, ifId, pdfFolderId, templateId);
      
      if (!fileId) {
        return {
          success: false,
          error: 'Failed to generate PDF'
        };
      }
      
      // Step 4: Attach PDF to Item Fulfillment
      record.attach({
        record: {
          type: 'file',
          id: fileId
        },
        to: {
          type: 'itemfulfillment',
          id: ifId
        }
      });
      
      // Use transaction ID from earlier load for file name in log
      log.audit('Generate BOL', 'PDF generated and attached successfully. File ID: ' + fileId + ', File Name: BOL_' + tranId + '.pdf');
      
      // Step 5: Add time tracker line for BOL creation
      // Action ID 6 = "Create BOL" (6th action in the list)
      try {
        var customerId = ifRecord.getValue('entity');
        if (customerId) {
          addTimeTrackerLine({
            actionId: 6, // Create BOL action ID
            customerId: customerId,
            timeSaved: 60, // 60 seconds
            employeeId: 5
          });
        } else {
          log.audit('Time Tracker', 'Skipping time tracker - no customer ID found on IF');
        }
      } catch (timeTrackerError) {
        // Log error but don't fail the BOL generation
        log.error('Time Tracker Error', 'Failed to add time tracker line: ' + timeTrackerError.toString());
      }
      
      // Step 6: Update IF fields
      updateIFFields(ifId, jsonData);
      
      return {
        success: true,
        fileId: fileId,
        message: 'BOL PDF generated and attached successfully'
      };
      
    } catch (error) {
      log.error('generateAndAttachBOL Error', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Collect Item Fulfillment data for BOL generation
   * @param {string} ifId - Item Fulfillment ID
   * @returns {Object|null} JSON data object for template or null if error
   */
  function collectIFData(ifId) {
    try {
      // Load IF record directly
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      
      // Get transaction ID for logging
      var tranId = ifRecord.getValue('tranid') || ifId;
      log.audit('collectIFData', 'Collecting data for IF: ' + tranId + ' (Internal ID: ' + ifId + ')');
      
      // Collect basic fields from IF (no validation - run with available data)
      var relatedPO = ifRecord.getValue('custbody_sps_ponum_from_salesorder') || '';
      var department = ifRecord.getValue('custbody_sps_department') || '';
      var scac = ifRecord.getValue('custbody_sps_carrieralphacode') || '';
      var potype = ifRecord.getValue('custbody_sps_reference_mr') || '';
      var loadID = ifRecord.getValue('custbody4') || '';
      var proNumber = ifRecord.getValue('custbody_sps_carrierpronumber') || '';
      var arnNumber = ifRecord.getValue('custbody_amazon_arn') || '';
      
      // Get ship from location (may be empty)
      var locationId = ifRecord.getValue('custbody_ship_from_location') || '';
      // Debug ARN number retrieval
      log.audit('ARN Number Debug', 'Field custbody_amazon_arn getValue(): ' + ifRecord.getValue('custbody_amazon_arn'));
      log.audit('ARN Number Debug', 'arnNumber variable: ' + arnNumber);
      // Try multiple ways to get pallet count
      var totalPalletsRaw = ifRecord.getValue('custbody_total_pallets');
      var totalPalletsText = ifRecord.getText('custbody_total_pallets');
      // Convert to number, then to string for template (handles 0 values properly)
      var totalPallets = totalPalletsRaw || totalPalletsText || 0;
      totalPallets = String(Number(totalPallets) || 0); // Ensure it's a string representation of a number
      
      // Debug pallet field retrieval
      log.audit('Pallet Field Debug', 'Field custbody_total_pallets getValue(): ' + totalPalletsRaw);
      log.audit('Pallet Field Debug', 'Field custbody_total_pallets getText(): ' + totalPalletsText);
      log.audit('Pallet Field Debug', 'totalPallets final value: ' + totalPallets);
      log.audit('Pallet Field Debug', 'totalPallets type: ' + typeof totalPallets);
      
      // Get customer/vendor info
      var entityId = ifRecord.getValue('entity');
      var vendorNumber = '';
      var customerName = '';
      if (entityId) {
        try {
          var customerRecord = record.load({
            type: 'customer',
            id: entityId,
            isDynamic: false
          });
          vendorNumber = customerRecord.getValue('accountnumber') || '';
          customerName = customerRecord.getValue('companyname') || customerRecord.getValue('entityid') || '';
        } catch (e) {
          log.error('Error loading customer', e);
        }
      }
      
      // Get shipping address from IF record directly (not from subrecord)
      // Try getValue() first, then getText() as fallback (wrapped in try-catch)
      // Note: shipaddr1, shipcity, shipstate, shipzip, shipcompany already validated above
      var shipaddr1 = ifRecord.getValue('shipaddr1') || '';
      var shipaddr2 = ifRecord.getValue('shipaddr2') || '';
      var shipaddress = ifRecord.getValue('shipaddress') || '';
      var shipaddressee = ifRecord.getValue('shipaddressee') || '';
      var shipcompany = ifRecord.getValue('shipcompany') || '';
      var shipattention = ifRecord.getValue('shipattention') || '';
      var shipcity = ifRecord.getValue('shipcity') || '';
      var shipphone = ifRecord.getValue('shipphone') || '';
      var shipstate = ifRecord.getValue('shipstate') || '';
      var shipzip = ifRecord.getValue('shipzip') || '';
      var shipcountry = ifRecord.getValue('shipcountry') || '';
      
      // Try getText() as fallback for main record fields (wrapped in try-catch)
      try { if (!shipaddr1) shipaddr1 = ifRecord.getText('shipaddr1') || ''; } catch (e) {}
      try { if (!shipaddr2) shipaddr2 = ifRecord.getText('shipaddr2') || ''; } catch (e) {}
      try { if (!shipaddress) shipaddress = ifRecord.getText('shipaddress') || ''; } catch (e) {}
      try { if (!shipaddressee) shipaddressee = ifRecord.getText('shipaddressee') || ''; } catch (e) {}
      try { if (!shipcompany) shipcompany = ifRecord.getText('shipcompany') || ''; } catch (e) {}
      try { if (!shipattention) shipattention = ifRecord.getText('shipattention') || ''; } catch (e) {}
      try { if (!shipcity) shipcity = ifRecord.getText('shipcity') || ''; } catch (e) {}
      try { if (!shipphone) shipphone = ifRecord.getText('shipphone') || ''; } catch (e) {}
      try { if (!shipstate) shipstate = ifRecord.getText('shipstate') || ''; } catch (e) {}
      try { if (!shipzip) shipzip = ifRecord.getText('shipzip') || ''; } catch (e) {}
      try { if (!shipcountry) shipcountry = ifRecord.getText('shipcountry') || ''; } catch (e) {}
      
      // If some fields are still empty, try getting them from the subrecord as fallback
      // IMPORTANT: Only use getValue() on subrecords, not getText() (causes errors)
      var shipAddress = ifRecord.getSubrecord('shippingaddress');
      if (shipAddress) {
        try {
          if (!shipaddr1) {
            shipaddr1 = shipAddress.getValue('shipaddr1') || shipAddress.getValue('address1') || '';
          }
          if (!shipaddr2) {
            shipaddr2 = shipAddress.getValue('shipaddr2') || shipAddress.getValue('address2') || '';
          }
          if (!shipcompany) {
            shipcompany = shipAddress.getValue('shipcompany') || 
                         shipAddress.getValue('company') || 
                         shipAddress.getValue('addressee') || '';
          }
          if (!shipcity) {
            shipcity = shipAddress.getValue('shipcity') || shipAddress.getValue('city') || '';
          }
          if (!shipaddressee) {
            shipaddressee = shipAddress.getValue('shipaddressee') || shipAddress.getValue('addressee') || '';
          }
        } catch (e) {
          log.error('Error reading shipping address subrecord', e);
        }
      }
      
      // If shipaddr1 is still empty but shipaddress has data, parse it
      // shipaddress format: "AMAZON.COM 1101 E PEARL ST BURLINGTON NJ 08016-1934 United States"
      // Format: COMPANY ADDRESS_LINE CITY STATE ZIP COUNTRY
      // Since company and city are already populated from getValue(), use them to find address boundaries
      if (shipaddress && !shipaddr1) {
        // Remove HTML breaks if present
        var cleanAddress = shipaddress.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
        
        // Use company and city to find the address line between them
        if (shipcompany && shipcity) {
          // Find position of company and city in the string
          var companyPos = cleanAddress.toUpperCase().indexOf(shipcompany.toUpperCase());
          var cityPos = cleanAddress.toUpperCase().indexOf(shipcity.toUpperCase());
          
          if (companyPos >= 0 && cityPos > companyPos) {
            // Extract text between company and city
            var afterCompany = cleanAddress.substring(companyPos + shipcompany.length).trim();
            var beforeCity = afterCompany.substring(0, afterCompany.toUpperCase().indexOf(shipcity.toUpperCase())).trim();
            shipaddr1 = beforeCity;
          }
        } else {
          // Fallback: parse by position (company is first, city is typically 4th from last)
          var addressParts = cleanAddress.split(/\s+/);
          if (addressParts.length >= 6) {
            var companyIndex = shipcompany ? 0 : 0; // Company is first
            var cityIndex = addressParts.length - 4; // City is 4th from last (before state, zip, country)
            if (cityIndex > companyIndex + 1) {
              shipaddr1 = addressParts.slice(companyIndex + 1, cityIndex).join(' ');
            }
          }
        }
        log.audit('Ship To Address - PARSED', 'Parsed addr1 from shipaddress: ' + shipaddr1);
      }
      
      // Assign to variables used in JSON
      var shipaddress1 = shipaddr1;
      var shipaddress2 = shipaddr2;
      var addressee = shipcompany;
      var attention = shipattention;
      var city = shipcity;
      var phone = shipphone;
      var state = shipstate;
      var zip = shipzip;
      var country = shipcountry;
      
      // Log final values being used (for debugging)
      log.audit('Ship To Address - FINAL', 'Company: ' + addressee + ', Addr1: ' + shipaddress1 + ', City: ' + city + ', State: ' + state + ', Zip: ' + zip);
      
      // Get ship from address from location record
      var shipFromFullInfo = '';
      var locationName = '';
      if (locationId) {
        try {
          var locationRecord = record.load({
            type: 'location',
            id: locationId,
            isDynamic: false
          });
          var mainAddressText = locationRecord.getValue('mainaddress_text') || '';
          locationName = locationRecord.getValue('name') || locationRecord.getValue('location') || '';
          // Normalize all <br> variations to <br/> for consistent rendering
          // The template expects HTML <br/> tags to render line breaks properly
          // Ensure all line breaks are properly formatted as <br/>
          shipFromFullInfo = mainAddressText
            .replace(/<br\s*\/?>/gi, '<br/>')  // Normalize all <br> to <br/>
            .replace(/\r\n/g, '<br/>')        // Convert Windows line breaks
            .replace(/\r/g, '<br/>')          // Convert Mac line breaks
            .replace(/\n/g, '<br/>');         // Convert Unix line breaks
          
          // Log to verify the address format
          log.audit('Ship From Address', 'Location ID: ' + locationId);
          log.audit('Ship From Address', 'Location Name: ' + locationName);
          log.audit('Ship From Address', 'Raw text: ' + mainAddressText);
          log.audit('Ship From Address', 'Formatted: ' + shipFromFullInfo);
          log.audit('Ship From Address', 'Number of <br/> tags: ' + (shipFromFullInfo.match(/<br\/>/g) || []).length);
        } catch (e) {
          log.error('Error loading location', e);
          shipFromFullInfo = '';
          locationName = '';
        }
      }
      
      // Store location name and PO number for file naming (will be passed to renderBolPdf)
      var poNumber = relatedPO || '';
      
      // Search for packages to get count and weight
      var packageSearch = search.create({
        type: 'customrecord_sps_package',
        filters: [
          ['custrecord_sps_pack_asn', 'anyof', ifId]
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'custrecord_sps_pk_weight' })
        ]
      });
      
      var pkgCount = 0;
      var totalweight = 0;
      packageSearch.run().each(function(result) {
        pkgCount++;
        var weight = parseFloat(result.getValue('custrecord_sps_pk_weight')) || 0;
        totalweight += weight;
        return true;
      });
      
      // Extract CID# from addressee (same logic as dcNum) - must be after addressee is defined
      // Make it blank if result is "0" or "00000"
      var shiptocidExtracted = ("0" + (addressee || '').replace(/^\D+|\D+$/g, "")).slice(-5);
      var shiptocid = (shiptocidExtracted === '0' || shiptocidExtracted === '00000') ? '' : shiptocidExtracted;
      
      // Extract DC number from addressee, but make it blank if result is "0"
      var dcNumExtracted = ("0" + (addressee || '').replace(/^\D+|\D+$/g, "")).slice(-5);
      var dcNum = (dcNumExtracted === '0' || dcNumExtracted === '00000') ? '' : dcNumExtracted;
      
      var jsonData = {
        potype: potype,
        department: department,
        vendorNumber: vendorNumber,
        totalWeight: parseFloat(totalweight).toFixed(2) || '0',
        shipperInfoArr: [{
          relatedPO: relatedPO,
          pkgCount: pkgCount,
          weight: parseFloat(totalweight || 0).toFixed(2), // Round to 2 decimals
          dcNum: dcNum
        }],
        totalPkgCount: pkgCount,
        shipToFullInfo: {
          shipaddress1: shipaddress1,
          shipaddress2: shipaddress2,
          addressee: addressee,
          attention: attention,
          city: city,
          phone: phone,
          state: state,
          zip: zip,
          country: country
        },
        bolNumber: relatedPO,
        isconsolidated: false,
        scac: scac,
        trandate: formatDate(new Date()),
        // Add pdfType field - template checks this to show "BILL OF LADING" header
        pdfType: '', // Empty string for single BOL (template will show "BILL OF LADING" header)
        // Add other fields that template might expect
        shipmethod: scac || '', // Carrier/ship method
        mabdDate: '', // MABD date (can be empty for single BOL)
        pageNum: 1, // Page number (always 1 for single BOL)
        totalPages: 1, // Total pages (always 1 for single BOL)
        shipFromFullInfo: shipFromFullInfo, // Get from IF field custbody_gbs_location_address
        loadID: loadID, // Load ID from IF field custbody4
        proNumber: proNumber, // Pro Number from IF field custbody_sps_carrierpronumber
        pallet: totalPallets, // Total pallets from IF field custbody_total_pallets
        arnNumber: arnNumber, // ARN number from IF field custbody_amazon_arn
        // Template fields that need to be populated
        shiptocid: shiptocid, // CID# extracted from addressee
        customer: customerName, // Customer name
        entity: {
          id: entityId || '' // Entity ID for template conditionals
        },
        nmfc: '', // NMFC number (can be empty or add IF field if available)
        bclass: '', // Freight class (can be empty or add IF field if available)
        // File naming fields
        locationName: locationName, // Location name for file naming
        poNumber: poNumber // PO number for file naming
      };
      
      // Log the final shipToFullInfo object being passed to template
      log.audit('Ship To FullInfo - JSON OBJECT', JSON.stringify(jsonData.shipToFullInfo));
      // Log pallet count for debugging
      log.audit('Pallet Count - Final', 'jsonData.pallet value: ' + jsonData.pallet);
      log.audit('Pallet Count - Final', 'jsonData.pallet type: ' + typeof jsonData.pallet);
      log.audit('Pallet Count - Final', 'Full jsonData.pallet in JSON: ' + JSON.stringify({pallet: jsonData.pallet}));
      
      return jsonData;
      
    } catch (error) {
      log.error('collectIFData Error', error);
      throw new Error('Error collecting IF data: ' + error.message);
    }
  }
  
  /**
   * Render BOL PDF using Advanced PDF/HTML Template
   * @param {Object} jsonData - Data object for template
   * @param {string} ifId - Item Fulfillment ID
   * @param {number} pdfFolderId - File cabinet folder ID
   * @param {string} templateId - Template script ID
   * @returns {string|null} File ID or null if error
   */
  function renderBolPdf(jsonData, ifId, pdfFolderId, templateId) {
    try {
      // Get transaction ID for logging and file naming
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      var tranId = ifRecord.getValue('tranid') || ifId;
      log.audit('renderBolPdf', 'Generating PDF for IF: ' + tranId + ' (Internal ID: ' + ifId + ')');
      
      // Log template being used for debugging
      log.audit('Template Debug', 'Using Template ID: ' + templateId);
      log.audit('Template Debug', 'Template data sample - pallet: ' + jsonData.pallet + ', arnNumber: ' + jsonData.arnNumber + ', loadID: ' + jsonData.loadID);
      log.audit('Template Debug', 'ARN Number in jsonData: "' + jsonData.arnNumber + '" (length: ' + (jsonData.arnNumber ? jsonData.arnNumber.length : 0) + ')');
      
      var renderer = render.create();
      renderer.setTemplateByScriptId(templateId);
      
      renderer.addCustomDataSource({
        format: render.DataSource.OBJECT,
        alias: 'JSON',
        data: { record: jsonData }
      });
      
      var bol = renderer.renderAsPdf();
      bol.folder = pdfFolderId;
      
      // File name: BOL_<PO_number> - <location_name>.pdf
      // If PO or location name is missing, fall back to transaction ID
      var poNumber = jsonData.poNumber || '';
      var locationName = jsonData.locationName || '';
      
      // Clean up file name: remove invalid characters and trim
      var fileName = '';
      if (poNumber && locationName) {
        fileName = 'BOL_' + poNumber + ' - ' + locationName;
      } else if (poNumber) {
        fileName = 'BOL_' + poNumber;
      } else if (locationName) {
        fileName = 'BOL_' + tranId + ' - ' + locationName;
      } else {
        fileName = 'BOL_' + tranId;
      }
      
      // Remove invalid characters for file names
      fileName = fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
      if (!fileName) {
        fileName = 'BOL_' + tranId;
      }
      
      bol.name = fileName + '.pdf';
      bol.isOnline = true;
      
      // File ID: Generated by NetSuite when file is saved
      // Source: Returned from bol.save() - NetSuite assigns unique file ID
      var fileId = bol.save();
      log.audit('renderBolPdf', 'PDF saved - File ID: ' + fileId + ', File Name: ' + fileName + '.pdf, Folder ID: ' + pdfFolderId);
      
      return fileId;
      
    } catch (error) {
      log.error('renderBolPdf Error', error);
      return null;
    }
  }
  
  /**
   * Update Item Fulfillment fields with BOL information
   * @param {string} ifId - Item Fulfillment ID
   * @param {Object} jsonData - BOL data object
   */
  function updateIFFields(ifId, jsonData) {
    try {
      record.submitFields({
        type: 'itemfulfillment',
        id: ifId,
        values: {
          custbody_sps_billofladingnumber: jsonData.bolNumber
        }
      });
    } catch (error) {
      log.error('updateIFFields Error', error);
    }
  }
  
  /**
   * Format date as MM/DD/YYYY
   * @param {Date} date - Date object
   * @returns {string} Formatted date string
   */
  function formatDate(date) {
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var year = date.getFullYear();
    return month + '/' + day + '/' + year;
  }
  
  /**
   * Add a time tracking line to the custom transaction
   * @param {Object} options
   * @param {number} options.actionId - Internal ID of the action (custcol_action)
   * @param {number} options.customerId - Internal ID of the customer (custcol_trading_partner)
   * @param {number} options.timeSaved - Time saved in seconds (custcol_time_saved)
   * @param {number} [options.employeeId=5] - Employee ID (custcol_employee), defaults to 5
   * @returns {string} Record ID of the time tracker transaction
   */
  function addTimeTrackerLine(options) {
    try {
      // Load the existing time tracker transaction
      var timeTrackerRecord = record.load({
        type: 'customtransaction_time_tracker',
        id: 15829943,
        isDynamic: true
      });
      
      // Get the current line count
      var lineCount = timeTrackerRecord.getLineCount({
        sublistId: 'line'
      });
      
      // Insert a new line at the end of the sublist
      timeTrackerRecord.insertLine({
        sublistId: 'line',
        line: lineCount // Inserts at the end (0-indexed)
      });
      
      // Select the newly inserted line
      timeTrackerRecord.selectLine({
        sublistId: 'line',
        line: lineCount
      });
      
      // Set values for fields on the newly inserted line
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        value: 619
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'amount',
        value: 0
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_action',
        value: options.actionId
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_trading_partner',
        value: options.customerId
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_employee',
        value: options.employeeId || 5
      });
      
      timeTrackerRecord.setCurrentSublistValue({
        sublistId: 'line',
        fieldId: 'custcol_time_saved',
        value: options.timeSaved
      });
      
      // Commit the line
      timeTrackerRecord.commitLine({
        sublistId: 'line'
      });
      
      // Save the record
      var recordId = timeTrackerRecord.save();
      
      log.audit('Time Tracker', 'Added line to time tracker record: ' + recordId + ' for customer: ' + options.customerId + ', time saved: ' + options.timeSaved + ' seconds');
      
      return recordId;
    } catch (e) {
      log.error('Time Tracker Error', 'Failed to add time tracker line: ' + e.toString());
      throw e;
    }
  }
  
  return {
    generateAndAttachBOL: generateAndAttachBOL,
    collectIFData: collectIFData,
    renderBolPdf: renderBolPdf,
    updateIFFields: updateIFFields,
    formatDate: formatDate
  };
});

