define(["require", "exports", "N/search", "N/record", "N/log"], function (require, exports, search, record, log) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.createScriptStatus = exports.findScriptStatusRecord = exports.getTransactionScriptStatusForBulkProcessing = exports.createOrUpdateTransactionBulkScriptRecord = exports.createOrUpdateBulkScriptRecord = exports.updateAutoPackStatusRecord = exports.getAutopackScriptStatus = exports.createScriptStatusClass = exports.scriptStatusRecordFieldMapping = exports.scriptStatusStatus = exports.scriptTitle = exports.scriptExecutionType = void 0;
    var scriptExecutionType;
    (function (scriptExecutionType) {
        scriptExecutionType["Suitelet"] = "Suitelet";
        scriptExecutionType["Schedule"] = "Schedule";
        scriptExecutionType["MapReduce"] = "Map Reduce";
        scriptExecutionType["spsApi"] = "SPS API";
        scriptExecutionType["Automation"] = "Automation";
    })(scriptExecutionType = exports.scriptExecutionType || (exports.scriptExecutionType = {}));
    var scriptTitle;
    (function (scriptTitle) {
        scriptTitle["PackingSlip"] = "SPS Packing Slip";
        scriptTitle["ASN"] = "ASN";
        scriptTitle["ShippingLabel"] = "Shipping Label";
        scriptTitle["SPSPacking"] = "SPS Auto Pack";
        scriptTitle["Bulk"] = "SPS Bulk EDI";
        scriptTitle["PoAckBulk"] = "Bulk SPS PO Ack";
        scriptTitle["AsnBulk"] = "Bulk ASN";
        scriptTitle["IntegrationStatusBulk"] = "Bulk Integration Status";
    })(scriptTitle = exports.scriptTitle || (exports.scriptTitle = {}));
    var scriptStatusStatus;
    (function (scriptStatusStatus) {
        scriptStatusStatus["InProgress"] = "In Progress";
        scriptStatusStatus["Scheduled"] = "Scheduled";
        scriptStatusStatus["Complete"] = "Completed";
        scriptStatusStatus["Error"] = "Error";
    })(scriptStatusStatus = exports.scriptStatusStatus || (exports.scriptStatusStatus = {}));
    exports.scriptStatusRecordFieldMapping = {
        customRecordId: 'customrecord_sps_script_status',
        partialPackFlag: 'custrecord_sps_script_status_pp_check',
        status: 'custrecord_sps_script_status',
        statusJson: 'custrecord_sps_script_status_json',
        statusMessage: 'custrecord_sps_script_status_message',
        scriptExecutionType: 'custrecord_sps_script_type',
        transactionId: 'custrecord_sps_transaction',
        title: 'custrecord_sps_script_title',
        processingId: 'custrecord_sps_processing_id',
        successMsgCheck: 'custrecord_sps_success_message',
    };
    function createScriptStatusClass() {
        var scritpStatusObj = {};
        return scritpStatusObj;
    }
    exports.createScriptStatusClass = createScriptStatusClass;
    /** function for Auto Pack that will return an object defined.
     * It accepts an object defined in the spsStatusRecord interface
     *
     * @param statusRecordType string must be a value from the Script Title Enum
     * @param ifId string item fulfillment record id you want status record for
     * @param newRecordCreated boolean defaults to true without anything passed
     * */
    function getAutopackScriptStatus(statusRecordType, ifId, newRecordCreated) {
        if (newRecordCreated === void 0) { newRecordCreated = true; }
        // first check if status record exists:
        var statusRecordObj = { title: scriptTitle.SPSPacking, transactionId: ifId, partialPackFlag: false };
        var customrecord_sps_script_statusSearchObj = search.create({
            type: exports.scriptStatusRecordFieldMapping.customRecordId,
            filters: [
                [exports.scriptStatusRecordFieldMapping.transactionId, 'anyof', statusRecordObj.transactionId],
                'AND',
                [exports.scriptStatusRecordFieldMapping.title, 'is', statusRecordObj.title],
            ],
            columns: [
                search.createColumn({ name: 'internalid', label: 'Internal ID' }),
                search.createColumn({ name: exports.scriptStatusRecordFieldMapping.title, label: 'SPS Script Title' }),
                search.createColumn({ name: exports.scriptStatusRecordFieldMapping.status, label: 'SPS Script Status' }),
                search.createColumn({ name: exports.scriptStatusRecordFieldMapping.scriptExecutionType, label: 'SPS Script Type' }),
                search.createColumn({ name: exports.scriptStatusRecordFieldMapping.partialPackFlag, label: 'Partial Pack Flag' }),
            ],
        });
        var searchResultCount = customrecord_sps_script_statusSearchObj.runPaged().count;
        if (searchResultCount > 0) {
            // code goes here
            // @ts-ignore
            customrecord_sps_script_statusSearchObj.run().each(function (result) {
                // only 1 result we ever want so run each is great
                statusRecordObj.recordId = result.getValue({ name: 'internalid', label: 'Internal ID' }).toString();
                if (newRecordCreated === false) {
                    statusRecordObj.partialPackFlag = result.getValue({
                        name: exports.scriptStatusRecordFieldMapping.partialPackFlag,
                        label: 'Partial Pack Flag',
                    });
                }
                var currStatus = result.getValue({
                    name: exports.scriptStatusRecordFieldMapping.status,
                    label: 'SPS Script Status',
                });
                if (currStatus === scriptStatusStatus.InProgress) {
                    statusRecordObj.status = scriptStatusStatus.InProgress;
                }
                else if (currStatus === scriptStatusStatus.Scheduled) {
                    statusRecordObj.status = scriptStatusStatus.Scheduled;
                }
                else if (currStatus === scriptStatusStatus.Complete) {
                    statusRecordObj.status = scriptStatusStatus.Complete;
                }
                else if (currStatus === scriptStatusStatus.Error) {
                    statusRecordObj.status = scriptStatusStatus.Error;
                }
                return statusRecordObj;
            });
        }
        else if (newRecordCreated === true) {
            // if no record exists, then create a new one
            var statusRec = record.create({
                type: exports.scriptStatusRecordFieldMapping.customRecordId,
            });
            statusRec.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.status, value: scriptStatusStatus.InProgress });
            statusRec.setValue({
                fieldId: exports.scriptStatusRecordFieldMapping.scriptExecutionType,
                value: scriptExecutionType.Suitelet,
            });
            statusRec.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.title, value: scriptTitle.SPSPacking });
            statusRec.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.transactionId, value: ifId });
            statusRecordObj.recordId = statusRec.save().toString();
        }
        log.debug('SPS Script Status Rec', JSON.stringify(statusRecordObj));
        return statusRecordObj;
    }
    exports.getAutopackScriptStatus = getAutopackScriptStatus;
    /** function for AutoPack to update the status record as needed .
     * It accepts an object defined in the spsStatusRecord interface
     * */
    function updateAutoPackStatusRecord(statusRecordObj) {
        // use this function to update the Status Record
        var recordId = statusRecordObj.recordId, title = statusRecordObj.title, status = statusRecordObj.status, statusMessage = statusRecordObj.statusMessage, scriptExecutionType = statusRecordObj.scriptExecutionType, transactionId = statusRecordObj.transactionId, statusJson = statusRecordObj.statusJson, partialPackFlag = statusRecordObj.partialPackFlag;
        if (status || statusMessage || scriptExecutionType) {
            var values = {};
            if (status) {
                values[exports.scriptStatusRecordFieldMapping.status] = status;
            }
            if (statusMessage) {
                values[exports.scriptStatusRecordFieldMapping.statusMessage] = statusMessage;
            }
            if (scriptExecutionType) {
                values[exports.scriptStatusRecordFieldMapping.scriptExecutionType] = scriptExecutionType;
            }
            if (partialPackFlag === true || partialPackFlag === false) {
                values[exports.scriptStatusRecordFieldMapping.partialPackFlag] = partialPackFlag;
            }
            if (statusJson) {
                values[exports.scriptStatusRecordFieldMapping.statusJson] = JSON.stringify(statusJson);
            }
            else {
                // If there is no Status JSON, likely want to empty it
                values[exports.scriptStatusRecordFieldMapping.statusJson] = '';
            }
            log.debug('Updating Script Status Record Fields', JSON.stringify(values));
            record.submitFields({ type: exports.scriptStatusRecordFieldMapping.customRecordId, id: recordId, values: values });
        }
    }
    exports.updateAutoPackStatusRecord = updateAutoPackStatusRecord;
    /** function to create OR update the script status record for SPS Bulk execution.
     * If Creating -- Ensure you pass the statusJson key and the object passed with it must match the interface bulkExecutionJson
     * If Updating -- pass along keys of status and statusMessage
     * */
    function createOrUpdateBulkScriptRecord(statusRecordObj) {
        var recordId = statusRecordObj.recordId, status = statusRecordObj.status, statusMessage = statusRecordObj.statusMessage;
        if (!recordId) {
            //if there is no record ID, then create a new one
            var statusJson = statusRecordObj.statusJson;
            if (statusJson.transactionArr) {
                var statusRec = record.create({
                    type: exports.scriptStatusRecordFieldMapping.customRecordId,
                });
                statusRec.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.status, value: scriptStatusStatus.Scheduled });
                statusRec.setValue({
                    fieldId: exports.scriptStatusRecordFieldMapping.scriptExecutionType,
                    value: scriptExecutionType.MapReduce,
                });
                statusRec.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.title, value: scriptTitle.Bulk });
                statusRec.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.statusJson, value: JSON.stringify(statusJson) });
                statusRecordObj.recordId = statusRec.save().toString();
            }
        }
        else {
            //if there is a record ID, update it with the new status
            var values = {};
            values[exports.scriptStatusRecordFieldMapping.status] = status;
            values[exports.scriptStatusRecordFieldMapping.statusMessage] = statusMessage;
            record.submitFields({ type: exports.scriptStatusRecordFieldMapping.customRecordId, id: recordId, values: values });
        }
        return statusRecordObj;
    }
    exports.createOrUpdateBulkScriptRecord = createOrUpdateBulkScriptRecord;
    /** function to create OR update the script status record for SPS PO Ack, ASN or Integration Status creation in Bulk Map Reduce context.
     * If Creating -- Ensure you pass the Title in the object as we need to know what Script this is for
     * If Updating -- pass along keys of status and statusMessage
     * */
    function createOrUpdateTransactionBulkScriptRecord(statusRecordObj) {
        var fieldsToUpdate = Object.keys(statusRecordObj);
        if (!statusRecordObj.recordId) {
            // if there is no record, create the initial one
            var statusRec_1 = record.create({
                type: exports.scriptStatusRecordFieldMapping.customRecordId,
            });
            fieldsToUpdate.forEach(function (fieldKey) {
                var fieldId = exports.scriptStatusRecordFieldMapping[fieldKey];
                var value = statusRecordObj[fieldKey];
                if (fieldKey === 'scriptExecutionType' || fieldKey === 'status') {
                    // no action if script execution type  or status since default is In Progress in Map Reduce
                }
                else if (fieldKey === 'statusJson') {
                    statusRec_1.setValue({ fieldId: fieldId, value: JSON.stringify(value) });
                }
                else {
                    statusRec_1.setValue({ fieldId: fieldId, value: value });
                }
            });
            statusRec_1.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.status, value: scriptStatusStatus.InProgress });
            statusRec_1.setValue({
                fieldId: exports.scriptStatusRecordFieldMapping.scriptExecutionType,
                value: scriptExecutionType.MapReduce,
            });
            statusRecordObj.recordId = statusRec_1.save().toString();
        }
        else {
            // if there is a record then
            var values_1 = {};
            fieldsToUpdate.forEach(function (fieldKey) {
                var fieldId = exports.scriptStatusRecordFieldMapping[fieldKey];
                var value = statusRecordObj[fieldKey];
                if (fieldKey === 'recordId') {
                    // this is not a valid field to update, so we ignore it
                }
                else if (fieldKey === 'statusJson') {
                    values_1[fieldId] = JSON.stringify(value);
                }
                else {
                    values_1[fieldId] = value;
                }
            });
            record.submitFields({ type: exports.scriptStatusRecordFieldMapping.customRecordId, id: statusRecordObj.recordId, values: values_1 });
        }
        return statusRecordObj;
    }
    exports.createOrUpdateTransactionBulkScriptRecord = createOrUpdateTransactionBulkScriptRecord;
    function getTransactionScriptStatusForBulkProcessing(_a) {
        var ifId = _a.ifId, scriptTitle = _a.scriptTitle;
        var customrecord_sps_script_statusSearchObj = search.create({
            type: 'customrecord_sps_script_status',
            filters: [['isinactive', 'is', 'F'], 'AND', ['custrecord_sps_transaction', 'anyof', ifId], 'AND', ['custrecord_sps_script_title', 'contains', scriptTitle]],
            columns: [
                search.createColumn({
                    name: 'created',
                    sort: search.Sort.DESC,
                    label: 'Date Created',
                }),
                search.createColumn({ name: 'custrecord_sps_script_status', label: 'SPS Script Status' }),
                search.createColumn({ name: 'custrecord_sps_script_status_message', label: 'SPS Script Status Message' }),
                search.createColumn({ name: 'custrecord_sps_success_message', label: 'Success Message Displayed' }),
                search.createColumn({ name: 'internalid' }),
            ],
        });
        var scriptStatusSearchObj;
        var resultSet = customrecord_sps_script_statusSearchObj.run();
        var lastScriptStatus = resultSet.getRange({ start: 0, end: 1 }).pop();
        if (lastScriptStatus) {
            scriptStatusSearchObj = {};
            scriptStatusSearchObj.status = lastScriptStatus.getValue({ name: 'custrecord_sps_script_status' });
            scriptStatusSearchObj.statusMessage = lastScriptStatus.getValue({ name: 'custrecord_sps_script_status_message' });
            scriptStatusSearchObj.successMsgCheck = lastScriptStatus.getValue({ name: 'custrecord_sps_success_message' });
            scriptStatusSearchObj.recordId = lastScriptStatus.getValue({ name: 'internalid' });
        }
        log.debug('Script status object created from search:', JSON.stringify(scriptStatusSearchObj));
        return scriptStatusSearchObj;
    }
    exports.getTransactionScriptStatusForBulkProcessing = getTransactionScriptStatusForBulkProcessing;
    function findScriptStatusRecord(_a) {
        var ifId = _a.ifId, scriptTitle = _a.scriptTitle;
        var customrecord_sps_script_statusSearchObj = search.create({
            type: 'customrecord_sps_script_status',
            filters: [['custrecord_sps_transaction', 'anyof', ifId], 'AND', ['custrecord_sps_script_title', 'contains', scriptTitle]],
            columns: [
                search.createColumn({
                    name: 'created',
                    sort: search.Sort.DESC,
                    label: 'Date Created',
                }),
                search.createColumn({ name: 'custrecord_sps_script_status', label: 'SPS Script Status' }),
                search.createColumn({ name: 'custrecord_sps_script_status_message', label: 'SPS Script Status Message' }),
                search.createColumn({ name: 'custrecord_sps_success_message', label: 'Success Message Displayed' }),
                search.createColumn({ name: 'internalid' }),
            ],
        });
        var searchResultCount = customrecord_sps_script_statusSearchObj.runPaged().count;
        if (searchResultCount > 0) {
            var scriptStatusSearchObj = {};
            var resultSet = customrecord_sps_script_statusSearchObj.run();
            var lastScriptStatus = resultSet.getRange({ start: 0, end: 1 });
            scriptStatusSearchObj.status = lastScriptStatus[0].getValue({ name: 'custrecord_sps_script_status' });
            scriptStatusSearchObj.statusMessage = lastScriptStatus[0].getValue({ name: 'custrecord_sps_script_status_message' });
            scriptStatusSearchObj.successMsgCheck = lastScriptStatus[0].getValue({ name: 'custrecord_sps_success_message' });
            scriptStatusSearchObj.recordId = lastScriptStatus[0].getValue({ name: 'internalid' });
            log.debug('Script status object created from search:', JSON.stringify(scriptStatusSearchObj));
            return scriptStatusSearchObj;
        }
        else {
            return null;
        }
    }
    exports.findScriptStatusRecord = findScriptStatusRecord;
    function createScriptStatus(obj) {
        var scriptStatus = record.create({ type: 'customrecord_sps_script_status' });
        scriptStatus.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.transactionId, value: obj.transactionId });
        scriptStatus.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.status, value: obj.status });
        scriptStatus.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.title, value: obj.title });
        scriptStatus.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.statusMessage, value: obj.statusMessage });
        scriptStatus.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.scriptExecutionType, value: obj.scriptExecutionType });
        if (obj.successMsgCheck) {
            scriptStatus.setValue({ fieldId: exports.scriptStatusRecordFieldMapping.successMsgCheck, value: obj.successMsgCheck });
        }
        return scriptStatus.save();
    }
    exports.createScriptStatus = createScriptStatus;
});
