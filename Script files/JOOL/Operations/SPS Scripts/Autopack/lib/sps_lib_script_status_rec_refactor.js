var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
define(["require", "exports", "N/search", "N/record", "N/log", "N/search"], function (require, exports, search, record, log, search_1) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.submitScriptStatus = exports.saveScriptStatus = exports.getScriptStatus = exports.searchScriptStatusByTitleAndTransactionId = exports.SpsScriptStatus = void 0;
    var SpsScriptStatusRecordFields = /** @class */ (function () {
        function SpsScriptStatusRecordFields() {
        }
        return SpsScriptStatusRecordFields;
    }());
    var SpsScriptStatus = /** @class */ (function (_super) {
        __extends(SpsScriptStatus, _super);
        function SpsScriptStatus() {
            return _super !== null && _super.apply(this, arguments) || this;
        }
        SpsScriptStatus.prototype.buildFromResult = function (result) {
            var _this = this;
            Object.keys(SpsScriptStatus.SpsScriptStatusFieldMap).forEach(function (key) {
                var fieldMapping = SpsScriptStatus.SpsScriptStatusFieldMap[key];
                var value = result.getValue(fieldMapping.columnId);
                if (value !== null && value != '') {
                    switch (fieldMapping.columnId) {
                        case SpsScriptStatus.SpsScriptStatusFieldMap.statusJson.columnId:
                            _this[key.toString()] = JSON.parse(value.toString());
                            break;
                        default:
                            _this[key.toString()] = value;
                    }
                }
            });
        };
        SpsScriptStatus.prototype.extractWritableValue = function (key) {
            var field = SpsScriptStatus.SpsScriptStatusFieldMap[key];
            if (field.columnId == SpsScriptStatus.SpsScriptStatusFieldMap.internalId.columnId)
                return null;
            var value = this[key.toString()];
            if (value != null && field.columnId == SpsScriptStatus.SpsScriptStatusFieldMap.statusJson.columnId) {
                return JSON.stringify(value);
            }
            return value;
        };
        SpsScriptStatus.prototype.extractSubmitFields = function () {
            var _this = this;
            var returnObj = {};
            Object.keys(SpsScriptStatus.SpsScriptStatusFieldMap).forEach(function (key) {
                var field = SpsScriptStatus.SpsScriptStatusFieldMap[key];
                var thisValue = _this.extractWritableValue(key);
                if (thisValue != null)
                    returnObj[field.columnId] = thisValue;
            });
            return returnObj;
        };
        SpsScriptStatus.prototype.extractRecord = function () {
            var _this = this;
            var returnRecord = record.create({ type: SpsScriptStatus.customRecordTypeId });
            Object.keys(SpsScriptStatus.SpsScriptStatusFieldMap).forEach(function (key) {
                var field = SpsScriptStatus.SpsScriptStatusFieldMap[key];
                var thisValue = _this.extractWritableValue(key);
                if (thisValue != null) {
                    returnRecord.setValue({ fieldId: field.columnId, value: thisValue });
                }
            });
            return returnRecord;
        };
        SpsScriptStatus.extractSearchColumns = function () {
            var columns = [];
            Object.keys(SpsScriptStatus.SpsScriptStatusFieldMap).forEach(function (key) {
                var field = SpsScriptStatus.SpsScriptStatusFieldMap[key];
                columns.push({
                    name: field.columnId,
                    label: field.label,
                });
            });
            return columns;
        };
        SpsScriptStatus.customRecordTypeId = 'customrecord_sps_script_status';
        SpsScriptStatus.SpsScriptStatusFieldMap = {
            internalId: { columnId: 'internalId', label: 'Internal Id' },
            title: { columnId: 'custrecord_sps_script_title', label: 'SPS Script Title' },
            status: { columnId: 'custrecord_sps_script_status', label: 'SPS Script Status' },
            scriptExecutionType: { columnId: 'custrecord_sps_script_type', label: 'SPS Script Type' },
            statusMessage: { columnId: 'custrecord_sps_script_status_message', label: 'SPS Status Message' },
            transactionId: { columnId: 'custrecord_sps_transaction', label: 'Transaction' },
            statusJson: { columnId: 'custrecord_sps_script_status_json', label: 'SPS Status JSON' },
            processingId: { columnId: 'custrecord_sps_processing_id', label: 'SPS Processing Id' },
            successMsgCheck: { columnId: 'custrecord_sps_success_message', label: 'SPS Success Message Flag' },
            partialPackFlag: { columnId: 'custrecord_sps_script_status_pp_check', label: 'SPS Partial Pack Flag' },
        };
        return SpsScriptStatus;
    }(SpsScriptStatusRecordFields));
    exports.SpsScriptStatus = SpsScriptStatus;
    /***
     * Finds and optionally initializes a Script Status record by script title and transaction id.
     * @param title If null, function will return null
     * @param transactionId If null, function will return null
     * @param initializeIfNotFound If true, script status object will be created and record.Save will be called with passed in title and ifId params.
     */
    function searchScriptStatusByTitleAndTransactionId(title, transactionId, initializeIfNotFound) {
        if (initializeIfNotFound === void 0) { initializeIfNotFound = false; }
        if (!title || !transactionId)
            return null;
        var scriptStatusSearch = search.create({
            type: SpsScriptStatus.customRecordTypeId,
            filters: [
                ['isinactive', 'is', 'F'],
                'AND',
                [SpsScriptStatus.SpsScriptStatusFieldMap.transactionId.columnId, 'anyof', transactionId],
                'AND',
                [SpsScriptStatus.SpsScriptStatusFieldMap.title.columnId, 'is', title],
            ],
            columns: [
                search.createColumn({
                    name: 'created',
                    sort: search.Sort.DESC,
                    label: 'Date Created',
                }),
            ].concat(SpsScriptStatus.extractSearchColumns()),
        });
        var returnStatusRecord = new SpsScriptStatus();
        var searchResult = scriptStatusSearch.runPaged();
        if (searchResult.count > 0) {
            scriptStatusSearch.run().each(function (result) {
                try {
                    returnStatusRecord.buildFromResult(result);
                }
                catch (e) {
                    log.error('DN: buildFromResult error', e);
                }
                return true;
            });
        }
        else if (initializeIfNotFound) {
            // if no record exists, then create a new one
            returnStatusRecord.transactionId = transactionId;
            returnStatusRecord.title = title;
            returnStatusRecord.internalId = saveScriptStatus(returnStatusRecord);
        }
        log.debug('SPS Script Status Rec', JSON.stringify(returnStatusRecord));
        //If the record wasn't found or wasn't initialized properly, we should return null. Returning initialized blank object would be bad.
        return returnStatusRecord.internalId ? returnStatusRecord : null;
    }
    exports.searchScriptStatusByTitleAndTransactionId = searchScriptStatusByTitleAndTransactionId;
    function getScriptStatus(internalId) {
        var scriptStatusSearch = search.create({
            type: SpsScriptStatus.customRecordTypeId,
            filters: [
                search.createFilter({
                    name: 'internalid',
                    operator: search_1.Operator.IS,
                    values: internalId,
                }),
            ],
            columns: [
                search.createColumn({
                    name: 'created',
                    sort: search.Sort.DESC,
                    label: 'Date Created',
                }),
            ].concat(SpsScriptStatus.extractSearchColumns()),
        });
        var result = scriptStatusSearch
            .run()
            .getRange({ start: 0, end: 1 })
            .pop();
        if (!result)
            return null;
        var returnStatusRecord = new SpsScriptStatus();
        returnStatusRecord.buildFromResult(result);
        return returnStatusRecord;
    }
    exports.getScriptStatus = getScriptStatus;
    /***
     * Saves and returns the internalId of the saved script status record or null
     * @param scriptStatus
     */
    function saveScriptStatus(scriptStatus) {
        //When using record.save, the partialPackFlag and successMsgCheck is required.
        if (scriptStatus.partialPackFlag == null) {
            scriptStatus.partialPackFlag = false;
        }
        if (scriptStatus.successMsgCheck == null) {
            scriptStatus.successMsgCheck = false;
        }
        var scriptStatusRecord = scriptStatus.extractRecord();
        scriptStatus.internalId = scriptStatusRecord.save().toString();
        return scriptStatus.internalId ? scriptStatus.internalId : null;
    }
    exports.saveScriptStatus = saveScriptStatus;
    /***
     * Submits the Script Status record using record.submitFields.
     * Any fields on the passed in object that are null won't be updated. Blank strings "" or '' will overwrite their respective fields.
     * @param statusRecordObj
     */
    function submitScriptStatus(statusRecordObj) {
        // use this function to update the Status Record
        var extractedValues = statusRecordObj.extractSubmitFields();
        record.submitFields({
            type: SpsScriptStatus.customRecordTypeId,
            id: statusRecordObj.internalId,
            values: extractedValues,
        });
    }
    exports.submitScriptStatus = submitScriptStatus;
});
//#endregion "Refactor"
