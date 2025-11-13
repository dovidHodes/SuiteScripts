/**
 *@NApiVersion 2.0
 *@NModuleScope SameAccount
 *@NScriptType MapReduceScript
 */
define(["require", "exports", "N/error", "N/log", "N/config", "N/search", "N/record", "N/runtime", "./lib/sps_lib_packdata", "./lib/sps_lib_create_if_obj", "./lib/sps_lib_label", "./lib/sps_lib_label_api", "./lib/sps_lib_label_removal", "./lib/sps_lib_packdata_interfaces"], function (require, exports, error, log, config, search, record, runtime, packdata, createIfObj, label, spsapi, removeLabel, sps_lib_packdata_interfaces_1) {
    function getInputData(inputContext) {
        var parametersString = runtime.getCurrentScript().getParameter({ name: 'custscript_sps_mr_bulk_label_json' });
        log.debug('Script Begin', "Parameters Passed: " + parametersString);
        var parametersObj = JSON.parse(parametersString);
        var itemFulfillmentArr = parametersObj.itemFulfillmentArr;
        var packStructure = parametersObj.packStructure, wmsShipmentRec = parametersObj.wmsShipmentRec;
        var packageSource = '4'; // hard coding this for now as this is only for NetSuite Ship Central for now
        var maxLabelRequest = parametersObj.maxLabelRequest || 75;
        var companyConfigRecord = config.load({ type: config.Type.COMPANY_PREFERENCES });
        var labelSearchId = companyConfigRecord.getValue({ fieldId: 'custscript_sps_label_api_search' });
        var compLabelSettings = search.lookupFields({
            type: 'customrecord_sps_label_access',
            id: 1,
            columns: ['custrecord_sps_label_login_token', 'custrecord_uccuid', 'custrecord_sps_label_login_mfgid'],
        });
        if (!compLabelSettings) {
            throw error.create({
                name: 'MISSING_REQUIRED_PARAM',
                message: 'Missing Company Label Setup Record. Contact SPS Support',
            });
        }
        var labelApiToken = compLabelSettings.custrecord_sps_label_login_token;
        var resultObj = {};
        if (!Array.isArray(itemFulfillmentArr))
            return resultObj;
        var packageObj = packdata.getArray(itemFulfillmentArr, undefined, packageSource, packStructure);
        var labelCount = packageObj.length;
        var itemFulfillmentObj = createIfObj.getIfObj(itemFulfillmentArr, labelSearchId, packageSource, wmsShipmentRec);
        var itemFulfillmentResults = itemFulfillmentObj.ifResults;
        log.debug('ifObj', JSON.stringify(itemFulfillmentResults));
        log.debug('PackageObj', JSON.stringify(packageObj));
        var results = label.getLabelResultObj(itemFulfillmentArr, itemFulfillmentResults, packageObj, compLabelSettings, maxLabelRequest, sps_lib_packdata_interfaces_1.PackageSourceString.NetsuiteShipCentral);
        var labelXmlArr = results.labelArr;
        var labelBatchCount = Math.ceil(labelCount / maxLabelRequest);
        var firstKey = Object.keys(itemFulfillmentResults);
        var labelUid = itemFulfillmentResults[firstKey[0]].LabelUID || '';
        itemFulfillmentArr.forEach(function (itemFulfillmentStr) {
            var arrIfRec = [itemFulfillmentStr];
            removeLabel.findRemoveExistingLabels(arrIfRec);
            labelUid = labelUid ? labelUid : label.getDefaultLabelUID(itemFulfillmentStr);
        });
        var currIfId = itemFulfillmentArr.toString();
        labelXmlArr.forEach(function (labelXml, index) {
            var currentKey = currIfId + "*" + (index + 1) + "*" + labelBatchCount + "*" + labelApiToken + "*" + labelUid;
            resultObj[currentKey] = labelXml;
        });
        return resultObj;
    }
    function map(mapContext) {
        mapContext.write(mapContext.key, mapContext.value);
    }
    function reduce(reduceContext) {
        var logLabelDebugXmlFile = true;
        var labelReqXMLStr = reduceContext.values[0];
        var labelReqXML = JSON.parse(labelReqXMLStr);
        var reduceResponseObj = {
            status: 'success',
            errMessage: '',
        };
        var _a = reduceContext.key.split('*'), ifIdArr = _a[0], currentLabelCount = _a[1], labelBatchCount = _a[2], labelApiToken = _a[3], labelUid = _a[4];
        var futureFileName = ifIdArr.split(',').length > 1
            ? "Consolidated_Label_" + currentLabelCount + "_Of_" + labelBatchCount
            : label.spsBuildFileName(ifIdArr, currentLabelCount, labelBatchCount);
        if (logLabelDebugXmlFile) {
            label.logXmlRecordForTesting(labelReqXML, futureFileName);
        }
        var labelObj;
        try {
            labelObj = spsapi.spsLabelApiRequest(labelReqXML, labelApiToken, labelUid, futureFileName, 'SPS NetSuite Ship Central Label File');
        }
        catch (labelApiError) {
            reduceResponseObj.errMessage = labelApiError.message;
            reduceResponseObj.status = 'failure';
            log.error('Sps Label API Request Failed', labelApiError);
        }
        if (reduceResponseObj.status === 'success') {
            var labelFileId_1 = labelObj.fileId;
            ifIdArr.split(',').forEach(function (currIfId) {
                try {
                    record.attach({
                        record: {
                            type: 'file',
                            id: labelFileId_1,
                        },
                        to: {
                            type: record.Type.ITEM_FULFILLMENT,
                            id: currIfId,
                        },
                    });
                    log.debug("SPS Label File Attached", "Rec IF Id: " + currIfId + " with File Id: " + labelFileId_1);
                }
                catch (attachErr) {
                    reduceResponseObj.errMessage = attachErr.message;
                    reduceResponseObj.status = 'failure';
                    log.error('Error Attaching SPS Label File', attachErr);
                }
            });
        }
        reduceContext.write(ifIdArr + "^" + currentLabelCount, JSON.stringify(reduceResponseObj));
    }
    function summarize(summaryContext) {
        // const finalMessage = `Finished Creating Label(s) for ${currIfId}. ${currentLabelCount} Labels were generated`;
        var ifIdArr;
        var numberOfErrors = 0;
        var errorMessage;
        var itemFulfillmentErrorLib = {};
        summaryContext.output.iterator().each(function (key, value) {
            var keyVals = key.split('^');
            ifIdArr = keyVals[0];
            var parseValue = JSON.parse(value);
            log.debug('Summary Iterator Value', "For If Recs: " + ifIdArr + " value was " + value);
            if (parseValue.status === 'failure') {
                errorMessage = parseValue.errMessage;
                numberOfErrors += 1;
            }
            itemFulfillmentErrorLib[ifIdArr] = { numberOfErrors: numberOfErrors, errorMessage: errorMessage };
            return true;
        });
        log.debug('Summary Results Object', JSON.stringify(itemFulfillmentErrorLib));
        var success = itemFulfillmentErrorLib[ifIdArr].numberOfErrors < 1;
        var message = success
            ? 'Finished Creating Labels. Label(s) PDF are available for print/download on the Communication -> Files sublist.'
            : itemFulfillmentErrorLib[ifIdArr].numberOfErrors + " Batch Label requests FAILED. Please correct the following: " + itemFulfillmentErrorLib[ifIdArr].errorMessage;
        ifIdArr.split(',').forEach(function (ifId) {
            record.submitFields({
                type: record.Type.ITEM_FULFILLMENT,
                id: ifId,
                values: {
                    custbody_sps_lbl_msg: message,
                    custbody_sps_batched_print_com: false,
                },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields: true,
                },
            });
        });
        log.debug('Script End', summaryContext.usage);
    }
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize,
    };
});
