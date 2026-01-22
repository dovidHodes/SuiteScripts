/**
 *@NApiVersion 2.1
 *@NModuleScope SameAccount
 *@NScriptType MapReduceScript
 */
define(["require", "exports", "N/error", "N/log", "N/runtime", "./lib/sps_lib_script_status_rec", "./lib/sps_lib_auto_pack_v2", "./lib/sps_lib_auto_pack", "./lib/sps_lib_script_status_rec_refactor"], function (require, exports, error, log, runtime, sps_lib_script_status_rec_1, sps_lib_auto_pack_v2_1, sps_lib_auto_pack_1, sps_lib_script_status_rec_refactor_1) {
    var alertScriptUsage = function () {
        if (runtime.getCurrentScript().getRemainingUsage() < 100)
            log.debug('SPS Script Usage Issue', "SPS Script running execution below 100 governance. Logging for review, current usage: " + runtime.getCurrentScript().getRemainingUsage());
    };
    function getInputData(inputContext) {
        var parametersString = runtime.getCurrentScript().getParameter({ name: 'custscript_sps_mr_autopack_json' });
        log.debug('Auto Pack Script Starting', "Parameters Passed: " + parametersString);
        var paramJson = JSON.parse(parametersString);
        if (!paramJson.itemFulfillmentArr) {
            // if there is no key value pair for Item Fulfillment Ids, then throw an error
            throw error.create({
                name: 'MISSING_REQUIRED_PARAM',
                message: 'Missing Required Item Fulfillment internal Id(s) to process request. Contact SPS Support',
                notifyOff: true,
            });
        }
        var itemFulfillmentArr = paramJson.itemFulfillmentArr;
        var ifId = itemFulfillmentArr[0];
        var statusRec = sps_lib_auto_pack_v2_1.autoPackInitializeScriptStatusRec(ifId, sps_lib_script_status_rec_1.scriptExecutionType.MapReduce);
        // Step 1 is build out your IF record Object with expected packages for each line
        var itemFulfillmentLineItemObj = sps_lib_auto_pack_v2_1.getItemFulfillmentLineItemObj(ifId);
        log.debug(itemFulfillmentLineItemObj.transactionNumber + " - Starting Auto Pack Carton Count", itemFulfillmentLineItemObj.cartonCount);
        if (Object.keys(itemFulfillmentLineItemObj.lineItems).length > 0) {
            var arrOfItemIds = Object.values(itemFulfillmentLineItemObj.lineItems).map(function (lineItem) {
                return lineItem.itemId;
            });
            var ifPackedRules = sps_lib_auto_pack_1.getRulePackMappedObj(arrOfItemIds);
            var _loop_1 = function (lineItem) {
                sps_lib_auto_pack_v2_1.getItemRulesObjThatBestFitsItemForPacking(itemFulfillmentLineItemObj, ifPackedRules, lineItem);
                var lotNumberKeysToPackBy = Object.keys(itemFulfillmentLineItemObj.lineItems[lineItem].itemLotObj).length > 0
                    ? Object.keys(itemFulfillmentLineItemObj.lineItems[lineItem].itemLotObj)
                    : ['']; //an empty string is required as we need the lotNumberKeysToPackBy to run at the next stage, whether lots exist or not
                lotNumberKeysToPackBy.forEach(function (lotNumber) {
                    sps_lib_auto_pack_v2_1.packLineItemUsingItemRuleArrProperty(itemFulfillmentLineItemObj, lineItem, lotNumber, itemFulfillmentLineItemObj.customer.manuallyPackRemainingQtyFlag);
                });
                if (itemFulfillmentLineItemObj.lineItems[lineItem].remainingQuantityToPack() > 0) {
                    // before we move on to packing in reduce we are going to build out script status JSON. This will be reviewed in
                    sps_lib_auto_pack_v2_1.finalizeItemStatusJsonForPackedLineItem(itemFulfillmentLineItemObj, lineItem, statusRec);
                }
            };
            for (var lineItem in itemFulfillmentLineItemObj.lineItems) {
                _loop_1(lineItem);
            }
        }
        alertScriptUsage(); //checking script usage for logging
        var fullOrderPackArr = [];
        for (var lineItem in itemFulfillmentLineItemObj.lineItems) {
            var lineItemsPackArr = itemFulfillmentLineItemObj.lineItems[lineItem].packageObjArr;
            itemFulfillmentLineItemObj.lineItems[lineItem].mapReducePackageArr = [];
            lineItemsPackArr.forEach(function (spsPack, index) {
                fullOrderPackArr.push(spsPack);
            });
        }
        fullOrderPackArr.forEach(function (pack, index) {
            var reduceKey = pack.cartonIndex;
            do {
                reduceKey = "0" + reduceKey;
            } while (reduceKey.length < 6);
            pack.reduceKey = reduceKey;
        });
        itemFulfillmentLineItemObj['reduceKey'] = '00';
        fullOrderPackArr.unshift(itemFulfillmentLineItemObj);
        log.debug('Input Stage Complete. Package Creation Beginning', "Starting to create " + (fullOrderPackArr.length - 1) + " packages");
        return fullOrderPackArr;
    }
    function map(mapContext) {
        var packData = JSON.parse(mapContext.value);
        mapContext.write(packData.reduceKey, packData);
    }
    function reduce(reduceContext) {
        // each reduce step is just creating a new package for this IF record
        var reduceVal = JSON.parse(reduceContext.values[0]);
        var reduceKeyNum = reduceContext.key;
        if (reduceKeyNum !== '00') {
            //log.debug('Reduce Key', `${reduceKeyNum} associated to Package Index: ${reduceVal['cartonIndex']}`);
            // do not try to pack first key as that is a value we use later
            sps_lib_auto_pack_v2_1.createOneSpsPackageAndPackageContentRecsUsingSpsPackObj(reduceVal);
        }
        alertScriptUsage(); //checking script usage for logging
        // need to write whatever info is needed in the next stage
        reduceContext.write(reduceContext.key, JSON.stringify(reduceVal));
    }
    function summarize(summaryContext) {
        var itemFulObj;
        var statusRec;
        summaryContext.output.iterator().each(function (key, value) {
            if (key === '00') {
                itemFulObj = JSON.parse(value);
            }
            return true;
        });
        // need to account for any errors during reduce (i.e. package create stage) so we can communicate that during logging in the script status rec
        var errorCount = 0;
        summaryContext.reduceSummary.errors.iterator().each(function (key, error, executionNo) {
            log.audit('Error Creating Package', JSON.stringify(error));
            errorCount += 1;
            return true;
        });
        log.debug('IF Obj in summarize before update', JSON.stringify(itemFulObj));
        // need to get the actual status rec since we have lost methods of the class due to map reduce turning data into string along way
        statusRec = sps_lib_script_status_rec_refactor_1.searchScriptStatusByTitleAndTransactionId(sps_lib_script_status_rec_1.scriptTitle.SPSPacking, itemFulObj.itemfulfillmentRecordId);
        log.debug('Script status rec in summarize', JSON.stringify(statusRec));
        // iterate over reduce error handling to confirm whether any packages were not able to  successfully
        //Update the status record
        sps_lib_auto_pack_v2_1.autoPackScriptRecPackingCompleteUpdate(statusRec, itemFulObj, errorCount);
        // once packing has been completed, we need to update Item Fulfillment record custcol packed qty field and the carton count field and package notes field
        sps_lib_auto_pack_v2_1.updateItemFulfillmentRecSpsPackedQtyAndCartonCountFields(itemFulObj);
        alertScriptUsage(); //checking script usage for logging
        log.debug("Auto Pack Complete for " + itemFulObj.transactionNumber, '');
    }
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize,
    };
});
