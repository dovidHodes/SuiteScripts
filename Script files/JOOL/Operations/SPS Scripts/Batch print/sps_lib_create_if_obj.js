define(["require", "exports", "N/error", "N/search", "N/search", "N/log", "./sps_lib_packdata", "./sps_lib_packdata_pacejet", "N/config", "./sps_lib_packdata_shipcentral_search"], function (require, exports, error, search, search_1, log, packdata, paceJet, config, sps_lib_packdata_shipcentral_search_1) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getIfObj = void 0;
    var PackageSourceString;
    (function (PackageSourceString) {
        PackageSourceString["SPS"] = "SPS";
        PackageSourceString["NetsuiteWms"] = "NSWMS";
        PackageSourceString["PacejetWms"] = "PJWMS";
    })(PackageSourceString || (PackageSourceString = {}));
    function getIfObj(itemFulfillmentIds, searchId, packageSource, wmsIntegrationShipmentRecId) {
        if (typeof itemFulfillmentIds !== 'object' || !Array.isArray(itemFulfillmentIds) || itemFulfillmentIds.length === 0 || !searchId) {
            var myError = error.create({ name: 'MISSING_REQUIRED_QUERY_PARAM', message: 'Query parameter itemFulfillmentId not specified.' });
            throw myError;
        }
        var itemFulfillmentColumn = search.createColumn({ name: 'internalid', label: 'spsItemFulfilId' });
        var itemLineColumn = search.createColumn({ name: 'line', label: 'itemLineId' });
        var ifsearchId = searchId;
        var overrideColumnObj = {};
        var companyConfigRecord = config.load({ type: config.Type.COMPANY_PREFERENCES });
        var custAsnSearchFiltersEnabled = companyConfigRecord.getValue({ fieldId: 'custscript_sps_asn_filter_override' });
        var scriptingColumns = [itemFulfillmentColumn, itemLineColumn];
        var asnFilters = [
            ['type', 'anyof', 'ItemShip'],
            'AND',
            ['item.type', 'anyof', 'Assembly', 'InvtPart', 'Group', 'Kit', 'NonInvtPart'],
            'AND',
            ['formulatext: {account}', 'isempty', ''],
            'AND',
            ['internalid', 'anyof'].concat(itemFulfillmentIds),
        ];
        var loadedItemFulfillmentSearch = search.load({
            id: "" + ifsearchId,
        });
        var spsPackageDataSource = packdata.getPackageSourceString(packageSource) || packdata.getDefaultPackageSourceStr();
        var pacejetOverrideColumns = {
            BillOfLadingNumber: { name: 'custrecord_pacejet_asd_mastertrack', join: 'CUSTRECORD_PACEJET_ASD_TRANSACTION', label: 'BillOfLadingNumber' },
            CarrierProNumber: { name: 'custrecord_pacejet_asd_probill', join: 'CUSTRECORD_PACEJET_ASD_TRANSACTION', label: 'CarrierProNumber' },
            CarrierRouting: { name: 'custrecord_pacejet_asd_carrier', join: 'CUSTRECORD_PACEJET_ASD_TRANSACTION', label: 'CarrierRouting' },
            CarrierAlphaCode: { name: 'custrecord_pacejet_asd_scac', join: 'CUSTRECORD_PACEJET_ASD_TRANSACTION', label: 'CarrierAlphaCode' },
            ShipmentDate: {
                name: 'formulatext',
                formula: "Concat(SUBSTR({CUSTRECORD_PACEJET_ASD_TRANSACTION.custrecord_pacejet_asd_shipdate},6,2), concat(concat('/', SUBSTR({CUSTRECORD_PACEJET_ASD_TRANSACTION.custrecord_pacejet_asd_shipdate},9,2)), concat('/', SUBSTR({CUSTRECORD_PACEJET_ASD_TRANSACTION.custrecord_pacejet_asd_shipdate},0,4))))",
                label: 'ShipmentDate',
            },
        };
        var shipmentRecWmsIntegrationObj = {}; // this can be used to override search values from If Object for WMS integrations
        if (spsPackageDataSource === packdata.PackageSourceString.PacejetWms) {
            overrideColumnObj = pacejetOverrideColumns;
            var paceJetRecId = paceJet.searchIfASDComplete(itemFulfillmentIds);
            var asdRecFilter = ['custrecord_pacejet_asd_transaction.internalid', 'anyof'].concat(paceJetRecId);
            asnFilters.splice(6, 1, asdRecFilter);
        }
        if (spsPackageDataSource === packdata.PackageSourceString.NetsuiteShipCentral && wmsIntegrationShipmentRecId) {
            shipmentRecWmsIntegrationObj = sps_lib_packdata_shipcentral_search_1.getShipCentralShipRecObjData(wmsIntegrationShipmentRecId);
        }
        var asnSearchColumns = loadedItemFulfillmentSearch.columns;
        var custAsnSearchFilters = loadedItemFulfillmentSearch.filters;
        custAsnSearchFilters.push(search.createFilter({
            name: 'internalid',
            operator: search_1.Operator.ANYOF,
            values: itemFulfillmentIds,
        }));
        var headers = [];
        var wmsOverrideKeys = Object.keys(overrideColumnObj);
        asnSearchColumns.forEach(function (column, index) {
            var columnLabel = column.label;
            var columnName = column.name;
            var columnFormula = column.formula;
            headers.push(columnLabel);
            if (columnName.indexOf('formula') !== -1 && !columnFormula) {
                var formulaSearchErr = error.create({
                    name: 'SPS_ASN_SEARCH_MISSING_FORMULA',
                    message: "Current ASN Search Column Labeled: " + columnLabel + " is a formula field with no fomula value set. Set a Value or change column sourcing.",
                    notifyOff: true,
                });
                throw formulaSearchErr;
            }
            if (wmsOverrideKeys.indexOf(columnLabel) > -1) {
                var replaceCol = search.createColumn(overrideColumnObj[columnLabel]);
                log.debug('WMS Search Override', "Search Column Label: " + columnLabel + " sourcing has been changed to reflect " + spsPackageDataSource + " as ASN data source");
                asnSearchColumns.splice(index, 1, replaceCol);
            }
        });
        if (custAsnSearchFiltersEnabled) {
            asnFilters = custAsnSearchFilters;
        }
        var finalItemFulfillmentSearch = search.create({
            type: 'itemfulfillment',
            filters: asnFilters,
            columns: asnSearchColumns.concat(scriptingColumns),
        });
        var ifResults = {};
        var pagedData = finalItemFulfillmentSearch.runPaged({ pageSize: 1000 });
        log.debug('Check for Default or Custom Search Filters', "A search has been completed using the following filters: " + JSON.stringify(asnFilters));
        pagedData.pageRanges.forEach(function (pageRange) {
            var page = pagedData.fetch({ index: pageRange.index });
            page.data.forEach(function (result) {
                var currentItemFulfillment = {};
                asnSearchColumns.forEach(function (column) {
                    var resultLabel = column.label;
                    var resultText = result.getText(column);
                    currentItemFulfillment[resultLabel] = resultText || result.getValue(column);
                    if (shipmentRecWmsIntegrationObj === null || shipmentRecWmsIntegrationObj === void 0 ? void 0 : shipmentRecWmsIntegrationObj[resultLabel])
                        currentItemFulfillment[resultLabel] = shipmentRecWmsIntegrationObj[resultLabel];
                });
                var lineId = result.getValue(itemLineColumn);
                var itemFulfillmentId = result.getValue(itemFulfillmentColumn);
                var ifResultsKey = itemFulfillmentId + "^" + lineId;
                ifResults[ifResultsKey] = currentItemFulfillment;
            });
        });
        var results = {
            headers: undefined,
            ifResults: undefined,
        };
        results.headers = headers;
        results.ifResults = ifResults;
        return results;
    }
    exports.getIfObj = getIfObj;
});
