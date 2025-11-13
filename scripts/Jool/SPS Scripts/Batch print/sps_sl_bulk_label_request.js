/**
 *@NApiVersion 2.0
 *@NModuleScope SameAccount
 *@NScriptType Suitelet
 */
define(["require", "exports", "N/error", "N/log", "N/config", "N/record", "N/task", "./lib/sps_lib_packdata", "./lib/sps_lib_create_if_obj", "./lib/sps_lib_label", "./lib/sps_lib_label_api", "./lib/sps_lib_label_removal", "N/runtime"], function (require, exports, error, log, config, record, task, packdata, createIfObj, label, spsapi, removeLabel, runtime) {
    function onRequest(ctx) {
        var logDebugXmlFile = true;
        var maxLabelRequest = 75;
        var paramObj = ctx.request.parameters;
        var itemFulfillmentStr = paramObj.id || paramObj.param1;
        var packageId = paramObj.packid;
        var packageSource = paramObj.packageSource, wmsShipmentRec = paramObj.wmsShipmentRec;
        var packStructure = paramObj.asnType;
        var rowLimit = 225;
        var itemFulfillmentRecLimit = 30;
        // AP Dev Note: Based on testing, 1 IF Rec with 1 Label File generated, 170 Gov points are used. Which means remaining 830 should be used to base passing off to MR
        log.debug('Starting Script', "For Item Fulfillment: " + itemFulfillmentStr + ".  Will debug file be placed in SPS Debug folder for Suitelet: " + logDebugXmlFile);
        if (packageId) {
            log.debug('Additional Parameter found', "Script executing for only Package: " + packageId);
        }
        var companyConfigRecord = config.load({ type: config.Type.COMPANY_PREFERENCES });
        var labelSearchId = companyConfigRecord.getValue({ fieldId: 'custscript_sps_label_api_search' });
        var compLabelSettings = label.getLabelRecObj();
        if (!compLabelSettings) {
            throw error.create({ name: 'MISSING_REQUIRED_PARAM', message: 'Missing Company Label Setup Record. Contact SPS Support' });
        }
        var token = compLabelSettings.custrecord_sps_label_login_token;
        if (typeof itemFulfillmentStr === 'string') {
            var itemFulfillmentArr_1 = itemFulfillmentStr.split(',');
            if (itemFulfillmentArr_1.length > 0) {
                var packageSourceStr = packdata.getPackageSourceString(packageSource);
                log.debug('Pacejet Package Source Log', "Package Structure requested: " + packStructure);
                var packageObj = packdata.getArray(itemFulfillmentArr_1, packageId, packageSource, packStructure);
                var packValidationMessage = packdata.validateSpsJson(packageObj);
                if (packValidationMessage) {
                    throw error.create({ name: 'PACKAGE VALIDATION MISSING', message: "Error from Package Validation: " + packValidationMessage, notifyOff: true });
                }
                var labelCount = packageObj.length;
                // MR Governance Check Logic: Per Label File: 10 points and per IF Rec is 10 points. So
                var govCalc = Math.ceil(labelCount / rowLimit) * 10 * itemFulfillmentArr_1.length + itemFulfillmentArr_1.length * 10;
                if (labelCount > rowLimit || itemFulfillmentArr_1.length > itemFulfillmentRecLimit || govCalc > 700) {
                    log.debug('Handing Off to MR', "Curr Gov: " + runtime.getCurrentScript().getRemainingUsage() + ". Have " + itemFulfillmentArr_1.length + " IF recs with " + Math.ceil(labelCount / rowLimit) + " files per record. We calculated: " + govCalc + " needed");
                    var taskId = '';
                    try {
                        var mrTask = task.create({
                            taskType: task.TaskType.MAP_REDUCE,
                            scriptId: 'customscript_sps_mr_bulk_label_req',
                            params: { custscript_sps_mr_bulk_label_json: { itemFulfillmentArr: itemFulfillmentArr_1, packageSource: packageSource, packStructure: packStructure, wmsShipmentRec: wmsShipmentRec } },
                        });
                        taskId = mrTask.submit();
                    }
                    catch (taskScheduleError) {
                        if (taskScheduleError.name !== 'MAP_REDUCE_ALREADY_RUNNING') {
                            throw taskScheduleError;
                        }
                    }
                    var responseMsg = void 0;
                    var submitFieldsMsg_1;
                    if (taskId) {
                        submitFieldsMsg_1 = 'Label Generation passed to Map Reduce script';
                        responseMsg = 'Creation of Shipping Labels has been scheduled. Please see Map Reduce Script Status for notice of completion.';
                    }
                    else {
                        submitFieldsMsg_1 =
                            'Label Generation requires scheduling due to size of data, but SPS scripts could not schedule this execution at this time. Please retry again shortly.';
                        responseMsg =
                            'Unable to schedule since all script deployments are in use for SPS MR Batch Labels. Please see Map Reduce Script Status and retry when a deployment is available for SPS MR Batch Labels.';
                    }
                    itemFulfillmentArr_1.forEach(function (ifId) {
                        // 10 point Governance per submitFields
                        record.submitFields({
                            type: record.Type.ITEM_FULFILLMENT,
                            id: ifId,
                            values: {
                                custbody_sps_lbl_msg: submitFieldsMsg_1,
                            },
                            options: {
                                enableSourcing: false,
                                ignoreMandatoryFields: true,
                            },
                        });
                    });
                    var responseObj_1 = {
                        message: responseMsg,
                    };
                    log.debug('Map Reduce Handoff Result', responseMsg);
                    ctx.response.write(JSON.stringify(responseObj_1));
                    return;
                }
                // New: remove existing Label Files before creating new PDFs
                removeLabel.findRemoveExistingLabels(itemFulfillmentArr_1, packageId);
                var itemFulfillmentObj = createIfObj.getIfObj(itemFulfillmentArr_1, labelSearchId, packageSource, wmsShipmentRec);
                var itemFulfillmentResults = itemFulfillmentObj.ifResults;
                log.debug('ifObj', JSON.stringify(itemFulfillmentResults));
                var results = label.getLabelResultObj(itemFulfillmentArr_1, itemFulfillmentResults, packageObj, compLabelSettings, maxLabelRequest, packageSourceStr);
                var labelXmlArr = results.labelArr;
                // const completeLabelObj = results.responseArr  -- Used for Testing
                var labelBatchCount_1 = Math.ceil(labelCount / maxLabelRequest);
                var firstKey = Object.keys(itemFulfillmentResults);
                var labelUid_1 = itemFulfillmentResults[firstKey[0]].LabelUID || label.getDefaultLabelUID(itemFulfillmentArr_1[0]) || false;
                if (!labelUid_1) {
                    var noLabelMessage = 'No customer label is defined. Please select one in the Package Contents tab, or setup a new label in the SPS Commerce center.';
                    throw error.create({ name: 'PDF_GENERATION_ERROR', message: noLabelMessage, notifyOff: true });
                }
                if (labelXmlArr.length !== labelBatchCount_1) {
                    var incompleteBatchMessage = 'One or more of the requested labels are invalid.';
                    throw error.create({ name: 'PDF_GENERATION_ERROR', message: incompleteBatchMessage, notifyOff: true });
                }
                var labelApiToken_1 = token;
                var currentLabelCount_1;
                var labelResults_1 = [];
                labelXmlArr.forEach(function (labelXml, index) {
                    var labelReqXML = labelXml;
                    currentLabelCount_1 = index + 1;
                    var futureFileName = itemFulfillmentArr_1.length > 1
                        ? "Consolidated_Label_" + currentLabelCount_1 + "_Of_" + labelBatchCount_1
                        : label.spsBuildFileName(itemFulfillmentArr_1[0], currentLabelCount_1, labelBatchCount_1, packageId);
                    if (logDebugXmlFile) {
                        label.logXmlRecordForTesting(labelReqXML, futureFileName);
                    }
                    var labelObj;
                    try {
                        labelObj = spsapi.spsLabelApiRequest(labelReqXML, labelApiToken_1, labelUid_1, futureFileName, 'SPS NetSuite Ship Central Label File');
                    }
                    catch (labelApiError) {
                        if (packageId) {
                            log.debug('labelApiError', labelApiError);
                            ctx.response.write("\n                <h3>Unable to Create Label</h3>\n                <p>" + labelApiError.message + ".</p>\n                <p>Click your browser's Back button to return to the transaction.</p>\n            ");
                            return;
                        }
                        else {
                            itemFulfillmentArr_1.forEach(function (currIfId) {
                                // 10 point Governance per submitFields
                                record.submitFields({
                                    type: record.Type.ITEM_FULFILLMENT,
                                    id: currIfId,
                                    values: {
                                        custbody_sps_lbl_msg: labelApiError.message,
                                        custbody_sps_batched_print_com: false,
                                    },
                                    options: {
                                        enableSourcing: false,
                                        ignoreMandatoryFields: true,
                                    },
                                });
                            });
                            throw labelApiError;
                        }
                    }
                    var labelFileId = labelObj.fileId;
                    labelResults_1.push(labelFileId);
                    log.debug('Label Debug File ID', labelFileId);
                    if (packageId) {
                        // if single package request, write file to user and log for exit of script
                        log.debug('Ending Script', "Finished request for packge id " + packageId + ". Label saved to IF in File folder under communications tab.");
                        ctx.response.writeFile({ file: labelObj.labelFile });
                    }
                });
                if (packageId) {
                    return;
                }
                var successLabelMsg_1 = labelResults_1.length + " Label(s) PDF are available for print/download on the Communication -> Files sublist.";
                var suiteletResponseMsg = "Finished Creating Label(s) for " + itemFulfillmentArr_1.toString() + ". " + successLabelMsg_1 + " ";
                itemFulfillmentArr_1.forEach(function (currIfId) {
                    labelResults_1.forEach(function (fileId) {
                        // 10 point governance hit per attach
                        record.attach({
                            record: {
                                type: 'file',
                                id: fileId,
                            },
                            to: {
                                type: record.Type.ITEM_FULFILLMENT,
                                id: currIfId,
                            },
                        });
                    });
                    log.debug('Label UID: ', labelUid_1);
                    //// 10 point Governance per submitFields
                    record.submitFields({
                        type: record.Type.ITEM_FULFILLMENT,
                        id: currIfId,
                        values: {
                            custbody_sps_lbl_msg: "Finished Creating Label(s) for " + currIfId + ". " + successLabelMsg_1,
                            custbody_sps_batched_print_com: true,
                        },
                        options: {
                            enableSourcing: false,
                            ignoreMandatoryFields: true,
                        },
                    });
                });
                log.debug('Ending Script', suiteletResponseMsg);
                var responseObj = suiteletResponseMsg;
                ctx.response.write(JSON.stringify(responseObj));
            }
            else {
                throw error.create({ name: 'MISSING_REQUIRED_QUERY_PARAM', message: 'Query parameter itemFulfillmentIds not specified.' });
            }
        }
        else {
            throw error.create({ name: 'MISSING_REQUIRED_QUERY_PARAM', message: 'Query parameter itemFulfillmentIds not specified.' });
        }
    }
    return { onRequest: onRequest };
});
