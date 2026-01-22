/**
 *@NApiVersion 2.0
 *@NModuleScope SameAccount
 *@NScriptType MapReduceScript
 */
define(["require", "exports", "N/error", "N/log", "N/config", "N/search", "N/record", "N/runtime", "./lib/sps_lib_packdata", "./lib/sps_lib_create_if_obj", "./lib/sps_lib_label", "./lib/sps_lib_label_api", "./lib/sps_lib_label_removal"], function (require, exports, error, log, config, search, record, runtime, packdata, createIfObj, label, spsapi, removeLabel) {
    function getInputData(inputContext) {
        var parametersString = runtime.getCurrentScript().getParameter({ name: 'custscript_sps_mr_batch_label_json' });
        log.debug('Script Begin', "Parameters Passed: " + parametersString);
        var parametersObj = JSON.parse(parametersString);
        var itemFulfillmentStr = parametersObj.itemFulfillmentArr;
        var maxLabelRequest = parametersObj.maxLabelRequest, packageSource = parametersObj.packageSource, packStructure = parametersObj.packStructure;
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
        var token = compLabelSettings.custrecord_sps_label_login_token;
        var packageObj = packdata.getArray(itemFulfillmentStr, undefined, packageSource, packStructure);
        var labelCount = packageObj.length;
        var itemFulfillmentObj = createIfObj.getIfObj(itemFulfillmentStr, labelSearchId, packageSource);
        var itemFulfillmentResults = itemFulfillmentObj.ifResults;
        log.debug('ifObj', JSON.stringify(itemFulfillmentResults));
        log.debug('PackageObj', JSON.stringify(packageObj));
        removeLabel.findRemoveExistingLabels(itemFulfillmentStr);
        var results = label.getLabelResultObj(itemFulfillmentStr, itemFulfillmentResults, packageObj, compLabelSettings, maxLabelRequest);
        var labelXmlArr = results.labelArr;
        var labelBatchCount = Math.ceil(labelCount / maxLabelRequest);
        var firstKey = Object.keys(itemFulfillmentResults);
        var labelUid = itemFulfillmentResults[firstKey[0]].LabelUID || label.getDefaultLabelUID(itemFulfillmentStr[0]) || '';
        var labelApiToken = token;
        var currIfId = itemFulfillmentStr[0];
        var resultObj = {};
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
        var _a = reduceContext.key.split('*'), currIfId = _a[0], currentLabelCount = _a[1], labelBatchCount = _a[2], labelApiToken = _a[3], labelUid = _a[4];
        var futureFileName = label.spsBuildFileName(currIfId, currentLabelCount, labelBatchCount);
        if (logLabelDebugXmlFile) {
            label.logXmlRecordForTesting(labelReqXML, futureFileName);
        }
        var labelObj;
        try {
            labelObj = spsapi.spsLabelApiRequest(labelReqXML, labelApiToken, labelUid, futureFileName);
            var labelFileId = labelObj.fileId;
            record.attach({
                record: {
                    type: 'file',
                    id: labelFileId,
                },
                to: {
                    type: record.Type.ITEM_FULFILLMENT,
                    id: currIfId,
                },
            });
            log.debug('SPS Label File ID', labelFileId);
        }
        catch (labelApiError) {
            reduceResponseObj.errMessage = labelApiError.message;
            reduceResponseObj.status = 'failure';
            log.error('labelApiError', labelApiError);
        }
        reduceContext.write("" + currIfId, JSON.stringify(reduceResponseObj));
    }
    function summarize(summaryContext) {
        // const finalMessage = `Finished Creating Label(s) for ${currIfId}. ${currentLabelCount} Labels were generated`;
        var currentIfId;
        var numberOfErrors = 0;
        var didErrorHappen;
        var errorMessage;
        summaryContext.output.iterator().each(function (key, value) {
            currentIfId = key;
            var parseValue = JSON.parse(value);
            didErrorHappen = parseValue.status;
            if (didErrorHappen === 'failure') {
                errorMessage = parseValue.errMessage;
                numberOfErrors += 1;
            }
            return true;
        });
        if (numberOfErrors < 1) {
            record.submitFields({
                type: record.Type.ITEM_FULFILLMENT,
                id: currentIfId,
                values: {
                    custbody_sps_lbl_msg: 'Finished Creating Labels. Label(s) PDF are available for print/download on the Communication -> Files sublist.',
                    custbody_sps_batched_print_com: true,
                },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields: true,
                },
            });
        }
        else {
            record.submitFields({
                type: record.Type.ITEM_FULFILLMENT,
                id: currentIfId,
                values: {
                    custbody_sps_lbl_msg: " " + numberOfErrors + " Batch Label requests FAILED. Please correct the following: " + errorMessage,
                    custbody_sps_batched_print_com: false,
                },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields: true,
                },
            });
        }
        log.debug('Script End', summaryContext.usage);
    }
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize,
    };
});
