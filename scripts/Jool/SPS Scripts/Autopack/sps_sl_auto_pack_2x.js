/**
 *@NApiVersion 2.1
 *@NModuleScope SameAccount
 *@NScriptType Suitelet
 */
define(["require", "exports", "N/error", "N/log", "N/runtime", "./lib/sps_lib_auto_pack", "./lib/sps_lib_script_status_rec", "./lib/sps_lib_auto_pack_v2"], function (require, exports, error, log, runtime, sps_lib_auto_pack_1, sps_lib_script_status_rec_1, sps_lib_auto_pack_v2_1) {
    var maxPackageCreatedinSuiteLet = 64;
    function onRequest(ctx) {
        var paramObj = ctx.request.parameters;
        var itemFulfillmentStr = paramObj.id || paramObj.param1;
        var slScript = runtime.getCurrentScript();
        if (typeof itemFulfillmentStr === 'string') {
            var itemFulfillmentArr = itemFulfillmentStr.split(',');
            if (itemFulfillmentArr.length === 1) {
                // We only auto pack today from the Item Fulfillment record, so shouldn't care about any additional IF Ids passed beyond the first
                var ifId = itemFulfillmentArr[0];
                var statusRecObj = sps_lib_auto_pack_v2_1.autoPackInitializeScriptStatusRec(ifId, sps_lib_script_status_rec_1.scriptExecutionType.Suitelet);
                var itemFulfillmentLineItemObj_1 = sps_lib_auto_pack_v2_1.getItemFulfillmentLineItemObj(ifId);
                if (Object.keys(itemFulfillmentLineItemObj_1.lineItems).length > 0) {
                    var arrOfItemIds = Object.values(itemFulfillmentLineItemObj_1.lineItems).map(function (lineItem) {
                        return lineItem.itemId;
                    });
                    var ifPackedRules = sps_lib_auto_pack_1.getRulePackMappedObj(arrOfItemIds);
                    var _loop_1 = function (lineItem) {
                        sps_lib_auto_pack_v2_1.getItemRulesObjThatBestFitsItemForPacking(itemFulfillmentLineItemObj_1, ifPackedRules, lineItem);
                        var lotNumberKeysToPackBy = Object.keys(itemFulfillmentLineItemObj_1.lineItems[lineItem].itemLotObj).length > 0
                            ? Object.keys(itemFulfillmentLineItemObj_1.lineItems[lineItem].itemLotObj)
                            : ['']; //an empty string is required as we need the lotNumberKeysToPackBy to run at the next stage, whether lots exist or not
                        lotNumberKeysToPackBy.forEach(function (lotNumber) {
                            sps_lib_auto_pack_v2_1.packLineItemUsingItemRuleArrProperty(itemFulfillmentLineItemObj_1, lineItem, lotNumber, itemFulfillmentLineItemObj_1.customer.manuallyPackRemainingQtyFlag);
                        });
                    };
                    for (var lineItem in itemFulfillmentLineItemObj_1.lineItems) {
                        _loop_1(lineItem);
                    }
                }
                if (sps_lib_auto_pack_v2_1.getCountOfPackagesToBeCreatedForPrePackedIfObject(itemFulfillmentLineItemObj_1) > maxPackageCreatedinSuiteLet) {
                    //hand off to map reduce
                    sps_lib_auto_pack_v2_1.scheduleMapReduceAndUpdateScriptStatusRecord(itemFulfillmentLineItemObj_1, statusRecObj);
                }
                else {
                    // pack all item fulfillment lines
                    for (var lineItem in itemFulfillmentLineItemObj_1.lineItems) {
                        sps_lib_auto_pack_v2_1.logPackedLine(statusRecObj, itemFulfillmentLineItemObj_1.lineItems[lineItem]);
                        var newPackageIdsArr = itemFulfillmentLineItemObj_1.lineItems[lineItem].packageObjArr.map(function (packageObj) {
                            return sps_lib_auto_pack_v2_1.createOneSpsPackageAndPackageContentRecsUsingSpsPackObj(packageObj);
                        });
                        if (newPackageIdsArr.length !== itemFulfillmentLineItemObj_1.lineItems[lineItem].packageObjArr.length) {
                            // if result of packages packed doesn't match expected, updated packageObjArr to remove packages without an id
                            itemFulfillmentLineItemObj_1.lineItems[lineItem].packageObjArr = sps_lib_auto_pack_v2_1.removeErroredPackagesFromPrePackArr(itemFulfillmentLineItemObj_1.lineItems[lineItem].packageObjArr);
                            log.debug('Error SPS New Package', "There was an Error while packing  " + itemFulfillmentLineItemObj_1.lineItems[lineItem].itemName);
                        }
                        if (itemFulfillmentLineItemObj_1.lineItems[lineItem].remainingQuantityToPack() > 0) {
                            sps_lib_auto_pack_v2_1.finalizeItemStatusJsonForPackedLineItem(itemFulfillmentLineItemObj_1, lineItem, statusRecObj);
                        }
                    }
                    //Update the status record
                    sps_lib_auto_pack_v2_1.autoPackScriptRecPackingCompleteUpdate(statusRecObj, itemFulfillmentLineItemObj_1);
                    // once packing has been completed, we need to update Item Fulfillment record custcol packed qty field and the carton count field and package notes field
                    sps_lib_auto_pack_v2_1.updateItemFulfillmentRecSpsPackedQtyAndCartonCountFields(itemFulfillmentLineItemObj_1);
                    var createDebugFileCheck = runtime.getCurrentScript().getParameter({ name: 'custscript_sps_debug_confirmation_check' });
                }
                // Update the If Record Body Fields:
                ctx.response.write(statusRecObj.statusMessage);
            }
            else {
                var myError = error.create({ name: 'MISSING_REQUIRED_QUERY_PARAM', message: 'Query parameter itemFulfillmentIds not specified.' });
                throw myError;
            }
        }
        else {
            var myError = error.create({ name: 'MISSING_REQUIRED_QUERY_PARAM', message: 'Query parameter itemFulfillmentIds not specified.' });
            throw myError;
        }
    }
    return { onRequest: onRequest };
});
