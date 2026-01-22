/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pallet Label Generation Library - Contains all pallet label generation logic
 * 
 * This library can be called from anywhere (Suitelet, Scheduled Script, Map/Reduce, etc.)
 * to generate pallet label PDFs using Advanced PDF/HTML Templates.
 */

define([
  'N/search',
  'N/render',
  'N/record',
  'N/log',
  'N/file',
  'N/url',
  './_dsh_lib_pallet_label_template',
  './_dsh_lib_barcode_generator'
], function (search, render, record, log, file, url, templateLib, barcodeLib) {
  
  /**
   * Main function to generate pallet label PDF
   * @param {string} palletId - Pallet record internal ID
   * @param {number} pdfFolderId - File cabinet folder ID for PDF storage
   * @param {string} templateId - Advanced PDF/HTML Template ID (optional, defaults to CUSTTMPL_DSH_PALLET_LABEL)
   * @returns {Object} Result object with success status and fileId
   */
  function generatePalletLabel(palletId, pdfFolderId, templateId) {
    try {
      
      if (!palletId) {
        return {
          success: false,
          error: 'palletId must be provided'
        };
      }
      
      // Step 1: Collect data from pallet record
      var jsonData;
      try {
        jsonData = collectPalletData(palletId);
      } catch (collectError) {
        log.error('generatePalletLabel - collectPalletData Failed', collectError);
        return {
          success: false,
          error: collectError.message || 'Could not collect pallet data'
        };
      }
      
      if (!jsonData) {
        log.debug('generatePalletLabel', 'jsonData is null or undefined after collection');
        return {
          success: false,
          error: 'Could not collect pallet data'
        };
      }
      
      log.debug('generatePalletLabel', 'Data collected - ifId: ' + jsonData.ifId + ', locationId: ' + jsonData.locationId);
      
      // Step 2: Use provided folder ID or default
      pdfFolderId = pdfFolderId || 1373; // Default folder ID (same as BOL)
      
      // Step 3: Generate barcode if SSCC exists
      var barcodeFileId = null;
      var barcodeImageUrl = null;
      if (jsonData.ssccBarcode && jsonData.ssccBarcode.length === 20) {
        try {
          log.debug('generatePalletLabel', 'Generating barcode for SSCC: ' + jsonData.ssccBarcode);
          
          // Generate barcode (returns image data only)
          // We'll add the SSCC text manually in the template
          var barcodeResult = barcodeLib.generateBarcode(jsonData.ssccBarcode, {
            format: 'png',
            type: 'gs1-128',
            width: 300,   // Width in pixels
            height: 50    // Height in pixels
          });
          
          if (barcodeResult && barcodeResult.success && barcodeResult.data) {
            // Get file type - barcode generator returns string ('PNGIMAGE' or 'SVG')
            var barcodeFileType = barcodeResult.fileType || 'PNGIMAGE';
            var barcodeFileExtension = barcodeResult.fileExtension || 'png';
            
            if (!barcodeFileType) {
              log.error('Barcode Result Missing fileType', 'barcodeResult keys: ' + Object.keys(barcodeResult).join(', '));
              throw new Error('Barcode result missing fileType');
            }
            
            // Save barcode file to file cabinet
            var barcodeFileName = 'SSCC_Barcode_PLT-' + (palletId || ifId) + '.' + barcodeFileExtension;
            
            log.debug('Creating Barcode File', 'FileType: ' + barcodeFileType + ' (type: ' + typeof barcodeFileType + '), Extension: ' + barcodeFileExtension + ', Data length: ' + barcodeResult.data.length);
            
            var barcodeFile = file.create({
              name: barcodeFileName,
              fileType: barcodeFileType,
              contents: barcodeResult.data,
              folder: pdfFolderId,
              description: 'Barcode for SSCC: ' + jsonData.ssccBarcode
            });
            
            barcodeFileId = barcodeFile.save();
            log.debug('generatePalletLabel', 'Barcode file saved: ' + barcodeFileId);
            
            // Attach barcode file to pallet record
            if (barcodeFileId && palletId) {
              try {
                record.attach({
                  record: {
                    type: 'file',
                    id: barcodeFileId
                  },
                  to: {
                    type: 'customrecord_asn_pallet',
                    id: palletId
                  }
                });
                log.debug('generatePalletLabel', 'Barcode file attached to pallet record');
              } catch (attachError) {
                log.error('Error attaching barcode file', attachError);
              }
            }
            
            // Get barcode image as base64 data URI for template (PDF renderer doesn't support external URLs)
            try {
              // Use the barcode data directly from the API response (already base64-encoded)
              // The API returns PNG as base64 string (starts with "iVBORw0KGgo...")
              var barcodeBase64 = barcodeResult.data;
              
              // Create data URI for embedding in PDF
              // Format: data:image/png;base64,<base64data>
              var barcodeDataUri = 'data:image/png;base64,' + barcodeBase64;
              
              log.debug('generatePalletLabel', 'Barcode data URI created, length: ' + barcodeDataUri.length);
              
              // Also get URL for reference (though we'll use data URI in template)
              var barcodeFileObj = file.load({ id: barcodeFileId });
              var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
              barcodeImageUrl = 'https://' + domain + barcodeFileObj.url;
              
              // Add barcode data URI (for PDF) and URL (for reference) to JSON data
              jsonData.barcodeImageDataUri = barcodeDataUri;  // Use this in template
              jsonData.barcodeImageUrl = barcodeImageUrl;      // Keep for reference
              jsonData.barcodeFileId = barcodeFileId;
              // Use the same formatted text that was sent to the barcode API: (00)108425590000000851
              jsonData.ssccDisplayText = barcodeResult.barcodeText || jsonData.sscc;
              log.debug('generatePalletLabel', 'Barcode text for display: ' + jsonData.ssccDisplayText);
            } catch (urlError) {
              log.error('Error getting barcode data', urlError);
            }
            
            log.audit('Barcode Generated', 'Barcode file ID: ' + barcodeFileId + ', SSCC: ' + jsonData.ssccBarcode);
          } else {
            log.error('Barcode Generation Failed', 'No data returned from barcode generator');
          }
        } catch (barcodeError) {
          log.error('Barcode Generation Error', 'SSCC: ' + jsonData.ssccBarcode + ', Error: ' + barcodeError.toString());
          // Don't fail label generation if barcode fails
        }
      } else {
        log.debug('generatePalletLabel', 'No SSCC found or SSCC is not 20 digits. SSCC: ' + (jsonData.ssccBarcode || 'not found'));
      }
      
      // Step 4: Generate PDF using render module
      if (!templateId || templateId === '') {
        templateId = 'CUSTTMPL_NEW_PALLET'; // Default template ID
      }
      
      log.debug('generatePalletLabel', 'Starting PDF render - templateId: ' + templateId + ', pdfFolderId: ' + pdfFolderId);
      var fileId = renderPalletLabelPdf(jsonData, palletId, pdfFolderId, templateId);
      
      if (!fileId) {
        return {
          success: false,
          error: 'Failed to generate PDF'
        };
      }
      
      // Step 4: Attach PDF to pallet record
      try {
        record.attach({
          record: {
            type: 'file',
            id: fileId
          },
          to: {
            type: 'customrecord_asn_pallet',
            id: palletId
          }
        });
      } catch (attachError) {
        log.error('Error attaching PDF', attachError);
        // Don't fail the whole operation if attachment fails
      }
      
      // Get PDF URL for return value
      var pdfUrl = '';
      try {
        var pdfFile = file.load({ id: fileId });
        var domain = url.resolveDomain({ hostType: url.HostType.APPLICATION });
        pdfUrl = 'https://' + domain + pdfFile.url;
        log.debug('Pallet Label PDF URL', 'Generated PDF URL: ' + pdfUrl);
      } catch (urlError) {
        log.error('Error getting PDF URL', 'Failed to generate PDF URL: ' + urlError.toString());
      }
      
      log.audit('Generate Pallet Label', 'PDF generated successfully. File ID: ' + fileId + ', URL: ' + pdfUrl);
      
      return {
        success: true,
        fileId: fileId,
        pdfUrl: pdfUrl,
        message: 'Pallet label PDF generated successfully'
      };
      
    } catch (error) {
      log.error('generatePalletLabel Error', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Collect pallet data from pallet record
   * @param {string} palletId - Pallet record internal ID
   * @returns {Object|null} JSON data object for template or null if error
   */
  function collectPalletData(palletId) {
    try {
      log.audit('collectPalletData', 'Collecting data for pallet: ' + palletId);
      
      // Load pallet record - get all fields at once
      var palletRecord = record.load({
        type: 'customrecord_asn_pallet',
        id: palletId,
        isDynamic: false
      });
      
      var ifId = palletRecord.getValue('custrecord_parent_if');
      var palletNumber = palletRecord.getValue('custrecord_pallet_index');
      var totalPallets = palletRecord.getValue('custrecord_total_pallet_count');
      var ssccRaw = palletRecord.getValue('custrecord_sscc') || '';
      var custrecord17Value = palletRecord.getValue('custrecord_package_json') || '';
      
      // Get IF data if available
      var ifData = null;
      if (ifId) {
        try {
          log.debug('collectPalletData', 'Loading IF data for ifId: ' + ifId);
          ifData = getIFData(ifId);
          log.debug('collectPalletData', 'IF data loaded - locationId: ' + (ifData && ifData.locationId ? ifData.locationId : 'none'));
        } catch (e) {
          log.error('Error loading IF data', e);
        }
      } else {
        log.debug('collectPalletData', 'No ifId found on pallet record');
      }
      
      // Get packages assigned to this pallet
      var packages = [];
      var packageSearch = search.create({
        type: 'customrecord_sps_package',
        filters: [
          ['custrecord_parent_pallet', 'anyof', palletId]
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'name' }),
          search.createColumn({ name: 'custrecord_sps_pk_weight' })
        ]
      });
      
      packageSearch.run().each(function(result) {
        packages.push({
          packageId: result.id,
          packageName: result.getValue('name'),
          weight: result.getValue('custrecord_sps_pk_weight') || 0
        });
        return true;
      });
      
      // Extract SSCC digits
      var ssccDigits = ssccRaw.replace(/[^0-9]/g, '');
      log.debug('SSCC Debug - collectPalletData', 'Pallet ID: ' + palletId + ', ssccRaw: "' + ssccRaw + '", ssccDigits: "' + ssccDigits + '"');
      
      // Build JSON data object for template
      var jsonData = {
        palletId: palletId,
        palletNumber: palletNumber,
        totalPallets: totalPallets,
        date: formatDate(new Date()),
        packages: packages,
        packageCount: packages.length,
        cartonCount: packages.length, // Cartons on pallet
        totalWeight: calculateTotalWeight(packages),
        // IF data if available
        ifId: ifId || '',
        ifTranId: (ifData && ifData.tranId) || '',
        poNumber: (ifData && ifData.poNumber) || '',
        customerName: (ifData && ifData.customerName) || '',
        shipToAddress: (ifData && ifData.shipToAddress) || {},
        shipFromAddress: (ifData && ifData.shipFromAddress) || {},
        shipFromDetails: (ifData && ifData.shipFromDetails) || {},
        locationId: (ifData && ifData.locationId) || '',
        locationName: (ifData && ifData.locationName) || '',
        // Carrier info
        carrierName: (ifData && ifData.carrierName) || '',
        bolNumber: (ifData && ifData.bolNumber) || '',
        proNumber: (ifData && ifData.proNumber) || '',
        arnNumber: (ifData && ifData.arnNumber) || '',
        // SSCC
        sscc: ssccDigits, // SSCC value from custrecord_sscc field (20 digits) - for display
        ssccBarcode: ssccDigits, // SSCC value from custrecord_sscc field (20 digits) - used directly for barcode
        ssccDisplayText: '', // Will be set after barcode generation with formatted text: (00)108425590000000851
        // Carton data from custrecord_package_json
        custrecord_package_json: custrecord17Value
      };
      
      log.debug('SSCC Debug - collectPalletData', 'Final jsonData.ssccBarcode: "' + jsonData.ssccBarcode + '", length: ' + (jsonData.ssccBarcode ? jsonData.ssccBarcode.length : 0));
      log.debug('collectPalletData', 'Built jsonData - locationId: ' + jsonData.locationId + ', hasShipFromAddress: ' + (jsonData.shipFromAddress && Object.keys(jsonData.shipFromAddress).length > 0));
      log.audit('collectPalletData', 'Data collected successfully for pallet: ' + palletId);
      return jsonData;
      
    } catch (error) {
      log.error('collectPalletData Error', error);
      throw new Error('Error collecting pallet data: ' + error.message);
    }
  }
  
  /**
   * Get Item Fulfillment data
   * @param {string} ifId - Item Fulfillment internal ID
   * @returns {Object} IF data object
   */
  function getIFData(ifId) {
    try {
      log.debug('getIFData', 'Loading IF record: ' + ifId);
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      log.debug('getIFData', 'IF record loaded successfully');
      
      var tranId = ifRecord.getValue('tranid') || ifId;
      var poNumber = ifRecord.getValue('custbody_sps_ponum_from_salesorder') || '';
      var entityId = ifRecord.getValue('entity');
      log.debug('getIFData', 'IF basic data - tranId: ' + tranId + ', poNumber: ' + poNumber);
      
      var customerName = '';
      if (entityId) {
        try {
          var customerRecord = record.load({
            type: 'customer',
            id: entityId,
            isDynamic: false
          });
          customerName = customerRecord.getValue('companyname') || customerRecord.getValue('entityid') || '';
        } catch (e) {
          log.error('Error loading customer', e);
        }
      }
      
      // Get shipping address
      var shipToAddress = {
        company: ifRecord.getValue('shipcompany') || '',
        address1: ifRecord.getValue('shipaddr1') || '',
        address2: ifRecord.getValue('shipaddr2') || '',
        city: ifRecord.getValue('shipcity') || '',
        state: ifRecord.getValue('shipstate') || '',
        zip: ifRecord.getValue('shipzip') || '',
        country: ifRecord.getValue('shipcountry') || ''
      };
      
      // Get ship from location
      var locationId = ifRecord.getValue('custbody_ship_from_location');
      
      var locationName = '';
      var shipFromAddress = {};
      var shipFromDetails = {};
      
      if (locationId) {
        try {
          var locationRecord = record.load({
            type: 'location',
            id: locationId,
            isDynamic: false
          });
          locationName = locationRecord.getValue('name') || locationRecord.getValue('location') || '';
          var mainAddressText = locationRecord.getValue('mainaddress_text') || '';
          
          // Parse mainaddress_text by splitting on <br> tags
          var addressLines = [];
          if (mainAddressText) {
            // Replace all variations of <br> tags with a delimiter, then split
            var normalizedText = mainAddressText
              .replace(/<br\s*\/?>/gi, '|||BR|||')
              .replace(/<br>/gi, '|||BR|||');
            addressLines = normalizedText.split('|||BR|||')
              .map(function(line) { return line.trim(); })
              .filter(function(line) { return line.length > 0; });
          }
          
          shipFromDetails = {
            company: locationName || '',
            addressLines: addressLines
          };
          
          shipFromAddress = {
            fullAddress: mainAddressText,
            locationName: locationName,
            addressLines: addressLines
          };
        } catch (e) {
          log.error('Error loading location', e);
        }
      }
      
      // Get carrier info
      var carrierName = ifRecord.getValue('shipmethod') || '';
      var bolNumber = ifRecord.getValue('custbody_sps_billofladingnumber') || '';
      var proNumber = ifRecord.getValue('custbody_sps_carrierpronumber') || '';
      var arnNumber = ifRecord.getValue('custbody_amazon_arn') || '';
      
      var ifDataResult = {
        tranId: tranId,
        poNumber: poNumber,
        customerName: customerName,
        shipToAddress: shipToAddress,
        shipFromAddress: shipFromAddress,
        shipFromDetails: shipFromDetails,
        locationName: locationName,
        locationId: locationId,
        carrierName: carrierName,
        bolNumber: bolNumber,
        proNumber: proNumber,
        arnNumber: arnNumber
      };
      
      log.debug('getIFData', 'Returning IF data - locationId: ' + locationId + ', addressLines count: ' + (shipFromDetails.addressLines ? shipFromDetails.addressLines.length : 0));
      return ifDataResult;
      
    } catch (error) {
      log.error('getIFData Error', error);
      return {
        tranId: '',
        poNumber: '',
        customerName: '',
        shipToAddress: {},
        shipFromAddress: {},
        locationName: ''
      };
    }
  }
  
  /**
   * Calculate total weight from packages array
   * @param {Array} packages - Array of package objects with weight property
   * @returns {string} Total weight as formatted string
   */
  function calculateTotalWeight(packages) {
    var total = 0;
    for (var i = 0; i < packages.length; i++) {
      var weight = parseFloat(packages[i].weight) || 0;
      total += weight;
    }
    return parseFloat(total).toFixed(2);
  }
  
  /**
   * Render pallet label PDF using Advanced PDF/HTML Template
   * @param {Object} jsonData - Data object for template
   * @param {string} recordId - Pallet ID or IF ID for file naming
   * @param {number} pdfFolderId - File cabinet folder ID
   * @param {string} templateId - Template script ID
   * @returns {string|null} File ID or null if error
   */
  function renderPalletLabelPdf(jsonData, recordId, pdfFolderId, templateId) {
    try {
      log.audit('renderPalletLabelPdf', 'Generating PDF from inline template string for pallet: ' + jsonData.palletId);
      
      var renderer = render.create();
      
      // OPTIONAL: Add record context if available (helps with some NetSuite checks)
      if (jsonData.palletId) {
        try {
          renderer.addRecord({
            type: 'customrecord_asn_pallet',
            id: jsonData.palletId
          });
        } catch (e) {
          // Ignore
        }
      }
      
      // Load IF record directly to get ship-to address fields
      // Use same approach as BOL generator: getValue() first, then getText() as fallback, then subrecord
      var shipcompany = '';
      var shipaddr1 = '';
      var shipaddr2 = '';
      var shipcity = '';
      var shipstate = '';
      var shipzip = '';
      var shipcountry = '';
      
      if (jsonData.ifId) {
        try {
          var ifRecord = record.load({
            type: 'itemfulfillment',
            id: jsonData.ifId,
            isDynamic: false
          });
          
          // Try getValue() first (same as BOL script)
          shipaddr1 = ifRecord.getValue('shipaddr1') || '';
          shipaddr2 = ifRecord.getValue('shipaddr2') || '';
          shipcompany = ifRecord.getValue('shipcompany') || '';
          shipcity = ifRecord.getValue('shipcity') || '';
          shipstate = ifRecord.getValue('shipstate') || '';
          shipzip = ifRecord.getValue('shipzip') || '';
          shipcountry = ifRecord.getValue('shipcountry') || '';
          
          // Try getText() as fallback (only if empty, wrapped in try-catch)
          try { if (!shipaddr1) shipaddr1 = ifRecord.getText('shipaddr1') || ''; } catch (e) {}
          try { if (!shipaddr2) shipaddr2 = ifRecord.getText('shipaddr2') || ''; } catch (e) {}
          try { if (!shipcompany) shipcompany = ifRecord.getText('shipcompany') || ''; } catch (e) {}
          try { if (!shipcity) shipcity = ifRecord.getText('shipcity') || ''; } catch (e) {}
          try { if (!shipstate) shipstate = ifRecord.getText('shipstate') || ''; } catch (e) {}
          try { if (!shipzip) shipzip = ifRecord.getText('shipzip') || ''; } catch (e) {}
          try { if (!shipcountry) shipcountry = ifRecord.getText('shipcountry') || ''; } catch (e) {}
          
          // If still empty, try getting from subrecord (same as BOL script)
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
              if (!shipstate) {
                shipstate = shipAddress.getValue('shipstate') || shipAddress.getValue('state') || '';
              }
              if (!shipzip) {
                shipzip = shipAddress.getValue('shipzip') || shipAddress.getValue('zip') || '';
              }
              if (!shipcountry) {
                shipcountry = shipAddress.getValue('shipcountry') || shipAddress.getValue('country') || '';
              }
            } catch (e) {
              // Ignore subrecord errors
            }
          }
          
          // If shipaddr1 is still empty but shipaddress field has data, parse it (same as BOL script)
          // shipaddress format: "AMAZON.COM 1101 E PEARL ST BURLINGTON NJ 08016-1934 United States"
          var shipaddress = ifRecord.getValue('shipaddress') || '';
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
          }
        } catch (e) {
          log.debug('renderPalletLabelPdf', 'Could not load IF record for ship-to address: ' + e.message);
        }
      }
      
      // Get carton count and SKU/VPN information from custrecord_package_json JSON (already loaded in collectPalletData)
      var cartonCount = 0;
      var skuDisplayText = '';
      var custrecord17Value = jsonData.custrecord_package_json || '';
      
      if (custrecord17Value) {
        try {
          var cartonData = JSON.parse(custrecord17Value);
          cartonCount = cartonData.totalCartons || 0;
          var cartonDataItems = cartonData.items || [];
          
          if (cartonDataItems.length > 1) {
            // More than one item = MIXED SKU
            skuDisplayText = 'MIXED SKU';
          } else if (cartonDataItems.length === 1) {
            // Single item - get VPN from the item object (already in JSON)
            var item = cartonDataItems[0];
            var vpn = item.vpn || '';
            skuDisplayText = 'Single ASIN - ' + vpn;
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      // Build recordData structure
      var recordData = {
        id: jsonData.palletId || '',
        custrecord_pallet_index: jsonData.palletNumber,
        custrecord_total_pallet_count: jsonData.totalPallets,
        cartonCount: cartonCount,
        skuDisplayText: skuDisplayText,
        sscc: jsonData.sscc || '',
        ssccBarcode: jsonData.ssccBarcode || '',
        ssccDisplayText: jsonData.ssccDisplayText || jsonData.sscc || '', // Formatted text: (00)108425590000000851
        barcodeImageDataUri: jsonData.barcodeImageDataUri || '', // Barcode image as base64 data URI (for PDF embedding)
        barcodeImageUrl: jsonData.barcodeImageUrl || '', // Barcode image file URL (for reference)
        custrecord_parent_if: {
          id: jsonData.ifId || '',
          tranid: jsonData.ifTranId || '',
          custbody_sps_ponum_from_salesorder: jsonData.poNumber || '',
          shipcompany: shipcompany,
          shipaddr1: shipaddr1,
          shipaddr2: shipaddr2,
          shipcity: shipcity,
          shipstate: shipstate,
          shipzip: shipzip,
          shipcountry: shipcountry,
          custbody_sps_billofladingnumber: jsonData.bolNumber || '',
          custbody_sps_carrierpronumber: jsonData.proNumber || '',
          custbody_amazon_arn: jsonData.arnNumber || '',
          custbody_ship_from_location: {
            id: jsonData.locationId || '',
            name: jsonData.locationName || '',
            mainaddress_text: (jsonData.shipFromAddress && jsonData.shipFromAddress.fullAddress) || '',
            addressLines: (jsonData.shipFromDetails && jsonData.shipFromDetails.addressLines) || []
          }
        }
      };
      
      // DEBUG: SSCC values in recordData
      log.debug('SSCC Debug - renderPalletLabelPdf', 'recordData.ssccBarcode: "' + recordData.ssccBarcode + '", length: ' + (recordData.ssccBarcode ? recordData.ssccBarcode.length : 0));
      log.debug('SSCC Debug - renderPalletLabelPdf', 'recordData.sscc: "' + recordData.sscc + '", length: ' + (recordData.sscc ? recordData.sscc.length : 0));
      
      // Add custom data source
      var dataSourceData = { record: recordData };
      renderer.addCustomDataSource({
        format: render.DataSource.OBJECT,
        alias: 'JSON',
        data: dataSourceData
      });
      
      // Get template from separate library (bypasses NetSuite template validation)
      var templateString = templateLib.getPalletLabelTemplate();
      
      // Set the inline template
      renderer.templateContent = templateString;
      
      // Render and save
      var pdf = renderer.renderAsPdf();
      pdf.folder = pdfFolderId;
      
      // File name: "{ponumber} pallet {pallet index} of {total pallets}.pdf"
      var poNumber = jsonData.poNumber || '';
      var palletNumber = jsonData.palletNumber;
      var totalPallets = jsonData.totalPallets;
      
      var fileName = poNumber + ' pallet ' + palletNumber + ' of ' + totalPallets;
      
      // Remove invalid characters for file names
      fileName = fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
      
      pdf.name = fileName + '.pdf';
      pdf.isOnline = true;
      
      var fileId = pdf.save();
      log.audit('renderPalletLabelPdf', 'PDF generated successfully - File ID: ' + fileId + ', File Name: ' + fileName + '.pdf');
      
      return fileId;
      
    } catch (error) {
      log.error('renderPalletLabelPdf Error', error);
      return null;
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
  
  return {
    generatePalletLabel: generatePalletLabel
  };
});

