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
  'N/url'
], function (search, render, record, log, file, url) {
  
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
        log.error('collectPalletData Failed', collectError);
        return {
          success: false,
          error: collectError.message || 'Could not collect pallet data'
        };
      }
      
      if (!jsonData) {
        return {
          success: false,
          error: 'Could not collect pallet data'
        };
      }
      
      // Step 2: Use provided folder ID or default
      pdfFolderId = pdfFolderId || 1373; // Default folder ID (same as BOL)
      
      // Step 3: Generate PDF using render module
      if (!templateId || templateId === '') {
        templateId = 'CUSTTMPL_DSH_PALLET_LABEL_TEMP'; // Default template ID
        log.audit('Template ID', 'Using default template: ' + templateId);
      }
      
      log.audit('Template ID Final', 'About to render PDF with template: ' + templateId);
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
          ifData = getIFData(ifId);
        } catch (e) {
          log.error('Error loading IF data', e);
        }
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
          type: 'customrecord_pallet',
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
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      
      var tranId = ifRecord.getValue('tranid') || ifId;
      var poNumber = ifRecord.getValue('custbody_sps_ponum_from_salesorder') || '';
      var entityId = ifRecord.getValue('entity');
      
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
          
          // Parse address for separate fields
          var addressLines = mainAddressText.split(/<br\s*\/?>|\n/);
          shipFromDetails = {
            company: locationName || '',
            address1: addressLines[0] || '',
            address2: addressLines[1] || '',
            city: locationRecord.getValue('city') || '',
            state: locationRecord.getValue('state') || '',
            zip: locationRecord.getValue('zip') || '',
            country: locationRecord.getValue('country') || 'US'
          };
          
          shipFromAddress = {
            fullAddress: mainAddressText,
            locationName: locationName
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
      
      return {
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
      log.audit('renderPalletLabelPdf', 'Generating PDF for pallet: ' + jsonData.palletName);
      
      log.audit('Template Debug', 'Using Template ID: ' + templateId);
      log.audit('Template Debug', 'Pallet data - palletName: ' + jsonData.palletName + ', packageCount: ' + jsonData.packageCount);
      
      var renderer = render.create();
      renderer.setTemplateByScriptId(templateId);
      
      // Add record context - template is configured for customrecord_asn_pallet record type
      // This is required for templates with saved search fields
      if (jsonData.palletId) {
        try {
          renderer.addRecord({
            type: 'customrecord_asn_pallet',
            id: jsonData.palletId
          });
          log.debug('renderPalletLabelPdf', 'Added pallet record context: ' + jsonData.palletId);
        } catch (recordError) {
          log.debug('renderPalletLabelPdf', 'Could not add pallet record context: ' + recordError.toString());
          // Continue without record context - custom data source should still work
        }
      } else {
        log.error('renderPalletLabelPdf', 'Missing palletId - cannot add record context required by template');
        throw new Error('Missing palletId - template requires customrecord_asn_pallet record context');
      }
      
      // Structure data to match pallet record field names with IF join
      // This allows template to use: record.custrecord_parent_if.shipaddr1
      var recordData = {
        id: jsonData.palletId,
        name: jsonData.palletName,
        custrecord_pallet_index: jsonData.palletNumber,
        custrecord_total_pallet_count: jsonData.totalPallets,
        custrecord_items: jsonData.asin || '',
        custrecord_parent_if: {
          id: jsonData.ifId,
          tranid: jsonData.ifTranId,
          custbody_sps_ponum_from_salesorder: jsonData.poNumber,
          shipcompany: (jsonData.shipToAddress && jsonData.shipToAddress.company) || '',
          shipaddr1: (jsonData.shipToAddress && jsonData.shipToAddress.address1) || '',
          shipcity: (jsonData.shipToAddress && jsonData.shipToAddress.city) || '',
          shipstate: (jsonData.shipToAddress && jsonData.shipToAddress.state) || '',
          shipzip: (jsonData.shipToAddress && jsonData.shipToAddress.zip) || '',
          custbody_sps_billofladingnumber: jsonData.bolNumber || '',
          custbody_sps_carrierpronumber: jsonData.proNumber || '',
          custbody_amazon_arn: jsonData.arnNumber || '',
          custbody_ship_from_location: {
            id: jsonData.locationId || '',
            name: jsonData.locationName || '',
            mainaddress_text: (jsonData.shipFromAddress && jsonData.shipFromAddress.fullAddress) || ''
          }
        }
      };
      
      renderer.addCustomDataSource({
        format: render.DataSource.OBJECT,
        alias: 'record',
        data: recordData
      });
      
      var pdf = renderer.renderAsPdf();
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
      log.audit('renderPalletLabelPdf', 'PDF saved - File ID: ' + fileId + ', File Name: ' + fileName + '.pdf, Folder ID: ' + pdfFolderId);
      
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

