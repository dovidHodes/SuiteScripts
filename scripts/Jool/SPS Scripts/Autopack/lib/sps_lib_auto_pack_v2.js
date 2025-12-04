define(["require", "exports", "N/search", "N/log", "N/record", "./sps_lib_packdata_interfaces", "./sps_lib_auto_pack", "./sps_lib_script_status_rec_refactor", "N", "./sps_lib_script_status_rec", "./sps_lib_script_status_rec_refactor", "./sps_lib_script_status_rec_refactor", "N/task", "./sps_lib_record_mod_util", "N/runtime"], function (require, exports, search, log, record, sps_lib_packdata_interfaces_1, sps_lib_auto_pack_1, sps_lib_script_status_rec_refactor_1, N_1, sps_lib_script_status_rec_1, scrStatusRef, sps_lib_script_status_rec_refactor_2, task, sps_lib_record_mod_util_1, runtime) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createPackageObjectsForLineItemObj = exports.packLineItemUsingItemRuleArrProperty = exports.validateItemKeyAndLogActions = exports.sortPackRulesLargestRuleToSmallest = exports.checkWhetherWeShouldPackThisItem = exports.getItemRulesObjThatBestFitsItemForPacking = exports.getItemFulfillmentLineItemObj = exports.getALineItemsFulfillmentInventoryDetails = exports.getLineItemLotDirectoryKey = exports.getCountOfPackagesToBeCreatedForPrePackedIfObject = exports.getCustomerRecData = exports.updateItemFulfillmentRecSpsPackedQtyAndCartonCountFields = exports.scheduleMapReduceAndUpdateScriptStatusRecord = exports.restletScheduleMapReduceAndHandleScriptStatusUpdate = exports.finalizeItemStatusJsonForPackedLineItem = exports.removeErroredPackagesFromPrePackArr = exports.createOneSpsPackageAndPackageContentRecsUsingSpsPackObj = exports.autoPackScriptRecPackingCompleteUpdate = exports.logPackedLine = exports.autoPackInitializeScriptStatusRec = void 0;
    function autoPackInitializeScriptStatusRec(ifRecId, scriptType) {
        // step 1 check whether script status exists and if it does updates with script starting value
        var scriptStatus = scrStatusRef.searchScriptStatusByTitleAndTransactionId(sps_lib_script_status_rec_1.scriptTitle.SPSPacking, ifRecId);
        var initScriptStatus = new sps_lib_script_status_rec_refactor_2.SpsScriptStatus();
        if (scriptStatus) {
            // if there was already a script status rec, then update it with initial Auto Pack values for execution
            scriptStatus.status = sps_lib_script_status_rec_1.scriptStatusStatus.InProgress;
            scriptStatus.scriptExecutionType = scriptType;
            scriptStatus.statusMessage = 'Starting SPS Auto Pack scripting';
            scrStatusRef.submitScriptStatus(scriptStatus);
            //waiting to set partial pack flag to false until after submitting, as we want to only set partial pack to true if the script decides something isn't packed.
            scriptStatus.partialPackFlag = false;
            scriptStatus.statusJson = {};
        }
        else {
            // if no script status was found, then create a new and set the values similar to above
            initScriptStatus.title = sps_lib_script_status_rec_1.scriptTitle.SPSPacking;
            initScriptStatus.status = sps_lib_script_status_rec_1.scriptStatusStatus.InProgress;
            initScriptStatus.transactionId = ifRecId;
            initScriptStatus.scriptExecutionType = sps_lib_script_status_rec_1.scriptExecutionType.Suitelet;
            initScriptStatus.statusMessage = "Starting SPS Auto Pack scripting " + (scriptType === sps_lib_script_status_rec_1.scriptExecutionType.MapReduce ? 'In Map Reduce Deployment' : '');
            initScriptStatus.internalId = scrStatusRef.saveScriptStatus(initScriptStatus);
        }
        return scriptStatus !== null && scriptStatus !== void 0 ? scriptStatus : initScriptStatus;
    }
    exports.autoPackInitializeScriptStatusRec = autoPackInitializeScriptStatusRec;
    function logPackedLine(statusRec, lineItem) {
        statusRec.statusMessage = "Packing " + lineItem.itemName + " with unpacked quantity: " + lineItem.remainingQuantityToPack();
        scrStatusRef.submitScriptStatus(statusRec);
    }
    exports.logPackedLine = logPackedLine;
    function autoPackMapReduceScheduledStatusRec(scriptRec, status, statusText) {
        scriptRec.status = status;
        scriptRec.statusMessage = statusText;
        scriptRec.scriptExecutionType = sps_lib_script_status_rec_1.scriptExecutionType.MapReduce;
        scrStatusRef.submitScriptStatus(scriptRec);
    }
    function autoPackScriptRecPackingCompleteUpdate(statusRec, autoPackIfObj, mapReduceErrCount) {
        statusRec.status = sps_lib_script_status_rec_1.scriptStatusStatus.Complete;
        var errCount = mapReduceErrCount !== null && mapReduceErrCount !== void 0 ? mapReduceErrCount : 0;
        var newPackageCount = getCountOfPackagesToBeCreatedForPrePackedIfObject(autoPackIfObj) - errCount;
        statusRec.statusMessage = "Auto Pack completed. Created " + newPackageCount + " new packages. Original package count was " + (autoPackIfObj.cartonCount -
            newPackageCount) + ".";
        if (statusRec.partialPackFlag === true) {
            statusRec.statusMessage += " There are still quantities to Pack manually " + (autoPackIfObj.customer.manuallyPackRemainingQtyFlag === true ? 'because they would have created Partial Packages' : '');
        }
        scrStatusRef.submitScriptStatus(statusRec);
    }
    exports.autoPackScriptRecPackingCompleteUpdate = autoPackScriptRecPackingCompleteUpdate;
    var spsCustomerRecordFieldDictionary = {
        enableUOMConversion: { id: 'custentity_sps_accept_tp_uom' },
        enableItemFulfillmentToInvoiceSourcing: { id: 'custentity_sps_enable_if_to_inv_sourcing' },
        enableIntegrationStatusWorkflow: { id: 'custentity_sps_enable_invoice_workflow' },
        disableLotNumberAndExpirationFlag: { id: 'custentity_sps_lot_exp_flag' },
        manuallyPackRemainingQtyFlag: { id: 'custentity_sps_lot_man_pack_qtys' },
        defaultPackageSourcing: { id: 'custentity_sps_package_data_source' },
        ssccLabelExtensionDigit: { id: 'custentity_sps_sscc_ext_digit' },
        acceptTradingPartnerPrices: { id: 'custentity_sps_tp_price_accept' },
    };
    var spsCustomerRecFieldSearchColumnArr = Object.values(spsCustomerRecordFieldDictionary).map(function (fieldObj) {
        return fieldObj.id;
    });
    // create error objects to pass back
    var createPackageContentRecordError = N_1.error.create({ message: 'Unable to Create SPS Package Content record due to package record ID not being saved. Please contact SPS Support for Help', name: 'SPS SCRIPT ERROR', notifyOff: true });
    var failedToUpdateQtyPackedAndCartonCountFieldsOnItemFulfilmentRecError = function (ifId) { return N_1.error.create({ message: "Failed to save Item Fulfillment Record with internal ID: " + ifId + " when updating the SPS Qty Packed line and Carton Count fields. Please contact SPS Support for Help", name: 'SPS SCRIPT ERROR', notifyOff: true }); };
    function createOneSpsPackageAndPackageContentRecsUsingSpsPackObj(packageObj) {
        var newPackageRec = record.create({ type: 'customrecord_sps_package' });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_width', value: packageObj.width });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_length', value: packageObj.length });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_height', value: packageObj.height });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_ucc', value: packageObj.labelId });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_outer', value: packageObj.outerPack });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_inner', value: packageObj.innerPack });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_level_type', value: packageObj.packLevelType });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_carton_index', value: packageObj.cartonIndex });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_location', value: packageObj.locationId });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_pk_weight', value: parseFloat(packageObj.weight).toFixed(3) }); // added to fixed to limit excessive decimals through calculations
        newPackageRec.setValue({ fieldId: 'custrecord_sps_pack_asn', value: packageObj.itemFulfillmentId });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_qty', value: packageObj.packageQuantity });
        newPackageRec.setValue({ fieldId: 'custrecord_sps_package_box_type', value: packageObj.spsPackageDefinitionId });
        var newPackId = newPackageRec.save();
        // log.debug('New package ID', newPackId);
        // Now create package content record based on items selected from Package Content sublist
        if (!newPackId)
            throw createPackageContentRecordError;
        var newPackContentRec = record.create({ type: 'customrecord_sps_content' });
        newPackContentRec.setValue({ fieldId: 'custrecord_sps_content_item', value: packageObj.items[0].itemId });
        newPackContentRec.setValue({ fieldId: 'custrecord_sps_content_qty', value: packageObj.items[0].itemQuantity });
        newPackContentRec.setValue({ fieldId: 'custrecord_sps_content_lot', value: packageObj.items[0].lotNumber });
        newPackContentRec.setValue({ fieldId: 'custrecord_sps_content_expiration', value: packageObj.items[0].lotExpirationDate });
        newPackContentRec.setValue({ fieldId: 'custrecord_sps_content_item_line_num', value: packageObj.items[0].itemFulfillmentLine });
        newPackContentRec.setValue({ fieldId: 'custrecord_sps_content_package', value: newPackId });
        var newPackContentId = newPackContentRec.save();
        // log.debug('New pack content ID created', newPackContentId);
        packageObj.spsPackageId = newPackId.toString();
        packageObj.items[0].spsPackageContentId = newPackContentId.toString();
        return newPackId;
    }
    exports.createOneSpsPackageAndPackageContentRecsUsingSpsPackObj = createOneSpsPackageAndPackageContentRecsUsingSpsPackObj;
    function removeErroredPackagesFromPrePackArr(packageObjArr) {
        return packageObjArr.filter(function (pack) {
            if (pack.spsPackageId)
                return pack;
        });
    }
    exports.removeErroredPackagesFromPrePackArr = removeErroredPackagesFromPrePackArr;
    function finalizeItemStatusJsonForPackedLineItem(itemFulfillmentObj, itemKey, statusRecObj) {
        statusRecObj.partialPackFlag = true;
        if (!statusRecObj.statusJson) {
            statusRecObj.statusJson = {};
        }
        if (itemFulfillmentObj.lineItems[itemKey].itemRulesArr.length === 0) {
            // cause is related to no auto pack rules being found
            statusRecObj.statusJson[itemFulfillmentObj.lineItems[itemKey].itemId + "^" + itemFulfillmentObj.lineItems[itemKey].itemfulfillmentlineId] = 'No Auto Pack Rules Exist';
            itemFulfillmentObj.spsPackageNotesVal = itemFulfillmentObj.spsPackageNotesVal + " No Auto Pack rules defined for item " + itemFulfillmentObj.lineItems[itemKey].itemName + ".";
        }
        else if (itemFulfillmentObj.customer.manuallyPackRemainingQtyFlag === true) {
            // then alert the user that they wanted to finish partial packing
            statusRecObj.statusJson[itemFulfillmentObj.lineItems[itemKey].itemId + "^" + itemFulfillmentObj.lineItems[itemKey].itemfulfillmentlineId] = 'Manually Pack Partial Quantities is selected at Customer record';
        }
        else {
            // if first two conditions were not met, then likely some error is cause so provide that context
            statusRecObj.statusJson[itemFulfillmentObj.lineItems[itemKey].itemId + "^" + itemFulfillmentObj.lineItems[itemKey].itemfulfillmentlineId] = 'Script Execution Error, please check debug logs for more details.';
        }
        sps_lib_script_status_rec_refactor_1.submitScriptStatus(statusRecObj);
    }
    exports.finalizeItemStatusJsonForPackedLineItem = finalizeItemStatusJsonForPackedLineItem;
    function restletScheduleMapReduceAndHandleScriptStatusUpdate(itemFulfillmentObj, statusRecObj) {
        var mrTaskId = '';
        var status = sps_lib_script_status_rec_1.scriptStatusStatus.Scheduled;
        var scriptStatusText = 'Auto Pack is processing and your packages are being created, please allow the process to complete and do not click \'Auto Pack Shipment\' again.';
        try {
            var mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_sps_mr_auto_pack_2x',
                params: { custscript_sps_mr_autopack_json: { itemFulfillmentArr: [itemFulfillmentObj.itemfulfillmentRecordId] } },
            });
            mrTaskId = mrTask.submit();
        }
        catch (taskScheduleError) {
            status = sps_lib_script_status_rec_1.scriptStatusStatus.Error;
            if (taskScheduleError.name == 'NO_DEPLOYMENTS_AVAILABLE') {
                scriptStatusText = 'Unable to schedule since all script deployments are in use for SPS MR Auto Pack 2.0. Please wait a couple of minutes and try again. If you continue to get this message, contact SPS Support for further actions to take';
                log.error({ title: 'MAP_REDUCE_ALREADY_RUNNING', details: scriptStatusText });
            }
            else {
                scriptStatusText = taskScheduleError.message;
                log.error({ title: taskScheduleError.name, details: taskScheduleError.message });
            }
        }
        autoPackMapReduceScheduledStatusRec(statusRecObj, status, scriptStatusText);
        return mrTaskId;
    }
    exports.restletScheduleMapReduceAndHandleScriptStatusUpdate = restletScheduleMapReduceAndHandleScriptStatusUpdate;
    function scheduleMapReduceAndUpdateScriptStatusRecord(itemFulfillmentObj, statusRecObj) {
        var mrTaskId = '';
        var status = sps_lib_script_status_rec_1.scriptStatusStatus.Scheduled;
        var scriptStatusText = 'Auto Pack is processing and your packages are being created, please allow the process to complete and do not click \'Auto Pack Shipment\' again.';
        try {
            var mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_sps_mr_auto_pack_2x',
                params: { custscript_sps_mr_autopack_json: { itemFulfillmentArr: [itemFulfillmentObj.itemfulfillmentRecordId] } },
            });
            mrTaskId = mrTask.submit();
        }
        catch (taskScheduleError) {
            status = sps_lib_script_status_rec_1.scriptStatusStatus.Error;
            if (taskScheduleError.name == 'NO_DEPLOYMENTS_AVAILABLE') {
                scriptStatusText = 'Unable to schedule since all script deployments are in use for SPS MR Auto Pack 2.0. Please wait a couple of minutes and try again. If you continue to get this message, contact SPS Support for further actions to take';
                log.error({ title: 'MAP_REDUCE_ALREADY_RUNNING', details: scriptStatusText });
            }
            else {
                scriptStatusText = taskScheduleError.message;
                log.error({ title: taskScheduleError.name, details: taskScheduleError.message });
            }
        }
        autoPackMapReduceScheduledStatusRec(statusRecObj, status, scriptStatusText);
    }
    exports.scheduleMapReduceAndUpdateScriptStatusRecord = scheduleMapReduceAndUpdateScriptStatusRecord;
    function updateItemFulfillmentRecSpsPackedQtyAndCartonCountFields(itemFulfillmentObj) {
        if (!itemFulfillmentObj.itemfulfillmentRecordId)
            throw sps_lib_record_mod_util_1.loadItemFulfillmentRecError(itemFulfillmentObj.itemfulfillmentRecordId);
        var ifRec = record.load({ id: itemFulfillmentObj.itemfulfillmentRecordId, type: record.Type.ITEM_FULFILLMENT });
        try {
            for (var lineItem in itemFulfillmentObj.lineItems) {
                ifRec.setSublistValue({ fieldId: 'custcol_sps_qtypacked', line: itemFulfillmentObj.lineItems[lineItem].itemfullfilmentLineIndex, sublistId: "item", value: itemFulfillmentObj.lineItems[lineItem].itemPackedQuantity });
            }
            ifRec.setValue({ fieldId: 'custbody_sps_trans_carton_ct', ignoreFieldChange: true, value: itemFulfillmentObj.cartonCount });
            ifRec.setValue({
                fieldId: 'custbody_sps_package_notes',
                ignoreFieldChange: true,
                value: "Finished auto packing. Created " + getCountOfPackagesToBeCreatedForPrePackedIfObject(itemFulfillmentObj) + " new packages. " + (itemFulfillmentObj.spsPackageNotesVal.length > 3900 ? 'Too many Pack Rule errors to list, check package definitions.' : itemFulfillmentObj.spsPackageNotesVal),
            });
            ifRec.save();
        }
        catch (e) {
            log.error({ title: 'SPS Auto Pack Error', details: "Failed to update SPS Qty Packed line field and Carton Count body field for Item Fulfillment with id: " + itemFulfillmentObj.itemfulfillmentRecordId + ". Cause of error: " + e.message });
            throw failedToUpdateQtyPackedAndCartonCountFieldsOnItemFulfilmentRecError(itemFulfillmentObj.itemfulfillmentRecordId);
        }
    }
    exports.updateItemFulfillmentRecSpsPackedQtyAndCartonCountFields = updateItemFulfillmentRecSpsPackedQtyAndCartonCountFields;
    function getCustomerRecData(customerId, customerName) {
        // initialize a record that has the default settings we expect
        var initializeCustomerObj = {
            customerId: customerId,
            customerName: customerName,
            acceptTradingPartnerPrices: false,
            enableIntegrationStatusWorkflow: false,
            disableLotNumberAndExpirationFlag: false,
            manuallyPackRemainingQtyFlag: false,
            enableItemFulfillmentToInvoiceSourcing: false,
            enableUOMConversion: false,
        };
        try {
            var customerSearchObj = search.lookupFields({
                type: search.Type.CUSTOMER,
                id: customerId,
                columns: spsCustomerRecFieldSearchColumnArr,
            });
            for (var customerFieldKey in spsCustomerRecordFieldDictionary) {
                var searchValue = customerSearchObj[spsCustomerRecordFieldDictionary[customerFieldKey].id] || null;
                if (searchValue)
                    initializeCustomerObj[customerFieldKey] = searchValue;
            }
        }
        catch (e) {
            log.debug({ title: 'Error Getting SPS Cust Rec Data', details: "Returning default Config Object because following error occurred: " + e.message });
        }
        return initializeCustomerObj;
    }
    exports.getCustomerRecData = getCustomerRecData;
    function getCountOfPackagesToBeCreatedForPrePackedIfObject(itemFulfillmentObj) {
        if (!itemFulfillmentObj.lineItems)
            return 0;
        return Object.values(itemFulfillmentObj.lineItems).map(function (lineItem) { return lineItem.packageObjArr.length; }).reduce(function (preVal, curVal) { return preVal + curVal; });
    }
    exports.getCountOfPackagesToBeCreatedForPrePackedIfObject = getCountOfPackagesToBeCreatedForPrePackedIfObject;
    function getLineItemLotDirectoryKey(lineId, itemId, lotNumber) {
        return lineId + "^" + itemId + "^" + lotNumber;
    }
    exports.getLineItemLotDirectoryKey = getLineItemLotDirectoryKey;
    function getALineItemsFulfillmentInventoryDetails(ifRecord, lineIndex) {
        if (!ifRecord || typeof lineIndex !== 'number') {
            log.debug('Invalid Params for Getting Inv Detail', "");
            return {};
        } // TODO: handle errors around this
        var currLineItemLotObject = {};
        if (runtime.isFeatureInEffect({ feature: 'advbinseriallotmgmt' })) {
            var inventoryDetailSubRec = ifRecord.getSublistSubrecord({
                fieldId: 'inventorydetail',
                line: lineIndex,
                sublistId: 'item'
            });
            var totalInventoryCountForCurrLine = inventoryDetailSubRec.getLineCount({ sublistId: sps_lib_record_mod_util_1.nsSublistNamesLib.invDetail });
            for (var invLine = 0; invLine < totalInventoryCountForCurrLine; invLine++) {
                var tempLotItemObj = {
                    //lotRecId:
                    lotNumber: sps_lib_record_mod_util_1.getInvDetailSublistRecordField(inventoryDetailSubRec, 'issueinventorynumber', invLine).text,
                    lotExpDate: sps_lib_record_mod_util_1.getInvDetailSublistRecordField(inventoryDetailSubRec, 'expirationdate', invLine).text,
                    lotQuantity: sps_lib_record_mod_util_1.getInvDetailSublistRecordField(inventoryDetailSubRec, 'quantity', invLine).asNum(),
                    lotPackedQty: 0,
                };
                if (currLineItemLotObject[tempLotItemObj.lotNumber]) {
                    // if lot already exists in current Line Lot Object, then just add quantity
                    currLineItemLotObject[tempLotItemObj.lotNumber].lotQuantity += tempLotItemObj.lotQuantity;
                }
                else {
                    currLineItemLotObject[tempLotItemObj.lotNumber] = tempLotItemObj;
                }
            }
        }
        return currLineItemLotObject;
    }
    exports.getALineItemsFulfillmentInventoryDetails = getALineItemsFulfillmentInventoryDetails;
    function getItemFulfillmentLineItemObj(itemFulfillmentId, packageSource) {
        if (packageSource === void 0) { packageSource = 1; }
        var packedLotQtyObj = sps_lib_auto_pack_1.getIfPackedLotObj(itemFulfillmentId);
        var itemFulfillmentLineItemsArr = [];
        log.debug('packLotDirObj', JSON.stringify(packedLotQtyObj));
        var ifRec = record.load({ id: itemFulfillmentId, type: record.Type.ITEM_FULFILLMENT });
        function getPackageResultCount(itemFulfillmentIds, packageId, packageSourceId, packStructure) {
            var searchFilter = [['custrecord_sps_pack_asn', 'anyof'].concat(itemFulfillmentIds)];
            if (packageId) {
                searchFilter = [['internalid', 'anyof', packageId]];
            }
            var customrecord_sps_packageSearchObj = search.create({
                type: 'customrecord_sps_package',
                filters: searchFilter,
            });
            var packageResultCount = customrecord_sps_packageSearchObj.runPaged().count;
            return packageResultCount;
        }
        // create initial IF Record Obj with info we use as SPS
        var itemFulfillmentRecordSpsObj = {
            itemfulfillmentRecordId: itemFulfillmentId,
            transactionWeightUnit: sps_lib_record_mod_util_1.getRecordLoadField(ifRec, 'tranweightunit').text,
            transactionDate: sps_lib_record_mod_util_1.getRecordLoadField(ifRec, 'trandate').asStr(),
            transactionNumber: sps_lib_record_mod_util_1.getRecordLoadField(ifRec, 'tranid').asStr(),
            salesOrderId: sps_lib_record_mod_util_1.getRecordLoadField(ifRec, 'orderid').asStr(),
            cartonCount: getPackageResultCount([itemFulfillmentId], '', packageSource.toString()) || 0,
            spsPackageNotesVal: '',
            createNewPackageIndex: function () {
                // call this function when creating a new package for this Item Fulfillment record.
                // add a new package index count and update tracking for it
                this.cartonCount += 1;
                return this.cartonCount;
            },
            lineItems: {},
        };
        var customerIdAndName = sps_lib_record_mod_util_1.getRecordLoadField(ifRec, 'entity');
        if (customerIdAndName.value)
            itemFulfillmentRecordSpsObj.customer = getCustomerRecData(customerIdAndName.asStr(), customerIdAndName.text);
        var totalItemCount = ifRec.getLineCount({ sublistId: sps_lib_record_mod_util_1.nsSublistNamesLib.items });
        // loop over each item on IF Record and create a LineItem object in our ItemFulfilment Record
        for (var line = 0; line < totalItemCount; line++) {
            var currItemLotDict = getALineItemsFulfillmentInventoryDetails(ifRec, line);
            // loop over each item sublist value and create a Line Item Obj
            var currLineItemObj = {
                itemWeight: sps_lib_record_mod_util_1.getItemSublistRecordField(ifRec, 'itemweight', line).asStr(),
                itemfulfillmentlineId: sps_lib_record_mod_util_1.getItemSublistRecordField(ifRec, 'line', line).asStr(),
                itemId: sps_lib_record_mod_util_1.getItemSublistRecordField(ifRec, 'item', line).asStr(),
                itemName: sps_lib_record_mod_util_1.getItemSublistRecordField(ifRec, 'itemname', line).text,
                itemfullfilmentLineIndex: line,
                itemQuantity: sps_lib_record_mod_util_1.getItemSublistRecordField(ifRec, 'quantity', line).asNum(),
                itemTransactionUnit: sps_lib_record_mod_util_1.getItemSublistRecordField(ifRec, 'units', line).asStr(),
                itemUnitConversionValue: sps_lib_record_mod_util_1.getItemSublistRecordField(ifRec, 'unitconversion', line).asStr(),
                itemPackedQuantity: sps_lib_record_mod_util_1.getItemSublistRecordField(ifRec, 'custcol_sps_qtypacked', line).asNum(),
                itemLotObj: currItemLotDict,
                packageObjArr: [],
                remainingQuantityToPack: function (lotNumber) {
                    var remainingQty = this.itemQuantity - this.itemPackedQuantity;
                    if (lotNumber && this.itemLotObj[lotNumber]) {
                        remainingQty = this.itemLotObj[lotNumber].lotQuantity - this.itemLotObj[lotNumber].lotPackedQty;
                    }
                    return remainingQty;
                },
                packLineItem: function (PackTypeQty, lotNumber, commit) {
                    // this will as much remaining Qty left to be packed into the Pack Qty provided
                    var packedQuantity = Math.min(PackTypeQty, this.remainingQuantityToPack());
                    if (lotNumber) {
                        packedQuantity = Math.min(PackTypeQty, this.remainingQuantityToPack(lotNumber));
                    }
                    if (commit === true) {
                        // we want to confirm we have not had an error creating packages records before committing quantities
                        this.itemPackedQuantity += packedQuantity;
                        if (lotNumber && this.itemLotObj[lotNumber]) {
                            // if Lot inventory Item then need to update individual pack lot info too
                            this.itemLotObj[lotNumber].lotPackedQty += packedQuantity;
                        }
                    }
                    return packedQuantity;
                },
            };
            // update itemLotObj with current packed quantity
            for (var lotNumber in currLineItemObj.itemLotObj) {
                var lineLotKey = getLineItemLotDirectoryKey(currLineItemObj.itemfulfillmentlineId, currLineItemObj.itemId, lotNumber);
                // update the currLinesLotObj packed quantity field if there is a value in the packed Lot Directory
                if (packedLotQtyObj[lineLotKey])
                    currLineItemObj.itemLotObj[lotNumber].lotPackedQty = packedLotQtyObj[lineLotKey];
            }
            itemFulfillmentRecordSpsObj.lineItems[currLineItemObj.itemId + "^" + currLineItemObj.itemfulfillmentlineId] = currLineItemObj;
        }
        return itemFulfillmentRecordSpsObj;
    }
    exports.getItemFulfillmentLineItemObj = getItemFulfillmentLineItemObj;
    function getItemRulesObjThatBestFitsItemForPacking(itemFulfillmentObj, packRulesObj, itemKey) {
        if (!itemFulfillmentObj.lineItems[itemKey])
            return []; // if itemKey doesn't match any line items, nothing should be returned except empty array
        var lineItemObj = itemFulfillmentObj.lineItems[itemKey];
        var itemsPackRuleObj = packRulesObj[lineItemObj.itemId] || {};
        var customerUnitKey = "C" + itemFulfillmentObj.customer.customerId + "^U" + lineItemObj.itemTransactionUnit;
        var customerOnlyKey = "C" + itemFulfillmentObj.customer.customerId + "^U";
        var unitOnlyKey = "C^U" + lineItemObj.itemTransactionUnit;
        var packRuleSetToIterateAgainst;
        if (itemsPackRuleObj[customerUnitKey]) {
            // Use customer and unit key together rules
            packRuleSetToIterateAgainst = itemsPackRuleObj[customerUnitKey];
        }
        else if (itemsPackRuleObj[customerOnlyKey]) {
            // use customer only subset rules
            packRuleSetToIterateAgainst = itemsPackRuleObj[customerOnlyKey];
        }
        else if (itemsPackRuleObj[unitOnlyKey]) {
            // use the Unit only subset rules
            packRuleSetToIterateAgainst = itemsPackRuleObj[unitOnlyKey];
        }
        else {
            // at this point, would be considered only global rules for this item
            packRuleSetToIterateAgainst = itemsPackRuleObj.GLOBAL || {};
        }
        // set it to the line object
        itemFulfillmentObj.lineItems[itemKey].itemRulesArr = Object.values(packRuleSetToIterateAgainst);
    }
    exports.getItemRulesObjThatBestFitsItemForPacking = getItemRulesObjThatBestFitsItemForPacking;
    function checkWhetherWeShouldPackThisItem(lineItem, lotName) {
        if (lineItem.remainingQuantityToPack(lotName) > 0 || lineItem.itemRulesArr.length > 0) {
            return true;
        }
        else {
            return false;
        }
    }
    exports.checkWhetherWeShouldPackThisItem = checkWhetherWeShouldPackThisItem;
    function sortPackRulesLargestRuleToSmallest(itemFulfillmentObj, lineItemKey) {
        if (!validateItemKeyAndLogActions(itemFulfillmentObj, lineItemKey))
            return; // if itemKey doesn't match any line items no action can be taken so just return
        if (checkWhetherWeShouldPackThisItem(itemFulfillmentObj.lineItems[lineItemKey])) {
            // Create the Array of Package Objecst to be packed starting with the Largest Pack Rule to Smallest
            itemFulfillmentObj.lineItems[lineItemKey].itemRulesArr.sort(function (a, b) {
                return b.packRuleItemQuantity - a.packRuleItemQuantity;
            });
            // now that Pack rules are sorted from Largest to Smallest, loop over Lots first and if no Lots, then item quantity
            log.debug("Pack Rule Qty for " + itemFulfillmentObj.lineItems[lineItemKey].itemName, JSON.stringify(itemFulfillmentObj.lineItems[lineItemKey].itemRulesArr));
        }
    }
    exports.sortPackRulesLargestRuleToSmallest = sortPackRulesLargestRuleToSmallest;
    function validateItemKeyAndLogActions(itemFulfillmentObj, lineItemKey) {
        if (!(itemFulfillmentObj === null || itemFulfillmentObj === void 0 ? void 0 : itemFulfillmentObj.lineItems[lineItemKey])) {
            log.debug('SPS Item Key Validation', lineItemKey + " provided doesn't exists in keys from If Object provided: " + Object.keys(itemFulfillmentObj.lineItems) + ". Cannot proceed with action.");
            return false;
        }
        return true;
    }
    exports.validateItemKeyAndLogActions = validateItemKeyAndLogActions;
    function packLineItemUsingItemRuleArrProperty(itemFulfillmentObj, lineItemKey, lotName, partialPackFlag) {
        // validate that the ItemKey provided exists in IF object before proceeding:
        if (!validateItemKeyAndLogActions(itemFulfillmentObj, lineItemKey))
            return;
        if (!checkWhetherWeShouldPackThisItem(itemFulfillmentObj.lineItems[lineItemKey]))
            return;
        sortPackRulesLargestRuleToSmallest(itemFulfillmentObj, lineItemKey);
        itemFulfillmentObj.lineItems[lineItemKey].itemRulesArr.forEach(function (packRuleObj, index) {
            // code here
            var rulePackQty = packRuleObj.packRuleItemQuantity;
            var minimumPackagesCreated = Math.floor(itemFulfillmentObj.lineItems[lineItemKey].remainingQuantityToPack(lotName) / rulePackQty);
            var remainderLeftToPack = itemFulfillmentObj.lineItems[lineItemKey].remainingQuantityToPack(lotName) - minimumPackagesCreated * rulePackQty;
            var totalPackagesToCreateForThisRuleQty = minimumPackagesCreated;
            var nextRulePackQty = itemFulfillmentObj.lineItems[lineItemKey].itemRulesArr[index + 1] ? itemFulfillmentObj.lineItems[lineItemKey].itemRulesArr[index + 1].packRuleItemQuantity : 0;
            if (remainderLeftToPack > nextRulePackQty && partialPackFlag === false) {
                // if partial pack is allowed and remaining qty to be packed is larger than the next rule qty, we should completely finish packing this item using this rule
                totalPackagesToCreateForThisRuleQty += 1;
            }
            createPackageObjectsForLineItemObj(itemFulfillmentObj, lineItemKey, totalPackagesToCreateForThisRuleQty, packRuleObj, lotName);
        });
    }
    exports.packLineItemUsingItemRuleArrProperty = packLineItemUsingItemRuleArrProperty;
    function createPackageObjectsForLineItemObj(itemFulfillmentObj, lineItemKey, totalPackagesToCreate, packRuleObj, lotName) {
        var _a, _b, _c;
        if (totalPackagesToCreate > 0 && validateItemKeyAndLogActions(itemFulfillmentObj, lineItemKey)) {
            var unpackedQty = itemFulfillmentObj.lineItems[lineItemKey].remainingQuantityToPack(lotName);
            var countOfPackagesAlreadyCreatedForThisExecution = itemFulfillmentObj.lineItems[lineItemKey].packageObjArr.length;
            // we should create each package as necessary
            for (var packIndex = 0; totalPackagesToCreate > packIndex; packIndex++) {
                // Each for loop action will take api usage against our governance, so we only want to continue as long as we are higher than our governance check.
                // using the packLineItem method of the Line Item Obj, I can get the quantity that will be packed without committing to it, thats why we don't pass true in that line
                var minimumPackQuantity = itemFulfillmentObj.lineItems[lineItemKey].packLineItem(packRuleObj.packRuleItemQuantity, lotName);
                var itemPackWeight = parseFloat(itemFulfillmentObj.lineItems[lineItemKey].itemWeight);
                var calcWeight = void 0;
                if (itemPackWeight) {
                    calcWeight = minimumPackQuantity * itemPackWeight + parseFloat(packRuleObj.packWeight);
                }
                else {
                    calcWeight = parseFloat(packRuleObj.packWeight);
                }
                var tempSpsPackObj = sps_lib_packdata_interfaces_1.requestPackageObj();
                tempSpsPackObj.packageQuantity = minimumPackQuantity.toString();
                tempSpsPackObj.cartonIndex = itemFulfillmentObj.createNewPackageIndex().toString();
                tempSpsPackObj.height = packRuleObj.packHeight;
                tempSpsPackObj.length = packRuleObj.packLength;
                tempSpsPackObj.width = packRuleObj.packWidth;
                tempSpsPackObj.packLevelType = packRuleObj.packLevelTypeId;
                tempSpsPackObj.spsPackageDefinitionId = packRuleObj.packTypeId;
                // @ts-ignore
                tempSpsPackObj.weight = calcWeight.toString();
                tempSpsPackObj.itemFulfillmentId = itemFulfillmentObj.itemfulfillmentRecordId;
                var tempItemObj = sps_lib_packdata_interfaces_1.requestItemObj();
                tempItemObj.itemId = itemFulfillmentObj.lineItems[lineItemKey].itemId;
                tempItemObj.itemQuantity = minimumPackQuantity.toString();
                tempItemObj.itemFulfillmentLine = itemFulfillmentObj.lineItems[lineItemKey].itemfulfillmentlineId;
                if ((_a = itemFulfillmentObj.lineItems[lineItemKey]) === null || _a === void 0 ? void 0 : _a.itemLotObj[lotName]) {
                    tempItemObj.lotExpirationDate = (_b = itemFulfillmentObj.lineItems[lineItemKey]) === null || _b === void 0 ? void 0 : _b.itemLotObj[lotName].lotExpDate;
                    tempItemObj.lotNumber = (_c = itemFulfillmentObj.lineItems[lineItemKey]) === null || _c === void 0 ? void 0 : _c.itemLotObj[lotName].lotNumber;
                }
                // @ts-ignore
                tempSpsPackObj.items.push(tempItemObj);
                // now that JSON is built out, officially commit packline and also add JSON package into packageObjArr, to be then packed later
                itemFulfillmentObj.lineItems[lineItemKey].packLineItem(packRuleObj.packRuleItemQuantity, lotName, true);
                itemFulfillmentObj.lineItems[lineItemKey].packageObjArr.push(tempSpsPackObj);
            }
            if (itemFulfillmentObj.lineItems[lineItemKey].packageObjArr.length > 0) {
                // Only going to log info on packages created if there are packages created for this item
                // If a Lot item with multiple Lots, then its possible this log is created even if one Lot doesn't have packages created (for governance reasons or partial pack rule) and will still throw this log
                log.debug('Created Package(s)', "For " + itemFulfillmentObj.lineItems[lineItemKey].itemName + " " + (lotName ? "and Lot " + lotName : '') + " at Line " + itemFulfillmentObj.lineItems[lineItemKey].itemfulfillmentlineId + " with unpacked quantity:" + unpackedQty + " , using Rule Qty: " + packRuleObj.packRuleItemQuantity + " resulted in " + (itemFulfillmentObj.lineItems[lineItemKey].packageObjArr.length -
                    countOfPackagesAlreadyCreatedForThisExecution) + " new packages ");
            }
        }
    }
    exports.createPackageObjectsForLineItemObj = createPackageObjectsForLineItemObj;
});
