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
      log.audit('createIntegratedShippingLabels', '=== STARTING PROCESSING ===');
      log.debug('createIntegratedShippingLabels', 'Input IF ID: ' + ifId + ' (type: ' + typeof ifId + ')');
      
      // Load the Item Fulfillment record
      log.debug('createIntegratedShippingLabels', 'Loading IF record with ID: ' + ifId);
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: true
      });
      log.debug('createIntegratedShippingLabels', 'IF record loaded successfully');
      log.debug('createIntegratedShippingLabels', 'Record type: ' + typeof ifRecord);
      log.debug('createIntegratedShippingLabels', 'Has setSublistValue method: ' + (typeof ifRecord.setSublistValue === 'function'));
      
      var tranId = ifRecord.getValue('tranid') || ifId;
      var entityId = ifRecord.getValue('entity');
      log.debug('createIntegratedShippingLabels', 'IF TranID: ' + tranId);
      log.debug('createIntegratedShippingLabels', 'IF Entity ID: ' + entityId);
      
      if (!entityId) {
        log.error('createIntegratedShippingLabels', 'No entity found on IF ' + tranId);
        return {
          success: false,
          error: 'No entity found on IF ' + tranId
        };
      }
      
      log.debug('createIntegratedShippingLabels', 'Processing IF: ' + tranId + ' (ID: ' + ifId + '), Entity: ' + entityId);
      
      // Load customer record to get carrier type and shipmethod
      log.debug('createIntegratedShippingLabels', 'Loading customer record with ID: ' + entityId);
      var customerRecord = record.load({
        type: record.Type.CUSTOMER,
        id: entityId,
        isDynamic: false
      });
      log.debug('createIntegratedShippingLabels', 'Customer record loaded successfully');
      
      // Get shipmethod value early (needed for step 2)
      log.debug('createIntegratedShippingLabels', 'Getting integrated shipmethod value');
      var integratedShipmethod = customerRecord.getValue('custentity_integrated_shipmethod');
      log.debug('createIntegratedShippingLabels', 'Raw shipmethod value: ' + JSON.stringify(integratedShipmethod) + ' (type: ' + typeof integratedShipmethod + ')');
      if (!integratedShipmethod) {
        log.debug('createIntegratedShippingLabels', 'Shipmethod value is empty, trying to get text value');
        // Try to get text value if it's a select field
        try {
          var shipmethodText = customerRecord.getText({
            fieldId: 'custentity_integrated_shipmethod'
          });
          log.debug('createIntegratedShippingLabels', 'Shipmethod text value: "' + shipmethodText + '"');
          if (shipmethodText) {
            integratedShipmethod = shipmethodText.split(',')[0].trim();
            log.debug('createIntegratedShippingLabels', 'Extracted shipmethod from text: "' + integratedShipmethod + '"');
          }
        } catch (e) {
          log.debug('createIntegratedShippingLabels', 'Could not get shipmethod text value - error: ' + e.toString());
        }
      }
      log.debug('createIntegratedShippingLabels', 'Final integrated shipmethod: "' + integratedShipmethod + '"');
      
      // 1. Set shipcarrier from custentity_carrier_type (based on internal ID) - FIRST
      log.debug('createIntegratedShippingLabels', '=== STEP 1: Setting shipcarrier from carrier_type ===');
      var carrierValue = ''; // Store carrier value for sublist selection
      try {
        var carrierTypeId = customerRecord.getValue({
          fieldId: 'custentity_carrier_type'
        });
        log.debug('createIntegratedShippingLabels', 'Raw carrier_type value: ' + JSON.stringify(carrierTypeId) + ' (type: ' + typeof carrierTypeId + ', isArray: ' + Array.isArray(carrierTypeId) + ')');
        
        if (carrierTypeId) {
          // If it's a multi-select, get first value
          var carrierId = Array.isArray(carrierTypeId) ? carrierTypeId[0] : carrierTypeId;
          log.debug('createIntegratedShippingLabels', 'Extracted carrier ID: ' + carrierId + ' (type: ' + typeof carrierId + ')');
          
          // Map internal ID to carrier string
          log.debug('createIntegratedShippingLabels', 'Mapping carrier ID ' + carrierId + ' to carrier string');
          if (carrierId == 1) {
            carrierValue = 'ups';
            log.debug('createIntegratedShippingLabels', 'Mapped ID 1 -> ups');
          } else if (carrierId == 2) {
            carrierValue = 'nonups';
            log.debug('createIntegratedShippingLabels', 'Mapped ID 2 -> nonups');
          } else {
            log.debug('createIntegratedShippingLabels', 'Carrier ID ' + carrierId + ' does not match known mappings (1 or 2)');
          }
          
          if (carrierValue) {
            var currentShipcarrier = ifRecord.getValue('shipcarrier');
            log.debug('createIntegratedShippingLabels', 'Current shipcarrier value: ' + currentShipcarrier);
            ifRecord.setValue({
              fieldId: 'shipcarrier',
              value: carrierValue
            });
            log.debug('createIntegratedShippingLabels', 'Successfully set shipcarrier to: ' + carrierValue + ' (from carrier_type ID: ' + carrierId + ')');
          } else {
            log.debug('createIntegratedShippingLabels', 'Carrier type ID ' + carrierId + ' not mapped to carrier string - skipping shipcarrier update');
          }
        } else {
          log.debug('createIntegratedShippingLabels', 'No carrier type found on entity (value is null/empty)');
        }
      } catch (carrierError) {
        log.error('createIntegratedShippingLabels', 'Error setting shipcarrier: ' + carrierError.toString());
        log.error('createIntegratedShippingLabels', 'Carrier error stack: ' + (carrierError.stack || 'N/A'));
        // Continue processing
      }
      
      // Determine which package sublist to use based on carrier
      var packageSublistId = (carrierValue === 'ups') ? 'packageups' : 'package';
      log.debug('createIntegratedShippingLabels', 'Using package sublist: "' + packageSublistId + '" (carrier: "' + carrierValue + '")');
      
      // 2. Set shipmethod on IF - SECOND (after carrier, before thirdpartytypeups)
      log.debug('createIntegratedShippingLabels', '=== STEP 2: Setting shipmethod on IF ===');
      var currentShipmethod = ifRecord.getValue('shipmethod');
      log.debug('createIntegratedShippingLabels', 'Current shipmethod value: ' + currentShipmethod);
      if (integratedShipmethod) {
        log.debug('createIntegratedShippingLabels', 'Setting shipmethod to: "' + integratedShipmethod + '"');
        try {
          ifRecord.setValue({
            fieldId: 'shipmethod',
            value: integratedShipmethod
          });
          log.debug('createIntegratedShippingLabels', 'Shipmethod set successfully');
        } catch (shipmethodError) {
          log.error('createIntegratedShippingLabels', 'Error setting shipmethod: ' + shipmethodError.toString());
          log.error('createIntegratedShippingLabels', 'Shipmethod error stack: ' + (shipmethodError.stack || 'N/A'));
          // Continue - shipmethod might not be critical
        }
      } else {
        log.debug('createIntegratedShippingLabels', 'No integrated shipmethod to set (value is empty)');
      }
      
      // 3. Set thirdpartytypeups to _thirdPartyBilling - THIRD
      // Third party billing is typically value 2
      log.debug('createIntegratedShippingLabels', '=== STEP 3: Setting thirdpartytypeups ===');
      var currentThirdParty = ifRecord.getValue('thirdpartytypeups');
      log.debug('createIntegratedShippingLabels', 'Current thirdpartytypeups value: ' + currentThirdParty);
      var thirdPartyBillingValue = 2; // Third party billing is typically 2
      log.debug('createIntegratedShippingLabels', 'Target thirdpartytypeups value: ' + thirdPartyBillingValue);
      try {
        ifRecord.setValue({
          fieldId: 'thirdpartytypeups',
          value: thirdPartyBillingValue
        });
        log.debug('createIntegratedShippingLabels', 'Successfully set thirdpartytypeups to _thirdPartyBilling (' + thirdPartyBillingValue + ')');
      } catch (thirdPartyError) {
        log.error('createIntegratedShippingLabels', 'Error setting thirdpartytypeups: ' + thirdPartyError.toString());
        log.error('createIntegratedShippingLabels', 'ThirdParty error stack: ' + (thirdPartyError.stack || 'N/A'));
        // Continue processing
      }
      
      // 4. Set IF status to Packed - FOURTH (after carrier, method, thirdpartytypeups)
      // Status "Packed" is typically status 2 (check your NetSuite configuration)
      log.debug('createIntegratedShippingLabels', '=== STEP 4: Setting IF status to Packed ===');
      var currentStatus = ifRecord.getValue('status');
      log.debug('createIntegratedShippingLabels', 'Current IF status: ' + currentStatus);
      var packedStatus = 2; // Packed status is typically 2 for Item Fulfillment
      log.debug('createIntegratedShippingLabels', 'Target packed status value: ' + packedStatus);
      try {
        ifRecord.setValue({
          fieldId: 'status',
          value: packedStatus
        });
        log.debug('createIntegratedShippingLabels', 'Successfully set IF status to Packed (' + packedStatus + ')');
      } catch (statusError) {
        log.error('createIntegratedShippingLabels', 'Error setting status: ' + statusError.toString());
        log.error('createIntegratedShippingLabels', 'Status error stack: ' + (statusError.stack || 'N/A'));
        // Continue processing even if status fails
      }
      
      // 4b. Set shipstatus to "B"
      log.debug('createIntegratedShippingLabels', '=== STEP 4b: Setting shipstatus to "B" ===');
      var currentShipstatus = ifRecord.getValue('shipstatus');
      log.debug('createIntegratedShippingLabels', 'Current shipstatus value: ' + currentShipstatus);
      try {
        ifRecord.setValue({
          fieldId: 'shipstatus',
          value: 'B'
        });
        log.debug('createIntegratedShippingLabels', 'Successfully set shipstatus to "B"');
      } catch (shipstatusError) {
        log.error('createIntegratedShippingLabels', 'Error setting shipstatus: ' + shipstatusError.toString());
        log.error('createIntegratedShippingLabels', 'Shipstatus error stack: ' + (shipstatusError.stack || 'N/A'));
        // Continue processing even if shipstatus fails
      }
      
      // 5. Search for SPS packages related to this IF
      log.debug('createIntegratedShippingLabels', '=== STEP 5: Searching for SPS packages ===');
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
      var packageCount = 0;
      packageSearch.run().each(function(pkgResult) {
        packageCount++;
        var pkgId = pkgResult.id;
        log.debug('createIntegratedShippingLabels', 'Processing SPS package #' + packageCount + ' - ID: ' + pkgId);
        
        var rawHeight = pkgResult.getValue('custrecord_sps_package_height');
        var rawLength = pkgResult.getValue('custrecord_sps_package_length');
        var rawWidth = pkgResult.getValue('custrecord_sps_package_width');
        var rawWeight = pkgResult.getValue('custrecord_sps_pk_weight');
        var rawQty = pkgResult.getValue('custrecord_sps_package_qty');
        
        log.debug('createIntegratedShippingLabels', 'Package ' + pkgId + ' raw values - Height: ' + rawHeight + ', Length: ' + rawLength + ', Width: ' + rawWidth + ', Weight: ' + rawWeight + ', Qty: ' + rawQty);
        
        var pkgData = {
          id: pkgId,
          height: parseFloat(rawHeight) || 0,
          length: parseFloat(rawLength) || 0,
          width: parseFloat(rawWidth) || 0,
          weight: parseFloat(rawWeight) || 0,
          levelType: pkgResult.getValue('custrecord_sps_package_level_type'),
          location: pkgResult.getValue('custrecord_sps_package_location'),
          qty: parseFloat(rawQty) || 0
        };
        
        log.debug('createIntegratedShippingLabels', 'Package ' + pkgId + ' parsed data - Height: ' + pkgData.height + ', Length: ' + pkgData.length + ', Width: ' + pkgData.width + ', Weight: ' + pkgData.weight + ', Qty: ' + pkgData.qty + ', LevelType: ' + pkgData.levelType + ', Location: ' + pkgData.location);
        
        spsPackages.push(pkgData);
        return true;
      });
      
      log.debug('createIntegratedShippingLabels', 'Package search complete. Found ' + spsPackages.length + ' SPS package(s) for IF ' + tranId);
      
      if (spsPackages.length === 0) {
        log.error('createIntegratedShippingLabels', 'No SPS packages found for IF ' + tranId + ' - cannot proceed');
        return {
          success: false,
          error: 'No SPS packages found for IF ' + tranId
        };
      }
      
      // 6. Get Amazon ARN from IF
      log.debug('createIntegratedShippingLabels', '=== STEP 6: Getting Amazon ARN ===');
      var amazonArn = ifRecord.getValue('custbody_amazon_arn') || '';
      log.debug('createIntegratedShippingLabels', 'Amazon ARN value: "' + amazonArn + '" (length: ' + amazonArn.length + ')');
      
      // 7. Save the record with header fields set (status, shipstatus, carrier, thirdpartytypeups, shipmethod)
      log.debug('createIntegratedShippingLabels', '=== STEP 7: Saving IF record with header fields ===');
      log.debug('createIntegratedShippingLabels', 'Saving IF record with status, shipstatus, carrier, thirdpartytypeups, and shipmethod set');
      try {
        ifRecord.save({
          enableSourcing: false,
          ignoreMandatoryFields: true
        });
        log.debug('createIntegratedShippingLabels', 'IF record saved successfully with header fields');
      } catch (saveError) {
        log.error('createIntegratedShippingLabels', 'Error saving IF record with header fields: ' + saveError.toString());
        log.error('createIntegratedShippingLabels', 'Save error stack: ' + (saveError.stack || 'N/A'));
        // Continue - we'll try to add packages anyway
      }
      
      // 8. Reload the record to add package lines (use isDynamic: false like reconcile script)
      log.debug('createIntegratedShippingLabels', '=== STEP 8: Reloading IF record for package lines ===');
      ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      log.debug('createIntegratedShippingLabels', 'IF record reloaded successfully with isDynamic: false');
      log.debug('createIntegratedShippingLabels', 'Record type: ' + typeof ifRecord);
      log.debug('createIntegratedShippingLabels', 'Has setSublistValue method: ' + (typeof ifRecord.setSublistValue === 'function'));
      log.debug('createIntegratedShippingLabels', 'Has insertLine method: ' + (typeof ifRecord.insertLine === 'function'));
      log.debug('createIntegratedShippingLabels', 'Record status: ' + ifRecord.getValue('status'));
      log.debug('createIntegratedShippingLabels', 'Record shipcarrier: ' + ifRecord.getValue('shipcarrier'));
      
      // 9. Remove ALL existing package lines (after status is Packed, we can now modify packages)
      log.debug('createIntegratedShippingLabels', '=== STEP 9: Removing all existing package lines ===');
      log.debug('createIntegratedShippingLabels', 'Using package sublist: "' + packageSublistId + '"');
      var currentPackageCount = ifRecord.getLineCount({
        sublistId: packageSublistId
      });
      log.debug('createIntegratedShippingLabels', 'Current package line count: ' + currentPackageCount);
      
      if (currentPackageCount > 0) {
        log.debug('createIntegratedShippingLabels', 'Removing ' + currentPackageCount + ' existing package line(s)');
        for (var i = currentPackageCount - 1; i >= 0; i--) {
          try {
            ifRecord.removeLine({
              sublistId: packageSublistId,
              line: i,
              ignoreRecalc: true
            });
            log.debug('createIntegratedShippingLabels', 'Removed package line at index: ' + i);
          } catch (removeError) {
            log.error('createIntegratedShippingLabels', 'Error removing package line ' + i + ': ' + removeError.toString());
          }
        }
        log.debug('createIntegratedShippingLabels', 'All existing package lines removed');
      } else {
        log.debug('createIntegratedShippingLabels', 'No existing package lines to remove');
      }
      
      // 10. Create package lines from SPS packages
      log.debug('createIntegratedShippingLabels', '=== STEP 10: Creating package lines from SPS packages ===');
      log.debug('createIntegratedShippingLabels', 'Will create ' + spsPackages.length + ' package line(s)');
      var cartonNumber = 0; // Start carton number from 1 (will increment before setting)
      log.debug('createIntegratedShippingLabels', 'Starting carton number: ' + cartonNumber + ' (will increment to 1 for first package)');
      
      // Insert package lines using index 0, 1, 2... (like reconcile script)
      for (var index = 0; index < spsPackages.length; index++) {
        var spsPkg = spsPackages[index];
        log.debug('createIntegratedShippingLabels', '--- Processing SPS package ' + (index + 1) + ' of ' + spsPackages.length + ' ---');
        log.debug('createIntegratedShippingLabels', 'SPS Package ID: ' + spsPkg.id);
        
        // Insert new package line at index (0, 1, 2, ...)
        log.debug('createIntegratedShippingLabels', 'Inserting package line at index: ' + index + ' in sublist: "' + packageSublistId + '"');
        try {
          ifRecord.insertLine({
            sublistId: packageSublistId,
            line: index
          });
          log.debug('createIntegratedShippingLabels', 'Package line inserted successfully at index: ' + index);
        } catch (insertError) {
          log.error('createIntegratedShippingLabels', 'Error inserting package line: ' + insertError.toString());
          log.error('createIntegratedShippingLabels', 'Insert error stack: ' + (insertError.stack || 'N/A'));
          throw insertError; // Re-throw to stop processing
        }
        
        var lineIndex = index; // Use index for setting values
        
        // Set package dimensions and weight
        log.debug('createIntegratedShippingLabels', 'Setting package weight: ' + spsPkg.weight);
        ifRecord.setSublistValue({
          sublistId: packageSublistId,
          fieldId: 'packageweight',
          line: lineIndex,
          value: spsPkg.weight
        });
        log.debug('createIntegratedShippingLabels', 'Package weight set successfully');
        
        log.debug('createIntegratedShippingLabels', 'Setting package length: ' + spsPkg.length);
        ifRecord.setSublistValue({
          sublistId: packageSublistId,
          fieldId: 'packagelength',
          line: lineIndex,
          value: spsPkg.length
        });
        log.debug('createIntegratedShippingLabels', 'Package length set successfully');
        
        log.debug('createIntegratedShippingLabels', 'Setting package width: ' + spsPkg.width);
        ifRecord.setSublistValue({
          sublistId: packageSublistId,
          fieldId: 'packagewidth',
          line: lineIndex,
          value: spsPkg.width
        });
        log.debug('createIntegratedShippingLabels', 'Package width set successfully');
        
        log.debug('createIntegratedShippingLabels', 'Setting package height: ' + spsPkg.height);
        ifRecord.setSublistValue({
          sublistId: packageSublistId,
          fieldId: 'packageheight',
          line: lineIndex,
          value: spsPkg.height
        });
        log.debug('createIntegratedShippingLabels', 'Package height set successfully');
        
        // Set carton number (incrementing)
        // Note: Carton number field may vary - common field IDs: 'cartonnumber', 'packagecartonnumber', 'packagecarton'
        cartonNumber++;
        log.debug('createIntegratedShippingLabels', 'Setting carton number: ' + cartonNumber);
        try {
          ifRecord.setSublistValue({
            sublistId: packageSublistId,
            fieldId: 'packagecartonnumber',  // Try this field ID first
            line: lineIndex,
            value: cartonNumber
          });
          log.debug('createIntegratedShippingLabels', 'Carton number set successfully using field: packagecartonnumber');
        } catch (cartonError) {
          log.debug('createIntegratedShippingLabels', 'Failed to set carton number with packagecartonnumber field - error: ' + cartonError.toString());
          // Try alternative field ID
          try {
            log.debug('createIntegratedShippingLabels', 'Trying alternative field: cartonnumber');
            ifRecord.setSublistValue({
              sublistId: packageSublistId,
              fieldId: 'cartonnumber',
              line: lineIndex,
              value: cartonNumber
            });
            log.debug('createIntegratedShippingLabels', 'Carton number set successfully using field: cartonnumber');
          } catch (e) {
            log.debug('createIntegratedShippingLabels', 'Could not set carton number with either field - error: ' + e.toString());
            log.debug('createIntegratedShippingLabels', 'Field may not exist or have different ID');
          }
        }
        
        // Set reference2 to Amazon ARN (only for UPS)
        if (amazonArn && carrierValue === 'ups') {
          log.debug('createIntegratedShippingLabels', 'Setting reference2ups to Amazon ARN: "' + amazonArn + '"');
          ifRecord.setSublistValue({
            sublistId: packageSublistId,
            fieldId: 'reference2ups',
            line: lineIndex,
            value: amazonArn
          });
          log.debug('createIntegratedShippingLabels', 'Reference2ups set successfully');
        } else {
          if (!amazonArn) {
            log.debug('createIntegratedShippingLabels', 'No Amazon ARN to set on reference2ups field');
          } else {
            log.debug('createIntegratedShippingLabels', 'Skipping reference2ups (not UPS carrier)');
          }
        }
        
        // 11. Get package content where include_in_package = True
        // Note: include_in_package is a field on the custpage_package_content sublist of the SPS package record,
        // not on the customrecord_sps_content record itself. We'll get all content records for this package.
        // If filtering by include_in_package is needed, you would need to load the SPS package record
        // and check the sublist field.
        log.debug('createIntegratedShippingLabels', '=== STEP 11: Searching for package content ===');
        log.debug('createIntegratedShippingLabels', 'Searching for content records for package ID: ' + spsPkg.id);
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
        log.debug('createIntegratedShippingLabels', 'Package content search created, running search...');
        
        var packageContents = [];
        var contentCount = 0;
        packageContentSearch.run().each(function(contentResult) {
          contentCount++;
          var contentId = contentResult.id;
          log.debug('createIntegratedShippingLabels', 'Found content record #' + contentCount + ' - ID: ' + contentId);
          
          var contentItem = contentResult.getValue('custrecord_sps_content_item');
          var contentQty = contentResult.getValue('custrecord_sps_content_qty');
          var contentLineNum = contentResult.getValue('custrecord_sps_content_item_line_num');
          
          log.debug('createIntegratedShippingLabels', 'Content ' + contentId + ' - Item: ' + contentItem + ', Qty: ' + contentQty + ', LineNum: ' + contentLineNum);
          
          packageContents.push({
            id: contentId,
            item: contentItem,
            qty: parseFloat(contentQty) || 0,
            lineNum: contentLineNum
          });
          return true;
        });
        
        log.debug('createIntegratedShippingLabels', 'Package ' + spsPkg.id + ' has ' + packageContents.length + ' content record(s)');
        
        // TODO: If you need to filter by include_in_package = True, you would need to:
        // 1. Load the SPS package record: record.load({ type: 'customrecord_sps_package', id: spsPkg.id })
        // 2. Loop through custpage_package_content sublist
        // 3. Check include_in_package field value
        // 4. Get the corresponding content record IDs
        
        log.debug('createIntegratedShippingLabels', 'Completed package line ' + (index + 1) + ' for SPS package ' + spsPkg.id + 
                  ' - Weight: ' + spsPkg.weight + ', Dimensions: ' + spsPkg.length + 'x' + spsPkg.width + 'x' + spsPkg.height);
        log.debug('createIntegratedShippingLabels', '--- Finished processing SPS package ' + (index + 1) + ' of ' + spsPackages.length + ' ---');
      }
      
      log.debug('createIntegratedShippingLabels', 'All package lines created. Total: ' + spsPackages.length);
      
      // 12. Save the record with package lines
      log.debug('createIntegratedShippingLabels', '=== STEP 12: Saving IF record with package lines ===');
      log.debug('createIntegratedShippingLabels', 'Saving IF record with ' + spsPackages.length + ' package line(s)');
      ifRecord.save({
        enableSourcing: false,
        ignoreMandatoryFields: true
      });
      log.debug('createIntegratedShippingLabels', 'IF record saved successfully');
      
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

