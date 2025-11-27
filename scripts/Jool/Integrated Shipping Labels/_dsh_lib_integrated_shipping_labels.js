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
 * - Sets carton numbers, reference2 (Amazon ARN), and shipmethod
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
      log.audit('createIntegratedShippingLabels', 'Starting processing for IF: ' + ifId);
      
      // Load the Item Fulfillment record
      var ifRecord = record.load({
        type: record.Type.ITEM_FULFILLMENT,
        id: ifId,
        isDynamic: true
      });
      
      var tranId = ifRecord.getValue('tranid') || ifId;
      var entityId = ifRecord.getValue('entity');
      
      if (!entityId) {
        return {
          success: false,
          error: 'No entity found on IF ' + tranId
        };
      }
      
      log.debug('createIntegratedShippingLabels', 'Processing IF: ' + tranId + ' (ID: ' + ifId + '), Entity: ' + entityId);
      
      // Load customer record to get carrier type and shipmethod
      var customerRecord = record.load({
        type: record.Type.CUSTOMER,
        id: entityId,
        isDynamic: false
      });
      
      // 1. Set IF status to Packed
      // Status "Packed" is typically status 2 (check your NetSuite configuration)
      // Using record.STATUS.PACKED if available, otherwise use 2
      try {
        ifRecord.setValue({
          fieldId: 'status',
          value: record.Status.PACKED || 2
        });
        log.debug('createIntegratedShippingLabels', 'Set IF status to Packed');
      } catch (statusError) {
        log.error('createIntegratedShippingLabels', 'Error setting status: ' + statusError.toString());
        // Continue processing even if status fails
      }
      
      // 2. Set shipcarrier from custentity_carrier_type (get text value)
      try {
        var carrierTypeText = customerRecord.getText({
          fieldId: 'custentity_carrier_type'
        });
        
        if (carrierTypeText) {
          // If it's a multi-select, get first value; if single select, use the text
          var carrierValue = carrierTypeText.split(',')[0].trim();
          ifRecord.setValue({
            fieldId: 'shipcarrier',
            value: carrierValue
          });
          log.debug('createIntegratedShippingLabels', 'Set shipcarrier to: ' + carrierValue);
        } else {
          log.debug('createIntegratedShippingLabels', 'No carrier type found on entity');
        }
      } catch (carrierError) {
        log.error('createIntegratedShippingLabels', 'Error setting shipcarrier: ' + carrierError.toString());
        // Continue processing
      }
      
      // 3. Set thirdpartytypeups to _thirdPartyBilling
      // _thirdPartyBilling is a constant in record module, typically value 2
      try {
        ifRecord.setValue({
          fieldId: 'thirdpartytypeups',
          value: record.ThirdPartyTypeUPS.THIRD_PARTY_BILLING || 2
        });
        log.debug('createIntegratedShippingLabels', 'Set thirdpartytypeups to _thirdPartyBilling');
      } catch (thirdPartyError) {
        log.error('createIntegratedShippingLabels', 'Error setting thirdpartytypeups: ' + thirdPartyError.toString());
        // Continue processing
      }
      
      // 4. Search for SPS packages related to this IF
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
      
      var spsPackages = [];
      packageSearch.run().each(function(pkgResult) {
        var pkgId = pkgResult.id;
        var pkgData = {
          id: pkgId,
          height: parseFloat(pkgResult.getValue('custrecord_sps_package_height')) || 0,
          length: parseFloat(pkgResult.getValue('custrecord_sps_package_length')) || 0,
          width: parseFloat(pkgResult.getValue('custrecord_sps_package_width')) || 0,
          weight: parseFloat(pkgResult.getValue('custrecord_sps_pk_weight')) || 0,
          levelType: pkgResult.getValue('custrecord_sps_package_level_type'),
          location: pkgResult.getValue('custrecord_sps_package_location'),
          qty: parseFloat(pkgResult.getValue('custrecord_sps_package_qty')) || 0
        };
        
        spsPackages.push(pkgData);
        return true;
      });
      
      log.debug('createIntegratedShippingLabels', 'Found ' + spsPackages.length + ' SPS package(s) for IF ' + tranId);
      
      if (spsPackages.length === 0) {
        return {
          success: false,
          error: 'No SPS packages found for IF ' + tranId
        };
      }
      
      // 5. Get Amazon ARN from IF
      var amazonArn = ifRecord.getValue('custbody_amazon_arn') || '';
      log.debug('createIntegratedShippingLabels', 'Amazon ARN: ' + amazonArn);
      
      // 6. Get shipmethod from custentity_integrated_shipmethod
      var integratedShipmethod = customerRecord.getValue('custentity_integrated_shipmethod');
      if (!integratedShipmethod) {
        // Try to get text value if it's a select field
        try {
          var shipmethodText = customerRecord.getText({
            fieldId: 'custentity_integrated_shipmethod'
          });
          if (shipmethodText) {
            integratedShipmethod = shipmethodText.split(',')[0].trim();
          }
        } catch (e) {
          log.debug('createIntegratedShippingLabels', 'Could not get shipmethod text value');
        }
      }
      log.debug('createIntegratedShippingLabels', 'Integrated shipmethod: ' + integratedShipmethod);
      
      // 7. Remove existing package lines (optional - comment out if you want to keep existing)
      var currentPackageCount = ifRecord.getLineCount({
        sublistId: 'package'
      });
      
      // Uncomment if you want to remove existing package lines:
      // for (var i = currentPackageCount - 1; i >= 0; i--) {
      //   ifRecord.removeLine({
      //     sublistId: 'package',
      //     line: i,
      //     ignoreRecalc: true
      //   });
      // }
      
      // 8. Create package lines from SPS packages
      var cartonNumber = currentPackageCount; // Start carton number from existing count + 1
      
      spsPackages.forEach(function(spsPkg, index) {
        var lineIndex = currentPackageCount + index;
        
        // Insert new package line
        ifRecord.insertLine({
          sublistId: 'package',
          line: lineIndex
        });
        
        // Set package dimensions and weight
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packageweight',
          line: lineIndex,
          value: spsPkg.weight
        });
        
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packagelength',
          line: lineIndex,
          value: spsPkg.length
        });
        
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packagewidth',
          line: lineIndex,
          value: spsPkg.width
        });
        
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packageheight',
          line: lineIndex,
          value: spsPkg.height
        });
        
        // Set carton number (incrementing)
        // Note: Carton number field may vary - common field IDs: 'cartonnumber', 'packagecartonnumber', 'packagecarton'
        cartonNumber++;
        try {
          ifRecord.setSublistValue({
            sublistId: 'package',
            fieldId: 'packagecartonnumber',  // Try this field ID first
            line: lineIndex,
            value: cartonNumber
          });
        } catch (cartonError) {
          // Try alternative field ID
          try {
            ifRecord.setSublistValue({
              sublistId: 'package',
              fieldId: 'cartonnumber',
              line: lineIndex,
              value: cartonNumber
            });
          } catch (e) {
            log.debug('createIntegratedShippingLabels', 'Could not set carton number - field may not exist or have different ID');
          }
        }
        
        // Set reference2 to Amazon ARN
        if (amazonArn) {
          ifRecord.setSublistValue({
            sublistId: 'package',
            fieldId: 'reference2ups',
            line: lineIndex,
            value: amazonArn
          });
        }
        
        // 9. Get package content where include_in_package = True
        // Note: include_in_package is a field on the custpage_package_content sublist of the SPS package record,
        // not on the customrecord_sps_content record itself. We'll get all content records for this package.
        // If filtering by include_in_package is needed, you would need to load the SPS package record
        // and check the sublist field.
        var packageContentSearch = search.create({
          type: 'customrecord_sps_content',
          filters: [
            ['custrecord_sps_content_package', 'anyof', spsPkg.id]
            // Note: include_in_package is not a field on customrecord_sps_content
            // If you need to filter by this, load the SPS package record and check the sublist
          ],
          columns: [
            'internalid',
            'custrecord_sps_content_item',
            'custrecord_sps_content_qty',
            'custrecord_sps_content_item_line_num'
          ]
        });
        
        var packageContents = [];
        packageContentSearch.run().each(function(contentResult) {
          packageContents.push({
            id: contentResult.id,
            item: contentResult.getValue('custrecord_sps_content_item'),
            qty: parseFloat(contentResult.getValue('custrecord_sps_content_qty')) || 0,
            lineNum: contentResult.getValue('custrecord_sps_content_item_line_num')
          });
          return true;
        });
        
        log.debug('createIntegratedShippingLabels', 'Package ' + spsPkg.id + ' has ' + packageContents.length + ' content record(s)');
        
        // TODO: If you need to filter by include_in_package = True, you would need to:
        // 1. Load the SPS package record: record.load({ type: 'customrecord_sps_package', id: spsPkg.id })
        // 2. Loop through custpage_package_content sublist
        // 3. Check include_in_package field value
        // 4. Get the corresponding content record IDs
        
        log.debug('createIntegratedShippingLabels', 'Created package line ' + (index + 1) + ' for SPS package ' + spsPkg.id + 
                  ' - Weight: ' + spsPkg.weight + ', Dimensions: ' + spsPkg.length + 'x' + spsPkg.width + 'x' + spsPkg.height);
      });
      
      // 10. Set shipmethod on IF
      if (integratedShipmethod) {
        ifRecord.setValue({
          fieldId: 'shipmethod',
          value: integratedShipmethod
        });
        log.debug('createIntegratedShippingLabels', 'Set shipmethod to: ' + integratedShipmethod);
      }
      
      // 11. Save the record
      ifRecord.save({
        enableSourcing: false,
        ignoreMandatoryFields: true
      });
      
      log.audit('createIntegratedShippingLabels', 'Successfully created ' + spsPackages.length + ' package line(s) for IF: ' + tranId);
      
      return {
        success: true,
        packagesCreated: spsPackages.length,
        tranId: tranId,
        ifId: ifId
      };
      
    } catch (e) {
      log.error('createIntegratedShippingLabels', 'Error processing IF ' + ifId + ': ' + e.toString());
      log.error('createIntegratedShippingLabels', 'Stack trace: ' + (e.stack || 'N/A'));
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

