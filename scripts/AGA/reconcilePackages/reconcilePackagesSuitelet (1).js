/**
 *@NApiVersion 2.1
 *@NScriptType Suitelet
 */
define(['N/ui/serverWidget', 'N/record', 'N/search', 'N/log', 'N/runtime', 'N/url', 'N/redirect'],
  function(ui, record, search, log, runtime, url, redirect) {

    function onRequest(context) {
      var request = context.request;
      var response = context.response;

      var doRedirect = request.parameters.redirect === 'T';
      if (!doRedirect) {
        try { response.setHeader({ name: 'Content-Type', value: 'text/plain' }); } catch (e) {}
      }

      if (request.method !== 'GET') {
        if (!doRedirect) response.write('Method Not Allowed');
        return;
      }

      var recordId = request.parameters.recordId;
      var recordType = request.parameters.recordType;
      if (!recordId || !recordType) {
        if (!doRedirect) response.write('Missing recordId or recordType');
        return;
      }

      try {
        // Validate that this is an Item Fulfillment
        if (recordType !== 'itemfulfillment') {
          if (!doRedirect) response.write('Error: This script only works with Item Fulfillment records.');
          return;
        }

        var itemFulfillmentId = recordId;

        var itemFulfillmentRecord = record.load({
            type: record.Type.ITEM_FULFILLMENT,
            id: itemFulfillmentId,
            isDynamic: false
        });

        var tranID = itemFulfillmentRecord.getValue('tranid');
        var entityId = itemFulfillmentRecord.getValue('entity');
        var customerName = itemFulfillmentRecord.getValue('entityname');
        var status = itemFulfillmentRecord.getValue('status');
        var ASNStatus = itemFulfillmentRecord.getValue('custbody_asn_status');

        log.debug("--------------");
        log.debug(tranID + ' - Entity: ' + customerName);

        var packageSearch = search.create({
            type: 'customrecord_sps_package',
            filters: [
                ['custrecord_sps_pack_asn', 'anyof', itemFulfillmentId]
            ],
            columns: ['internalid']
        });

        var packageIds = [];

        packageSearch.run().each(function (result) {
            packageIds.push(result.getValue('internalid'));
            return true;
        });

        log.debug('Found ' + packageIds.length + ' SPS Packages.');

        if (packageIds.length === 0) {
            if (!doRedirect) response.write('No SPS packages found for this Item Fulfillment.');
            return;
        }

        // Remove all existing package lines
        var lineCount = itemFulfillmentRecord.getLineCount({ sublistId: 'package' });
        for (var i = lineCount - 1; i >= 0; i--) {
            itemFulfillmentRecord.removeLine({
                sublistId: 'package',
                line: i,
                ignoreRecalc: true
            });
        }

        // Add new package lines
        var i;
        for (i = 0; i < packageIds.length; i++) {
            itemFulfillmentRecord.insertLine({
                sublistId: 'package',
                line: i
            });

            itemFulfillmentRecord.setSublistValue({
                sublistId: 'package',
                fieldId: 'packageweight',
                line: i,
                value: 1
            });
        }
        log.debug(i + " lines added");

        itemFulfillmentRecord.setValue({ fieldId: 'custbody_asn_status', value: 1 });

        itemFulfillmentRecord.save({
            enableSourcing: false,
            ignoreMandatoryFields: true
        });

        log.debug('Package lines added successfully.');

        if (doRedirect) {
          redirect.toRecord({ type: recordType, id: recordId, isEditMode: false });
        } else {
          response.write('Packages reconciled successfully!');
        }
      } catch (e) {
        log.error('Reconcile Packages failed', e);
        if (!doRedirect) {
          try { response.write('Error: ' + (e.message || 'Internal Server Error')); } catch(_) {}
        }
      }
    }

    return { onRequest: onRequest };
  });

