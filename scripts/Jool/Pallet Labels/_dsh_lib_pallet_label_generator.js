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
  './_dsh_lib_pallet_label_template'
], function (search, render, record, log, file, url, templateLib) {
  
  /**
   * Main function to generate pallet label PDF
   * @param {string} palletId - Pallet record internal ID (optional)
   * @param {string} ifId - Item Fulfillment internal ID (optional, used if palletId not provided)
   * @param {number} pdfFolderId - File cabinet folder ID for PDF storage
   * @param {string} templateId - Advanced PDF/HTML Template ID (optional, defaults to CUSTTMPL_DSH_PALLET_LABEL)
   * @param {Object} options - Additional options (palletNumber, etc.)
   * @returns {Object} Result object with success status and fileId
   */
  function generatePalletLabel(palletId, ifId, pdfFolderId, templateId, options) {
    try {
      options = options || {};
      
      // Step 1: Collect data from pallet record or IF
      var jsonData;
      try {
        if (palletId) {
          jsonData = collectPalletData(palletId);
        } else if (ifId) {
          jsonData = collectIFPalletData(ifId, options);
        } else {
          return {
            success: false,
            error: 'Either palletId or ifId must be provided'
          };
        }
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
      
      log.debug('generatePalletLabel', 'Data collected - palletName: ' + jsonData.palletName + ', ifId: ' + jsonData.ifId + ', locationId: ' + jsonData.locationId);
      
      // Step 2: Use provided folder ID or default
      pdfFolderId = pdfFolderId || 1373; // Default folder ID (same as BOL)
      
      // Step 3: Generate PDF using render module
      if (!templateId || templateId === '') {
        templateId = 'CUSTTMPL_NEW_PALLET'; // Default template ID
      }
      
      log.debug('generatePalletLabel', 'Starting PDF render - templateId: ' + templateId + ', pdfFolderId: ' + pdfFolderId);
      var fileId = renderPalletLabelPdf(jsonData, palletId || ifId, pdfFolderId, templateId);
      
      if (!fileId) {
        return {
          success: false,
          error: 'Failed to generate PDF'
        };
      }
      
      // Step 4: Optionally attach PDF to pallet record or IF
      if (options.attachToRecord !== false) {
        try {
          if (palletId) {
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
          } else if (ifId) {
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
          }
        } catch (attachError) {
          log.error('Error attaching PDF', attachError);
          // Don't fail the whole operation if attachment fails
        }
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
      
      // Load pallet record
      var palletRecord = record.load({
        type: 'customrecord_asn_pallet',
        id: palletId,
        isDynamic: false
      });
      
      var palletName = palletRecord.getValue('name') || palletId;
      var ifId = palletRecord.getValue('custrecord_parent_if');
      
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
      
      // ASIN placeholder (hardcoded for now)
      var asin = 'ASIN_PLACEHOLDER';
      
      // Get pallet index and total pallet count from pallet record (already set when pallet was created)
      var palletNumber = palletRecord.getValue('custrecord_pallet_index') || 1;
      var totalPallets = palletRecord.getValue('custrecord_total_pallet_count') || 1;
      
      // Get SSCC (Serial Shipping Container Code) - can be generated or stored on pallet
      var sscc = palletRecord.getValue('custrecord_pallet_sscc') || '';
      if (!sscc) {
        // Generate SSCC format: (00) + 18 digits
        // For now, use pallet ID padded, but this should be a proper SSCC generation
        var palletIdStr = String(palletId);
        while (palletIdStr.length < 18) {
          palletIdStr = '0' + palletIdStr;
        }
        sscc = '(00) ' + palletIdStr;
      }
      
      // Build JSON data object for template
      var jsonData = {
        palletId: palletId,
        palletName: palletName,
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
        // ASIN
        asin: asin,
        // Barcodes
        poBarcode: (ifData && ifData.poNumber) || '',
        sscc: sscc,
        ssccBarcode: sscc.replace(/[^0-9]/g, ''), // SSCC without formatting for barcode
        barcode: palletId,
        qrCode: palletId
      };
      
      log.debug('collectPalletData', 'Built jsonData - locationId: ' + jsonData.locationId + ', hasShipFromAddress: ' + (jsonData.shipFromAddress && Object.keys(jsonData.shipFromAddress).length > 0));
      log.audit('collectPalletData', 'Data collected successfully for pallet: ' + palletName);
      return jsonData;
      
    } catch (error) {
      log.error('collectPalletData Error', error);
      throw new Error('Error collecting pallet data: ' + error.message);
    }
  }
  
  /**
   * Collect pallet data from Item Fulfillment (for generating labels for all pallets on an IF)
   * @param {string} ifId - Item Fulfillment internal ID
   * @param {Object} options - Options (palletNumber, etc.)
   * @returns {Object|null} JSON data object for template or null if error
   */
  function collectIFPalletData(ifId, options) {
    try {
      log.audit('collectIFPalletData', 'Collecting data for IF: ' + ifId);
      
      var ifData = getIFData(ifId);
      
      // Get pallets for this IF
      var pallets = [];
      var palletSearch = search.create({
        type: 'customrecord_asn_pallet',
        filters: [
          ['custrecord_parent_if', 'anyof', ifId]
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'name' })
        ]
      });
      
      palletSearch.run().each(function(result) {
        pallets.push({
          palletId: result.id,
          palletName: result.getValue('name')
        });
        return true;
      });
      
      // If specific pallet number requested, filter to that pallet
      var palletNumber = options.palletNumber;
      if (palletNumber) {
        pallets = pallets.filter(function(p) {
          return p.palletName.indexOf(palletNumber) >= 0 || p.palletId === palletNumber;
        });
      }
      
      // For now, return data for first pallet (can be extended to return array)
      // Or if palletNumber specified, return that specific pallet
      var targetPallet = pallets.length > 0 ? pallets[0] : null;
      
      if (!targetPallet) {
        throw new Error('No pallets found for IF: ' + ifId);
      }
      
      // Get packages for this pallet
      var packages = [];
      var packageSearch = search.create({
        type: 'customrecord_sps_package',
        filters: [
          ['custrecord_parent_pallet', 'anyof', targetPallet.palletId]
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
      
      // ASIN placeholder (hardcoded for now)
      var asin = 'ASIN_PLACEHOLDER';
      
      // Get pallet number and total
      var palletNumber = 1;
      var totalPallets = pallets.length;
      for (var i = 0; i < pallets.length; i++) {
        if (pallets[i].palletId === targetPallet.palletId) {
          palletNumber = i + 1;
          break;
        }
      }
      
      // Get SSCC
      var sscc = '';
      try {
        var palletRecord = record.load({
          type: 'customrecord_asn_pallet',
          id: targetPallet.palletId,
          isDynamic: false
        });
        sscc = palletRecord.getValue('custrecord_pallet_sscc') || '';
        if (!sscc) {
          var palletIdStr = String(targetPallet.palletId);
          while (palletIdStr.length < 18) {
            palletIdStr = '0' + palletIdStr;
          }
          sscc = '(00) ' + palletIdStr;
        }
      } catch (e) {
        sscc = '(00) ' + String(targetPallet.palletId).padStart(18, '0');
      }
      
      var jsonData = {
        palletId: targetPallet.palletId,
        palletName: targetPallet.palletName,
        palletNumber: palletNumber,
        totalPallets: totalPallets,
        date: formatDate(new Date()),
        packages: packages,
        packageCount: packages.length,
        cartonCount: packages.length,
        totalWeight: calculateTotalWeight(packages),
        ifId: ifId,
        ifTranId: ifData.tranId || '',
        poNumber: ifData.poNumber || '',
        customerName: ifData.customerName || '',
        shipToAddress: ifData.shipToAddress || {},
        shipFromAddress: ifData.shipFromAddress || {},
        shipFromDetails: ifData.shipFromDetails || {},
        locationName: ifData.locationName || '',
        carrierName: ifData.carrierName || '',
        bolNumber: ifData.bolNumber || '',
        proNumber: ifData.proNumber || '',
        arnNumber: ifData.arnNumber || '',
        asin: asin,
        poBarcode: ifData.poNumber || '',
        sscc: sscc,
        ssccBarcode: sscc.replace(/[^0-9]/g, ''),
        barcode: targetPallet.palletId,
        qrCode: targetPallet.palletId
      };
      
      return jsonData;
      
    } catch (error) {
      log.error('collectIFPalletData Error', error);
      throw new Error('Error collecting IF pallet data: ' + error.message);
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
      log.debug('Address Sourcing Debug', 'locationId from IF: ' + locationId);
      
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
          
          log.debug('Address Sourcing Debug', 'locationName: ' + locationName);
          log.debug('Address Sourcing Debug', 'mainaddress_text: ' + mainAddressText);
          
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
          
          log.debug('Address Sourcing Debug', 'Parsed addressLines count: ' + addressLines.length);
          log.debug('Address Sourcing Debug', 'addressLines: ' + JSON.stringify(addressLines));
          
          // Debug each line individually
          for (var i = 0; i < addressLines.length; i++) {
            log.debug('Address Sourcing Debug', 'addressLines[' + i + ']: [' + addressLines[i] + '] (length: ' + addressLines[i].length + ')');
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
          
          log.debug('Address Sourcing Debug', 'shipFromAddress: ' + JSON.stringify(shipFromAddress));
          log.debug('Address Sourcing Debug', 'shipFromDetails: ' + JSON.stringify(shipFromDetails));
        } catch (e) {
          log.error('Error loading location', e);
          log.debug('Address Sourcing Debug', 'Error loading location: ' + e.toString());
        }
      } else {
        log.debug('Address Sourcing Debug', 'No locationId found on IF record');
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
      log.audit('renderPalletLabelPdf', 'Generating PDF from inline template string for pallet: ' + jsonData.palletName);
      
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
              log.debug('Address Sourcing Debug', 'Error reading from shippingaddress subrecord: ' + e.message);
            }
          }
          
          // If shipaddr1 is still empty but shipaddress field has data, parse it (same as BOL script)
          // shipaddress format: "AMAZON.COM 1101 E PEARL ST BURLINGTON NJ 08016-1934 United States"
          var shipaddress = ifRecord.getValue('shipaddress') || '';
          if (shipaddress && !shipaddr1) {
            log.debug('Address Sourcing Debug', 'shipaddr1 still empty, trying to parse shipaddress field: [' + shipaddress + ']');
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
                log.debug('Address Sourcing Debug', 'Parsed shipaddr1 from shipaddress: [' + shipaddr1 + ']');
              }
            } else {
              // Fallback: parse by position (company is first, city is typically 4th from last)
              var addressParts = cleanAddress.split(/\s+/);
              if (addressParts.length >= 6) {
                var companyIndex = shipcompany ? 0 : 0; // Company is first
                var cityIndex = addressParts.length - 4; // City is 4th from last (before state, zip, country)
                if (cityIndex > companyIndex + 1) {
                  shipaddr1 = addressParts.slice(companyIndex + 1, cityIndex).join(' ');
                  log.debug('Address Sourcing Debug', 'Parsed shipaddr1 from shipaddress (fallback): [' + shipaddr1 + ']');
                }
              }
            }
          }
          
          log.debug('Address Sourcing Debug', 'Ship-to address from IF record (BOL approach):');
          log.debug('Address Sourcing Debug', '  shipcompany: [' + shipcompany + ']');
          log.debug('Address Sourcing Debug', '  shipaddr1: [' + shipaddr1 + ']');
          log.debug('Address Sourcing Debug', '  shipaddr2: [' + shipaddr2 + ']');
          log.debug('Address Sourcing Debug', '  shipcity: [' + shipcity + ']');
          log.debug('Address Sourcing Debug', '  shipstate: [' + shipstate + ']');
          log.debug('Address Sourcing Debug', '  shipzip: [' + shipzip + ']');
          log.debug('Address Sourcing Debug', '  shipcountry: [' + shipcountry + ']');
        } catch (e) {
          log.debug('renderPalletLabelPdf', 'Could not load IF record for ship-to address: ' + e.message);
        }
      }
      
      log.debug('Address Sourcing Debug', 'Ship-to address values (final):');
      log.debug('Address Sourcing Debug', '  shipcompany: [' + shipcompany + ']');
      log.debug('Address Sourcing Debug', '  shipaddr1: [' + shipaddr1 + ']');
      log.debug('Address Sourcing Debug', '  shipaddr2: [' + shipaddr2 + ']');
      log.debug('Address Sourcing Debug', '  shipcity: [' + shipcity + ']');
      log.debug('Address Sourcing Debug', '  shipstate: [' + shipstate + ']');
      log.debug('Address Sourcing Debug', '  shipzip: [' + shipzip + ']');
      log.debug('Address Sourcing Debug', '  shipcountry: [' + shipcountry + ']');
      
      // Build recordData exactly as before
      log.debug('renderPalletLabelPdf', 'Building recordData structure...');
      var recordData = {
        id: jsonData.palletId || '',
        name: jsonData.palletName || '',
        custrecord_pallet_index: jsonData.palletNumber || 1,
        custrecord_total_pallet_count: jsonData.totalPallets || 1,
        custrecord_items: jsonData.asin || 'ASIN_PLACEHOLDER',
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
      
      // HEAVY DEBUG: Address sourcing data - show what's actually in recordData
      log.debug('Address Sourcing Debug', '=== FINAL recordData.custrecord_parent_if (being passed to template) ===');
      log.debug('Address Sourcing Debug', 'Full custrecord_parent_if object: ' + JSON.stringify(recordData.custrecord_parent_if));
      log.debug('Address Sourcing Debug', 'Ship-to fields in recordData:');
      log.debug('Address Sourcing Debug', '  shipcompany: [' + recordData.custrecord_parent_if.shipcompany + '] (type: ' + typeof recordData.custrecord_parent_if.shipcompany + ')');
      log.debug('Address Sourcing Debug', '  shipaddr1: [' + recordData.custrecord_parent_if.shipaddr1 + '] (type: ' + typeof recordData.custrecord_parent_if.shipaddr1 + ')');
      log.debug('Address Sourcing Debug', '  shipaddr2: [' + recordData.custrecord_parent_if.shipaddr2 + '] (type: ' + typeof recordData.custrecord_parent_if.shipaddr2 + ')');
      log.debug('Address Sourcing Debug', '  shipcity: [' + recordData.custrecord_parent_if.shipcity + '] (type: ' + typeof recordData.custrecord_parent_if.shipcity + ')');
      log.debug('Address Sourcing Debug', '  shipstate: [' + recordData.custrecord_parent_if.shipstate + '] (type: ' + typeof recordData.custrecord_parent_if.shipstate + ')');
      log.debug('Address Sourcing Debug', '  shipzip: [' + recordData.custrecord_parent_if.shipzip + '] (type: ' + typeof recordData.custrecord_parent_if.shipzip + ')');
      log.debug('Address Sourcing Debug', '  shipcountry: [' + recordData.custrecord_parent_if.shipcountry + '] (type: ' + typeof recordData.custrecord_parent_if.shipcountry + ')');
      log.debug('Address Sourcing Debug', '=== SHIP FROM location data ===');
      log.debug('Address Sourcing Debug', 'custbody_ship_from_location: ' + JSON.stringify(recordData.custrecord_parent_if.custbody_ship_from_location));
      
      // Add custom data source
      log.debug('renderPalletLabelPdf', 'Adding custom data source to renderer...');
      var dataSourceData = { record: recordData };
      log.debug('Address Sourcing Debug', '=== Data being passed to addCustomDataSource ===');
      log.debug('Address Sourcing Debug', 'dataSourceData.record.custrecord_parent_if.shipcompany: [' + dataSourceData.record.custrecord_parent_if.shipcompany + ']');
      log.debug('Address Sourcing Debug', 'dataSourceData.record.custrecord_parent_if.shipcity: [' + dataSourceData.record.custrecord_parent_if.shipcity + ']');
      log.debug('Address Sourcing Debug', 'dataSourceData.record.custrecord_parent_if.shipstate: [' + dataSourceData.record.custrecord_parent_if.shipstate + ']');
      log.debug('Address Sourcing Debug', 'dataSourceData.record.custrecord_parent_if.shipzip: [' + dataSourceData.record.custrecord_parent_if.shipzip + ']');
      renderer.addCustomDataSource({
        format: render.DataSource.OBJECT,
        alias: 'JSON',
        data: dataSourceData
      });
      log.debug('renderPalletLabelPdf', 'Custom data source added successfully');
      
      // Get template from separate library (bypasses NetSuite template validation)
      var templateString = templateLib.getPalletLabelTemplate();
      log.debug('renderPalletLabelPdf', 'Template loaded, length: ' + (templateString ? templateString.length : 0) + ' chars');
      
      // Set the inline template
      renderer.templateContent = templateString;
      
      // Render and save
      log.debug('renderPalletLabelPdf', 'Rendering PDF...');
      var pdf = renderer.renderAsPdf();
      log.debug('renderPalletLabelPdf', 'PDF rendered, saving to folder: ' + pdfFolderId);
      pdf.folder = pdfFolderId;
      
      // File name: PalletLabel_<pallet_name>.pdf
      var fileName = 'PalletLabel_' + (jsonData.palletName || recordId);
      
      // Remove invalid characters for file names
      fileName = fileName.replace(/[<>:"/\\|?*]/g, '_').trim();
      if (!fileName) {
        fileName = 'PalletLabel_' + recordId;
      }
      
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
    generatePalletLabel: generatePalletLabel,
    collectPalletData: collectPalletData,
    collectIFPalletData: collectIFPalletData,
    renderPalletLabelPdf: renderPalletLabelPdf,
    formatDate: formatDate
  };
});

