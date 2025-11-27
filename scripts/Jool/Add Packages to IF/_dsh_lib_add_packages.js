/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * 
 * Library module for adding packages to Item Fulfillment records.
 * 
 * Provides reusable functions for:
 * - Adding packages with weight and dimensions
 * - Bulk adding multiple packages
 * - Copying packages from custom records
 */

define([
  'N/record',
  'N/search',
  'N/log'
], function (record, search, log) {
  
  /**
   * Package data structure
   * @typedef {Object} PackageData
   * @property {number} weight - Package weight
   * @property {number} [length] - Package length (optional)
   * @property {number} [width] - Package width (optional)
   * @property {number} [height] - Package height (optional)
   * @property {string|number} [packageType] - Package type internal ID (optional)
   * @property {string} [trackingNumber] - Tracking number (optional)
   */
  
  /**
   * Adds a single package to an Item Fulfillment record
   * 
   * @param {string|number} ifId - Item Fulfillment internal ID
   * @param {PackageData} packageData - Package data object
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.save=true] - Whether to save the record after adding package
   * @param {boolean} [options.isDynamic=true] - Whether to load record in dynamic mode
   * @returns {Object} Result object with success status and line index
   */
  function addPackage(ifId, packageData, options) {
    options = options || {};
    var saveRecord = options.save !== false;
    var isDynamic = options.isDynamic !== false;
    
    try {
      // Load the Item Fulfillment record
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: isDynamic
      });
      
      // Get current package count
      var lineIndex = ifRecord.getLineCount({
        sublistId: 'package'
      });
      
      // Insert a new line in the package sublist
      ifRecord.insertLine({
        sublistId: 'package',
        line: lineIndex
      });
      
      // Set package weight (required)
      if (packageData.weight !== undefined && packageData.weight !== null) {
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packageweight',
          line: lineIndex,
          value: packageData.weight
        });
      }
      
      // Set package dimensions (optional)
      if (packageData.length !== undefined && packageData.length !== null) {
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packagelength',
          line: lineIndex,
          value: packageData.length
        });
      }
      
      if (packageData.width !== undefined && packageData.width !== null) {
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packagewidth',
          line: lineIndex,
          value: packageData.width
        });
      }
      
      if (packageData.height !== undefined && packageData.height !== null) {
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packageheight',
          line: lineIndex,
          value: packageData.height
        });
      }
      
      // Set package type if provided
      if (packageData.packageType) {
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packagetype',
          line: lineIndex,
          value: packageData.packageType
        });
      }
      
      // Set tracking number if provided
      if (packageData.trackingNumber) {
        ifRecord.setSublistValue({
          sublistId: 'package',
          fieldId: 'packagetrackingnumber',
          line: lineIndex,
          value: packageData.trackingNumber
        });
      }
      
      // Save the record if requested
      if (saveRecord) {
        ifRecord.save({
          enableSourcing: false,
          ignoreMandatoryFields: false
        });
      }
      
      return {
        success: true,
        lineIndex: lineIndex,
        record: ifRecord
      };
      
    } catch (e) {
      log.error('addPackage', 'Error adding package to IF ' + ifId + ': ' + e.toString());
      return {
        success: false,
        error: e.toString()
      };
    }
  }
  
  /**
   * Adds multiple packages to an Item Fulfillment record
   * 
   * @param {string|number} ifId - Item Fulfillment internal ID
   * @param {PackageData[]} packagesArray - Array of package data objects
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.save=true] - Whether to save the record after adding packages
   * @param {boolean} [options.isDynamic=true] - Whether to load record in dynamic mode
   * @returns {Object} Result object with success status and count
   */
  function addPackages(ifId, packagesArray, options) {
    options = options || {};
    var saveRecord = options.save !== false;
    var isDynamic = options.isDynamic !== false;
    
    try {
      // Load the Item Fulfillment record once
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: isDynamic
      });
      
      var addedCount = 0;
      var errors = [];
      
      // Add each package
      packagesArray.forEach(function(packageData, index) {
        try {
          var lineIndex = ifRecord.getLineCount({
            sublistId: 'package'
          });
          
          ifRecord.insertLine({
            sublistId: 'package',
            line: lineIndex
          });
          
          // Set all package fields
          if (packageData.weight !== undefined && packageData.weight !== null) {
            ifRecord.setSublistValue({
              sublistId: 'package',
              fieldId: 'packageweight',
              line: lineIndex,
              value: packageData.weight
            });
          }
          
          if (packageData.length !== undefined && packageData.length !== null) {
            ifRecord.setSublistValue({
              sublistId: 'package',
              fieldId: 'packagelength',
              line: lineIndex,
              value: packageData.length
            });
          }
          
          if (packageData.width !== undefined && packageData.width !== null) {
            ifRecord.setSublistValue({
              sublistId: 'package',
              fieldId: 'packagewidth',
              line: lineIndex,
              value: packageData.width
            });
          }
          
          if (packageData.height !== undefined && packageData.height !== null) {
            ifRecord.setSublistValue({
              sublistId: 'package',
              fieldId: 'packageheight',
              line: lineIndex,
              value: packageData.height
            });
          }
          
          if (packageData.packageType) {
            ifRecord.setSublistValue({
              sublistId: 'package',
              fieldId: 'packagetype',
              line: lineIndex,
              value: packageData.packageType
            });
          }
          
          if (packageData.trackingNumber) {
            ifRecord.setSublistValue({
              sublistId: 'package',
              fieldId: 'packagetrackingnumber',
              line: lineIndex,
              value: packageData.trackingNumber
            });
          }
          
          addedCount++;
          
        } catch (e) {
          var errorMsg = 'Error adding package ' + (index + 1) + ': ' + e.toString();
          log.error('addPackages', errorMsg);
          errors.push(errorMsg);
        }
      });
      
      // Save the record if requested
      if (saveRecord && addedCount > 0) {
        try {
          ifRecord.save({
            enableSourcing: false,
            ignoreMandatoryFields: false
          });
        } catch (saveError) {
          log.error('addPackages', 'Error saving IF ' + ifId + ': ' + saveError.toString());
          errors.push('Save error: ' + saveError.toString());
        }
      }
      
      return {
        success: errors.length === 0,
        addedCount: addedCount,
        totalCount: packagesArray.length,
        errors: errors,
        record: ifRecord
      };
      
    } catch (e) {
      log.error('addPackages', 'Error loading IF ' + ifId + ': ' + e.toString());
      return {
        success: false,
        addedCount: 0,
        totalCount: packagesArray.length,
        errors: [e.toString()]
      };
    }
  }
  
  /**
   * Copies packages from custom SPS package records to Item Fulfillment package sublist
   * 
   * @param {string|number} ifId - Item Fulfillment internal ID
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.save=true] - Whether to save the record after adding packages
   * @param {string} [options.packageRecordType='customrecord_sps_package'] - Custom package record type
   * @param {string} [options.packageAsnField='custrecord_sps_pack_asn'] - Field linking package to IF
   * @param {string} [options.weightField='custrecord_sps_pk_weight'] - Weight field on custom record
   * @returns {Object} Result object with success status and count
   */
  function copyPackagesFromCustomRecords(ifId, options) {
    options = options || {};
    var saveRecord = options.save !== false;
    var packageRecordType = options.packageRecordType || 'customrecord_sps_package';
    var packageAsnField = options.packageAsnField || 'custrecord_sps_pack_asn';
    var weightField = options.weightField || 'custrecord_sps_pk_weight';
    
    try {
      // Search for custom package records related to this IF
      var packageSearch = search.create({
        type: packageRecordType,
        filters: [
          [packageAsnField, 'anyof', ifId]
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: weightField })
        ]
      });
      
      var packages = [];
      packageSearch.run().each(function(result) {
        var weight = parseFloat(result.getValue(weightField)) || 0;
        packages.push({
          weight: weight
          // Add other fields if they exist on your custom record
        });
        return true;
      });
      
      if (packages.length === 0) {
        log.debug('copyPackagesFromCustomRecords', 'No custom packages found for IF ' + ifId);
        return {
          success: true,
          addedCount: 0,
          totalCount: 0,
          errors: []
        };
      }
      
      // Add packages to IF
      return addPackages(ifId, packages, {
        save: saveRecord,
        isDynamic: true
      });
      
    } catch (e) {
      log.error('copyPackagesFromCustomRecords', 'Error copying packages for IF ' + ifId + ': ' + e.toString());
      return {
        success: false,
        addedCount: 0,
        totalCount: 0,
        errors: [e.toString()]
      };
    }
  }
  
  /**
   * Gets package data from an Item Fulfillment record
   * 
   * @param {string|number} ifId - Item Fulfillment internal ID
   * @returns {PackageData[]} Array of package data objects
   */
  function getPackages(ifId) {
    try {
      var ifRecord = record.load({
        type: 'itemfulfillment',
        id: ifId,
        isDynamic: false
      });
      
      var packageCount = ifRecord.getLineCount({
        sublistId: 'package'
      });
      
      var packages = [];
      
      for (var i = 0; i < packageCount; i++) {
        var packageData = {
          weight: ifRecord.getSublistValue({
            sublistId: 'package',
            fieldId: 'packageweight',
            line: i
          }),
          length: ifRecord.getSublistValue({
            sublistId: 'package',
            fieldId: 'packagelength',
            line: i
          }),
          width: ifRecord.getSublistValue({
            sublistId: 'package',
            fieldId: 'packagewidth',
            line: i
          }),
          height: ifRecord.getSublistValue({
            sublistId: 'package',
            fieldId: 'packageheight',
            line: i
          })
        };
        
        packages.push(packageData);
      }
      
      return packages;
      
    } catch (e) {
      log.error('getPackages', 'Error getting packages from IF ' + ifId + ': ' + e.toString());
      return [];
    }
  }
  
  return {
    addPackage: addPackage,
    addPackages: addPackages,
    copyPackagesFromCustomRecords: copyPackagesFromCustomRecords,
    getPackages: getPackages
  };
  
});

