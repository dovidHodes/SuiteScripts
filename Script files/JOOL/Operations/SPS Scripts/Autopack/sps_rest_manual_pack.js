/**
 *@NApiVersion 2.1
 *@NModuleScope SameAccount
 *@NScriptType restlet
 */
define(["require", "exports", "./lib/sps_lib_packdata_interfaces", "N/log", "N/error", "N/record", "./lib/sps_lib_restlet_interfaces", "./lib/sps_lib_rest_package_endpoints", "./lib/sps_lib_packdata_sps", "N/task"], function (require, exports, sps_lib_packdata_interfaces_1, log, error, record, sps_lib_restlet_interfaces_1, sps_lib_rest_package_endpoints_1, sps_lib_packdata_sps_1, task) {
    var MAX_ITEMS_FOR_MAP_REDUCE = 150;
    function postPackages(paramObj) {
        log.debug('Beginning SPS Manual Pack Restlet POST', JSON.stringify(paramObj));
        // Validate Package JSON data
        var returnObj;
        sps_lib_rest_package_endpoints_1.validatePackagesWithError(paramObj.packageJSON);
        if (paramObj.packageJSON.reduce(function (acc, cur) { return acc + cur.items.length; }, 0) > MAX_ITEMS_FOR_MAP_REDUCE) {
            return schedulePackageMapReduce(sps_lib_packdata_interfaces_1.packageContentContext.CREATE, paramObj.packageJSON);
        }
        var packageJSON = paramObj.packageJSON[0];
        sps_lib_rest_package_endpoints_1.creatingSpsPackageRequest(packageJSON);
        // Create Package Content records
        for (var i = 0; i < packageJSON.items.length; i++) {
            sps_lib_rest_package_endpoints_1.createNewPackContentRec(packageJSON, packageJSON.items[i]);
        }
        sps_lib_rest_package_endpoints_1.updateItemFulfillmentPackedQty(packageJSON.itemFulfillmentId);
        // Alert user of successful package creation
        returnObj = {
            message: "Package and Package Content records have been generated. Refer to the SPS_EDI Packages tab on Item Fulfillment " + packageJSON.itemFulfillmentId + " to view all packages",
            mapReduceTaskId: '',
            status: sps_lib_restlet_interfaces_1.Status.SUCCESS,
        };
        return JSON.stringify(returnObj);
    }
    function putPackages(paramObj) {
        log.debug('Beginning SPS Manual Pack Restlet PUT', JSON.stringify(paramObj));
        // Validate Package JSON data
        sps_lib_rest_package_endpoints_1.validatePackagesWithError(paramObj.packageJSON);
        if (paramObj.packageJSON.reduce(function (acc, cur) { return acc + cur.items.length; }, 0) > MAX_ITEMS_FOR_MAP_REDUCE) {
            return schedulePackageMapReduce(sps_lib_packdata_interfaces_1.packageContentContext.UPDATE, paramObj.packageJSON);
        }
        var packageJSON = paramObj.packageJSON[0];
        var returnObj;
        // Update Package record
        sps_lib_rest_package_endpoints_1.updateSpsPackageRequest(packageJSON);
        // Update Package Content records
        var itemCount = packageJSON.items.length;
        for (var i = 0; i < itemCount; i++) {
            switch (packageJSON.items[i].context) {
                case sps_lib_packdata_interfaces_1.packageContentContext.CREATE:
                    // New item is added to package. Create new Package Content record
                    log.debug('New Package Content', "Creating new package content record for Package rec " + packageJSON.spsPackageId + " and Item " + packageJSON.items[i].itemId);
                    sps_lib_rest_package_endpoints_1.createNewPackContentRec(packageJSON, packageJSON.items[i]);
                    break;
                case sps_lib_packdata_interfaces_1.packageContentContext.UPDATE:
                    // Item in package is updated. Update Package Content record
                    log.debug('Update Pack Content', 'Updating existing package content record');
                    sps_lib_rest_package_endpoints_1.updatePackContentRec(packageJSON, packageJSON.items[i]);
                    break;
                case sps_lib_packdata_interfaces_1.packageContentContext.DELETE:
                    // Item is removed from package. Delete Package Content record
                    log.debug('Delete Pack Content', 'Deleting package content record');
                    sps_lib_rest_package_endpoints_1.deletePackageContentRecs(packageJSON.items[i].spsPackageContentId);
                    break;
                default:
                    // Nothing is happening to item, we can ignore it
                    log.debug('No Action', 'No action is being taken on this item');
                    break;
            }
        }
        sps_lib_rest_package_endpoints_1.updateItemFulfillmentPackedQty(packageJSON.itemFulfillmentId);
        // Alert user of successful package and package content update
        returnObj = {
            message: "Package and Package Content records have been updated. Refer to the SPS_EDI Packages tab on Item Fulfillment " + packageJSON.itemFulfillmentId + " to view all packages",
            mapReduceTaskId: '',
            status: sps_lib_restlet_interfaces_1.Status.SUCCESS,
        };
        return JSON.stringify(returnObj);
    }
    function deletePackages(paramObj) {
        log.debug('Beginning SPS Manual Pack Restlet DELETE', JSON.stringify(paramObj));
        var returnObj;
        if (!paramObj.packageId || !paramObj.itemFulfillmentId) {
            throw error.create({
                name: 'MISSING_PACKAGE_ID_OR_ITEM_FULFILLMENT_ID',
                message: 'Package Id and Item Fulfillment Id must be provided to delete a package. See SPS Restlet API documentation for more information.',
                notifyOff: true,
            });
        }
        var packageId = paramObj.packageId;
        var itemFulfillmentId = paramObj.itemFulfillmentId;
        var spsPackageArr = sps_lib_packdata_sps_1.getArray([itemFulfillmentId], packageId);
        if (spsPackageArr.reduce(function (acc, cur) { return acc + cur.items.length; }, 0) > MAX_ITEMS_FOR_MAP_REDUCE) {
            return schedulePackageMapReduce(sps_lib_packdata_interfaces_1.packageContentContext.DELETE, spsPackageArr);
        }
        var spsPackageObj = spsPackageArr[0];
        // Loop through Package Content ID array and delete Package Content records
        for (var i = 0; i < spsPackageObj.items.length; i++) {
            var packageContentId = spsPackageObj.items[i].spsPackageContentId;
            try {
                sps_lib_rest_package_endpoints_1.deletePackageContentRecs(packageContentId);
            }
            catch (e) {
                log.error('Error Deleting Package Content', "Error deleting package content record " + packageContentId + ": " + e.message);
                throw error.create({
                    name: 'PACKAGE CONTENT DELETE ERROR',
                    message: "Error deleting package content record " + packageContentId + ". Please contact SPS Support for assistance",
                    notifyOff: true,
                });
            }
        }
        sps_lib_rest_package_endpoints_1.resetPackageRecCartonIndexIfNecessary(itemFulfillmentId, packageId);
        try {
            record.delete({ type: 'customrecord_sps_package', id: packageId });
        }
        catch (e) {
            log.error('Error Deleting Package', "Error deleting package record " + packageId + ": " + e.message);
            throw error.create({
                name: 'PACKAGE DELETE ERROR',
                message: "Error deleting package record " + packageId + ". Please contact SPS Support for assistance",
                notifyOff: true,
            });
        }
        sps_lib_rest_package_endpoints_1.updateItemFulfillmentPackedQty(itemFulfillmentId);
        returnObj = {
            message: 'Package and/or Package Content records have been successfully deleted',
            mapReduceTaskId: '',
            status: sps_lib_restlet_interfaces_1.Status.SUCCESS,
        };
        return JSON.stringify(returnObj);
    }
    function schedulePackageMapReduce(context, packageArray) {
        log.debug("Scheduling Map Reduce for " + context + " call", "Request to " + context + " " + packageArray.length + " packages with total of " + packageArray.reduce(function (acc, cur) { return acc + cur.items.length; }, 0) + " items requires Map Reduce processing");
        var taskId = '';
        try {
            var mapReduceTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_sps_mr_sps_pack_rec',
                params: {
                    custscript_sps_mr_package_json: {
                        restletContext: context,
                        package: packageArray,
                    },
                },
            });
            taskId = mapReduceTask.submit();
            log.debug('Map Reduce Update', "This is the Map Reduce Task ID: " + taskId);
        }
        catch (taskScheduleError) {
            if (taskScheduleError.name !== 'MAP_REDUCE_ALREADY_RUNNING') {
                throw taskScheduleError;
            }
        }
        var message = taskId
            ? context + " Packages has been scheduled with the SPS Package Records Bulk Processing Map Reduce Script. See mapReduceTaskId for task Id of map reduce."
            : 'SPS tried to schedule SPS Package Records Bulk Processing Map Reduce script with one of 5 Map Reduce deployments but none were available. Please wait a few minutes to retry or manually deploy more Map Reduces';
        var returnObj = {
            message: message,
            mapReduceTaskId: taskId,
            status: taskId ? sps_lib_restlet_interfaces_1.Status.Scheduled : sps_lib_restlet_interfaces_1.Status.Error,
        };
        return JSON.stringify(returnObj);
    }
    return { post: postPackages, put: putPackages, delete: deletePackages };
});
