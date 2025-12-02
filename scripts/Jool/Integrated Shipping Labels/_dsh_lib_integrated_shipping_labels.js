/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * 
 * Library script for creating integrated shipping labels from SPS packages.
 * 
 * This library:
 * - Sets IF status to Packed
 * - Sets shipcarrier from entity's custentity_carrier_type
 * - Sets thirdpartytypeups to _thirdPartyBilling
 * - Searches SPS packages for the IF
 * - Creates package lines from SPS package data
 * - Sets carton numbers, reference2 (PO Number), and shipmethod
 * 
 * Can be called from:
 * - Map/Reduce script (bulk processing)
 * - Suitelet (button trigger)
 * - User Event (record change trigger)
 */

define([
  'N/record',
  'N/search',
  'N/log'
], function (record, search, log) {
  
  /**
   * Main function to create integrated shipping labels from SPS packages
   * @param {string|number} ifId - Item Fulfillment internal ID
   * @returns {Object} Result object with success status and details
   */
  function createIntegratedShippingLabels(ifId) {
    try {
      log.audit('createIntegratedShippingLabels', '=== STARTING PROCESSING ===');
      
      // Load the Item Fulfillment record
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: true
      });
      
      var tranId = ifRecord.getValue('tranid') || ifId;
      var entityId = ifRecord.getValue('entity');
      
      if (!entityId) {
        log.error('createIntegratedShippingLabels', 'No entity found on IF ' + tranId);
        return {
          success: false,
          error: 'No entity found on IF ' + tranId
        };
      }
      
      // Load customer record to get carrier type and shipmethod
      var customerRecord = record.load({
        type: record.Type.CUSTOMER,
        id: entityId,
        isDynamic: false
      });
      
      // Get shipmethod value
      var integratedShipmethod = customerRecord.getValue('custentity_integrated_shipmethod');
      if (!integratedShipmethod) {
        try {
          var shipmethodText = customerRecord.getText({
            fieldId: 'custentity_integrated_shipmethod'
          });
          if (shipmethodText) {
            integratedShipmethod = shipmethodText.split(',')[0].trim();
          }
        } catch (e) {
          // Shipmethod may not be available
        }
      }
      
      log.audit('createIntegratedShippingLabels', 'Processing IF: ' + tranId + ' (ID: ' + ifId + '), Entity: ' + entityId + ', Shipmethod: ' + (integratedShipmethod || 'none'));
      
      // 1. Set shipcarrier from custentity_carrier_type
      var carrierValue = '';
      try {
        var carrierTypeId = customerRecord.getValue({
          fieldId: 'custentity_carrier_type'
        });
        
        if (carrierTypeId) {
          var carrierId = Array.isArray(carrierTypeId) ? carrierTypeId[0] : carrierTypeId;
          if (carrierId == 1) {
            carrierValue = 'ups';
          } else if (carrierId == 2) {
            carrierValue = 'nonups';
          }
          
          if (carrierValue) {
            ifRecord.setValue({
              fieldId: 'shipcarrier',
              value: carrierValue
            });
          }
        }
      } catch (carrierError) {
        log.error('createIntegratedShippingLabels', 'Error setting shipcarrier: ' + carrierError.toString());
      }
      
      // Determine which package sublist and fields to use based on carrier
      var packageSublistId = (carrierValue === 'ups') ? 'packageups' : 'package';
      var packageWeightFieldId = (carrierValue === 'ups') ? 'packageweightups' : 'packageweight';
      // Dimension fields: only set for UPS, leave empty for non-UPS
      var packageLengthFieldId = (carrierValue === 'ups') ? 'packagelengthups' : null;
      var packageWidthFieldId = (carrierValue === 'ups') ? 'packagewidthups' : null;
      var packageHeightFieldId = (carrierValue === 'ups') ? 'packageheightups' : null;
      log.debug('createIntegratedShippingLabels', 'Carrier: ' + carrierValue + ', Sublist: ' + packageSublistId + ', Weight: ' + packageWeightFieldId + ', Dimensions: ' + (packageLengthFieldId || 'not set (non-UPS)'));
      
      // 2. Set shipmethod on IF and generateintegratedshipperlabel
      if (integratedShipmethod) {
        try {
          ifRecord.setValue({
            fieldId: 'shipmethod',
            value: integratedShipmethod
          });
          ifRecord.setValue({
            fieldId: 'generateintegratedshipperlabel',
            value: true
          });
        } catch (shipmethodError) {
          log.error('createIntegratedShippingLabels', 'Error setting shipmethod/generateintegratedshipperlabel: ' + shipmethodError.toString());
        }
      }
      
      // 3. Set IF status to Packed and shipstatus to "B"
      try {
        ifRecord.setValue({ fieldId: 'status', value: 2 });
        ifRecord.setValue({ fieldId: 'shipstatus', value: 'B' });
        log.debug('createIntegratedShippingLabels', 'Set status to Packed (2) and shipstatus to "B"');
      } catch (statusError) {
        log.error('createIntegratedShippingLabels', 'Error setting status/shipstatus: ' + statusError.toString());
      }
      
      // 5. Search for SPS packages related to this IF
      log.debug('createIntegratedShippingLabels', 'Searching for SPS packages');
      log.debug('createIntegratedShippingLabels', 'Searching for packages with ASN = IF ID: ' + ifId);
      var packageSearch = search.create({
        type: 'customrecord_sps_package',
        filters: [
          ['custrecord_sps_pack_asn', 'anyof', ifId]
        ],
        columns: [
          'internalid',
          'custrecord_sps_package_height',
          'custrecord_sps_package_length',
          'custrecord_sps_package_level_type',
          'custrecord_sps_package_location',
          'custrecord_sps_package_qty',
          'custrecord_sps_package_width',
          'custrecord_sps_pk_weight'
        ]
      });
      log.debug('createIntegratedShippingLabels', 'Package search created, running search...');
      
      var spsPackages = [];
      var totalWeight = 0;
      var packagesWithWeight = 0;
      var packagesWithoutWeight = 0;
      
      packageSearch.run().each(function(pkgResult) {
        var pkgId = pkgResult.id;
        var rawHeight = pkgResult.getValue('custrecord_sps_package_height');
        var rawLength = pkgResult.getValue('custrecord_sps_package_length');
        var rawWidth = pkgResult.getValue('custrecord_sps_package_width');
        var rawWeight = pkgResult.getValue('custrecord_sps_pk_weight');
        
        // Parse and round dimensions to integers (UPS requires integers)
        var parsedWeight = parseFloat(rawWeight) || 0;
        var parsedHeight = Math.round(parseFloat(rawHeight) || 0);
        var parsedLength = Math.round(parseFloat(rawLength) || 0);
        var parsedWidth = Math.round(parseFloat(rawWidth) || 0);
        
        var pkgData = {
          id: pkgId,
          height: parsedHeight,
          length: parsedLength,
          width: parsedWidth,
          weight: parsedWeight,
          levelType: pkgResult.getValue('custrecord_sps_package_level_type'),
          location: pkgResult.getValue('custrecord_sps_package_location'),
          qty: parseFloat(pkgResult.getValue('custrecord_sps_package_qty')) || 0
        };
        
        totalWeight += parsedWeight;
        if (parsedWeight > 0) {
          packagesWithWeight++;
        } else {
          packagesWithoutWeight++;
        }
        
        spsPackages.push(pkgData);
        return true;
      });
      
      log.audit('createIntegratedShippingLabels', 'Retrieved ' + spsPackages.length + ' SPS package(s). With weight: ' + packagesWithWeight + ', Without weight: ' + packagesWithoutWeight + ', Total weight: ' + totalWeight);
      
      if (spsPackages.length === 0) {
        log.error('createIntegratedShippingLabels', 'No SPS packages found for IF ' + tranId + ' - cannot proceed');
        return {
          success: false,
          error: 'No SPS packages found for IF ' + tranId
        };
      }
      
      // 6. Get PO Number from IF for reference2
      var poNumber = ifRecord.getValue('custbody_sps_ponum_from_salesorder') || '';
      
      // 7. Save the record with header fields set, then reload for package operations
      log.audit('createIntegratedShippingLabels', 'Saving IF record with header fields');
      try {
        ifRecord.save({
          enableSourcing: false,
          ignoreMandatoryFields: true
        });
        log.audit('createIntegratedShippingLabels', 'IF record saved successfully with header fields');
      } catch (saveError) {
        log.error('createIntegratedShippingLabels', 'Error saving IF record with header fields: ' + saveError.toString());
        // Continue - we'll try to add packages anyway
      }
      
      // 8. Reload the record to add package lines (use isDynamic: false like reconcile script)
      log.debug('createIntegratedShippingLabels', 'Reloading IF record for package lines');
      ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      log.debug('createIntegratedShippingLabels', 'IF record reloaded, status: ' + ifRecord.getValue('status') + ', shipcarrier: ' + ifRecord.getValue('shipcarrier'));
      
      // Set thirdpartytypeups after reload (BILLTHIRDPARTY works)
      try {
        ifRecord.setValue({
          fieldId: 'thirdpartytypeups',
          value: 'BILLTHIRDPARTY'
        });
        log.audit('createIntegratedShippingLabels', 'Set thirdpartytypeups to BILLTHIRDPARTY');
      } catch (thirdPartyError) {
        try {
          ifRecord.setValue({
            fieldId: 'thirdpartytypeups',
            value: 2
          });
          log.audit('createIntegratedShippingLabels', 'Set thirdpartytypeups to internal ID 2');
        } catch (idError) {
          log.error('createIntegratedShippingLabels', 'Error setting thirdpartytypeups: ' + idError.toString());
        }
      }
      
      
      // 9. Remove ALL existing package lines (after status is Packed, we can now modify packages)
      var currentPackageCount = ifRecord.getLineCount({
        sublistId: packageSublistId
      });
      if (currentPackageCount > 0) {
        log.debug('createIntegratedShippingLabels', 'Removing ' + currentPackageCount + ' existing package line(s)');
        for (var i = currentPackageCount - 1; i >= 0; i--) {
          try {
            ifRecord.removeLine({
              sublistId: packageSublistId,
              line: i,
              ignoreRecalc: true
            });
          } catch (removeError) {
            log.error('createIntegratedShippingLabels', 'Error removing package line ' + i + ': ' + removeError.toString());
          }
        }
      }
      
      // 10. Create package lines from SPS packages
      log.debug('createIntegratedShippingLabels', 'Creating ' + spsPackages.length + ' package line(s)');
      var cartonNumber = 0;
      
      for (var index = 0; index < spsPackages.length; index++) {
        var spsPkg = spsPackages[index];
        var lineIndex = index;
        
        // Insert new package line
        try {
          ifRecord.insertLine({
            sublistId: packageSublistId,
            line: index
          });
        } catch (insertError) {
          log.error('createIntegratedShippingLabels', 'Error inserting package line: ' + insertError.toString());
          throw insertError;
        }
        
        // Set package weight
        try {
          ifRecord.setSublistValue({
            sublistId: packageSublistId,
            fieldId: packageWeightFieldId,
            line: lineIndex,
            value: spsPkg.weight
          });
        } catch (weightError) {
          log.error('createIntegratedShippingLabels', 'Error setting package weight: ' + weightError.toString());
          throw weightError;
        }
        
        // Set package description if weight is 0 or missing (NetSuite requires either weight or description)
        if (!spsPkg.weight || spsPkg.weight === 0) {
          var packageDescription = 'Package ' + (cartonNumber + 1);
          var descFieldIds = (carrierValue === 'ups') 
            ? ['packagedescrups', 'packagedesc', 'description']
            : ['packagedesc', 'description'];
          
          var descSet = false;
          for (var descIdx = 0; descIdx < descFieldIds.length && !descSet; descIdx++) {
            try {
              ifRecord.setSublistValue({
                sublistId: packageSublistId,
                fieldId: descFieldIds[descIdx],
                line: lineIndex,
                value: packageDescription
              });
              descSet = true;
            } catch (descError) {
              // Try next field
            }
          }
        }
        
        // Set package dimensions (only for UPS)
        if (carrierValue === 'ups' && packageLengthFieldId) {
          ifRecord.setSublistValue({
            sublistId: packageSublistId,
            fieldId: packageLengthFieldId,
            line: lineIndex,
            value: spsPkg.length
          });
          ifRecord.setSublistValue({
            sublistId: packageSublistId,
            fieldId: packageWidthFieldId,
            line: lineIndex,
            value: spsPkg.width
          });
          ifRecord.setSublistValue({
            sublistId: packageSublistId,
            fieldId: packageHeightFieldId,
            line: lineIndex,
            value: spsPkg.height
          });
        }
        // Note: For non-UPS carriers, dimension fields are not set (left empty)
        
        // Set carton number
        cartonNumber++;
        try {
          ifRecord.setSublistValue({
            sublistId: packageSublistId,
            fieldId: 'packagecartonnumber',
            line: lineIndex,
            value: cartonNumber
          });
        } catch (cartonError) {
          try {
            ifRecord.setSublistValue({
              sublistId: packageSublistId,
              fieldId: 'cartonnumber',
              line: lineIndex,
              value: cartonNumber
            });
          } catch (e) {
            // Carton number field may not exist
          }
        }
        
        // Set reference2 to PO Number
        if (poNumber) {
          var reference2FieldId = (carrierValue === 'ups') ? 'reference2ups' : 'reference2';
          ifRecord.setSublistValue({
            sublistId: packageSublistId,
            fieldId: reference2FieldId,
            line: lineIndex,
            value: poNumber
          });
        }
      }
      
      // 12. Save the record with package lines
      var finalPackageCount = ifRecord.getLineCount({
        sublistId: packageSublistId
      });
      log.audit('createIntegratedShippingLabels', 'Saving IF record with ' + finalPackageCount + ' package line(s)');
      try {
        ifRecord.save({
          enableSourcing: false,
          ignoreMandatoryFields: true
        });
        log.debug('createIntegratedShippingLabels', 'IF record saved successfully');
      } catch (saveError) {
        log.error('createIntegratedShippingLabels', 'ERROR saving IF record: ' + saveError.toString());
        log.error('createIntegratedShippingLabels', 'Save error type: ' + (saveError.name || 'Unknown'));
        log.error('createIntegratedShippingLabels', 'Save error message: ' + (saveError.message || 'N/A'));
        log.error('createIntegratedShippingLabels', 'Save error stack: ' + (saveError.stack || 'N/A'));
        throw saveError;
      }
      
      log.audit('createIntegratedShippingLabels', '=== SUCCESSFULLY COMPLETED PROCESSING ===');
      log.audit('createIntegratedShippingLabels', 'Successfully created ' + spsPackages.length + ' package line(s) for IF: ' + tranId);
      
      return {
        success: true,
        packagesCreated: spsPackages.length,
        tranId: tranId,
        ifId: ifId
      };
      
    } catch (e) {
      log.error('createIntegratedShippingLabels', '=== ERROR OCCURRED ===');
      log.error('createIntegratedShippingLabels', 'Error processing IF ' + ifId + ': ' + e.toString());
      log.error('createIntegratedShippingLabels', 'Error type: ' + (e.name || 'Unknown'));
      log.error('createIntegratedShippingLabels', 'Stack trace: ' + (e.stack || 'N/A'));
      log.error('createIntegratedShippingLabels', 'Error message: ' + (e.message || 'N/A'));
      return {
        success: false,
        error: e.toString(),
        ifId: ifId
      };
    }
  }
  
  return {
    createIntegratedShippingLabels: createIntegratedShippingLabels
  };
});

