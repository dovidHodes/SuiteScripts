/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * 
 * Example Suitelet demonstrating how to use the package addition library.
 * 
 * This can be deployed as a Suitelet and called via URL, or used as a reference
 * for implementing package addition in other script types.
 */

define([
  'N/ui/serverWidget',
  'N/record',
  'N/log',
  'N/runtime',
  './_dsh_lib_add_packages'
], function (serverWidget, record, log, runtime, packageLib) {
  
  /**
   * Handles Suitelet requests
   * @param {Object} context
   */
  function onRequest(context) {
    var request = context.request;
    var response = context.response;
    
    try {
      var ifId = request.parameters.ifid;
      
      if (!ifId) {
        response.write('Error: Missing ifid parameter');
        return;
      }
      
      // Example 1: Add a single package
      var packageData = {
        weight: 10.5,
        length: 12,
        width: 8,
        height: 6
      };
      
      var result = packageLib.addPackage(ifId, packageData, {
        save: true
      });
      
      if (result.success) {
        response.write('Successfully added package to IF ' + ifId);
      } else {
        response.write('Error adding package: ' + result.error);
      }
      
      // Example 2: Add multiple packages
      // var packages = [
      //   { weight: 10.5, length: 12, width: 8, height: 6 },
      //   { weight: 5.2, length: 10, width: 6, height: 4 }
      // ];
      // var result = packageLib.addPackages(ifId, packages, { save: true });
      
      // Example 3: Copy from custom records
      // var result = packageLib.copyPackagesFromCustomRecords(ifId, { save: true });
      
    } catch (e) {
      log.error('onRequest', 'Error: ' + e.toString());
      response.write('Error: ' + e.toString());
    }
  }
  
  return {
    onRequest: onRequest
  };
  
});

