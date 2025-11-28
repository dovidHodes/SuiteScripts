/**
 * @NApiVersion 2.x
 * @NScriptType ScheduledScript
 */
define(['N/record', 'N/search', 'N/log'], function (record, search, log) {

    function execute(context) {

        /*var parentIds = []; 

        var mySearch = search.create({
            type: search.Type.ITEM_FULFILLMENT, 
            filters: [
                ['entity', 'anyof', 540], 
                'AND',
                ['custbody_asn_status', 'anyof', 9] 
            ],
            columns: [
                'internalid' 
            ]
        });

        mySearch.run().each(function (result) {
            parentIds.push(result.id); 
            return true; 
        });
        */

        var parentIds = [17535936];
        //var parentIds = [15738326];
        log.debug("LOADED IF count: ", parentIds.length);
        // Loop through each parent record ID (customrecord_sps_package)
        var counter = 1;
        parentIds.forEach(function (parentId) {

            try {
                var itemFulfillmentRecord = record.load({
                    type: 'itemfulfillment',
                    id: parentId
                });
                var asnStatus = itemFulfillmentRecord.getValue({
                    fieldId: 'custbody_asn_status'
                });

                var transactionId = itemFulfillmentRecord.getValue({
                    fieldId: 'tranid'
                });

                log.debug("LOADED IF: ", transactionId);
                log.debug("NUMBER: ", counter++);

                if (asnStatus != 12) {

                    try {
                        var packageLineCount = itemFulfillmentRecord.getLineCount({
                            sublistId: 'package'  // The sublist for the packages
                        });

                        log.debug("Package line count: ", packageLineCount);

                        // Loop through the package sublist and remove the relevant lines
                        for (var i = packageLineCount - 1; i >= 0; i--) {
                            //log.debug("Attempting to remove line: ", i);
                            itemFulfillmentRecord.removeLine({
                                sublistId: 'package',
                                line: i,
                                ignoreRecalc: true
                            });
                            //log.debug("Removed line: ", i);
                            log.debug('Line count after deletion: ', itemFulfillmentRecord.getLineCount({ sublistId: 'package' }));
                        }
                        log.debug("Deleted packages");
                    } catch (p) {
                        log.error('Could not delete packages' + p.message);
                    }


                    itemFulfillmentRecord.save();
                    log.debug('Item Fulfillment updated successfully.');





                    // Step 1: Search for the customrecord_sps_package records where custrecord_sps_pack_asn matches parentId
                    var packageSearch = search.create({
                        type: 'customrecord_sps_package',  // The record type for the package
                        filters: [
                            ['custrecord_sps_pack_asn', 'anyof', parentId]  // Filter by ASN internal ID
                        ],
                        columns: ['internalid']
                    });

                    log.debug("DELETING SPS PACKGES");

                    packageSearch.run().each(function (packageResult) {
                        var packageId = packageResult.getValue('internalid');
                        //log.debug('Found SPS Package with ID: ', packageId);

                        // Step 2: Find and delete all dependent customrecord_sps_content records
                        var contentSearch = search.create({
                            type: 'customrecord_sps_content',  // The record type for content
                            filters: [
                                ['custrecord_sps_content_package', 'anyof', packageId]  // Match the package ID
                            ],
                            columns: ['internalid']
                        });

                        contentSearch.run().each(function (contentResult) {
                            var contentId = contentResult.getValue('internalid');
                            //log.debug('Deleting Dependent Content Record ID: ', contentId);

                            try {
                                record.delete({
                                    type: 'customrecord_sps_content',  // The content record type
                                    id: contentId
                                });
                                //log.debug('Successfully deleted content record with ID: ', contentId);
                            } catch (e) {
                                log.error('Error deleting content record', 'Content Record ID: ' + contentId + ' Error: ' + e.message);
                            }

                            return true;  // Continue to the next content record
                        });

                        // Step 3: Delete the SPS package itself
                        try {
                            record.delete({
                                type: 'customrecord_sps_package',  // The package record type
                                id: packageId
                            });
                            //log.debug('Successfully deleted SPS Package with ID: ', packageId);
                        } catch (e) {
                            log.error('Error deleting SPS Package', 'SPS Package ID: ' + packageId + ' Error: ' + e.message);
                        }

                        return true;  // Continue to the next package record
                    });

                    var itemFulfillmentRecord = record.load({
                        type: 'itemfulfillment',
                        id: parentId
                    });

                    itemFulfillmentRecord.setValue({
                        fieldId: 'custbody_asn_status',  // The internal ID of the field
                        value: 12                // The value to set
                    });
                    itemFulfillmentRecord.save();

                }
                else {
                    log.debug(transactionId, "was already set as 12");
                }

            } catch (e) {
                log.error('Error processing Item Fulfillment', 'Error: ' + e.message);
            }

        });
    }

    return {
        execute: execute
    };

});
