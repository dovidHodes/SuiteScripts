define(["require", "exports", "N/search", "N/log", "./sps_lib_subsidiary", "./sps_lib_features", "./sps_lib_subsidiary"], function (require, exports, search, log, spsSubsidiary, features, sps_lib_subsidiary_1) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.getCustomerLabels = exports.getCustomManIdsCount = exports.getLabelAccessObj = exports.labelSearchColumnMappingObj = exports.labelSetupColumnMappingObj = void 0;
    exports.labelSetupColumnMappingObj = {
        customer: { id: 'custpage_customer', label: 'Customer', type: 'SELECT' },
        companyName: { id: 'custpage_company_name', label: 'Company Name', type: 'TEXT' },
        labelName: { id: 'custpage_label_name', label: 'Label Name', type: 'TEXT' },
        customerDefault: { id: 'custpage_customer_default', label: 'Customer Default Label?', type: 'CHECKBOX' },
        labelUid: { id: 'custpage_label_uid', label: 'Label UID', type: 'TEXT' },
        recordId: { id: 'custpage_rec_internal_id', label: 'Record Id', type: 'TEXT' },
        removeLabel: { id: 'custpage_remove_label', label: 'Remove', type: 'TEXT' },
    };
    exports.labelSearchColumnMappingObj = {
        select: { id: 'custpage_select_label', label: 'Select', type: 'CHECKBOX' },
        labelUid: { id: 'custpage_label_uid', label: 'Label UID', type: 'TEXT' },
        companyName: { id: 'custpage_company_result', label: 'Company Name', type: 'TEXT' },
        labelName: { id: 'custpage_label_result', label: 'Label Name', type: 'TEXT' },
        customer: { id: 'custpage_customer', label: 'Customer', type: 'SELECT' },
        customerDefault: { id: 'custpage_customer_default', label: 'Make Customer Default?', type: 'CHECKBOX' },
    };
    function getLabelAccessObj(transactionSubId) {
        // Perform search to determine if any instances of the SPS Configuration record exist
        // If so, return the brand info associated to all existing records
        var resultObj;
        if (features.isSubsidiaryEnabled()) {
            //TODO: Figure out how to handle when a role has access to multiple subsidiaries that match to different SPS Configuration records
            resultObj = transactionSubId ? spsSubsidiary.getBrandInfoByTransactionSubsidiary(transactionSubId) : spsSubsidiary.getBrandInfoBySubsidiary();
        }
        else {
            // Because we are looking for a specific instance of this record type, we can use a hard-coded ID value
            var mfgIdSearch = search.lookupFields({
                type: 'customrecord_sps_label_access',
                id: 1,
                columns: ['custrecord_sps_label_login_mfgid', 'custrecord_uccuid'],
            });
            resultObj = [
                {
                    recordId: '1',
                    mfgId: mfgIdSearch.custrecord_sps_label_login_mfgid,
                    labelOffest: mfgIdSearch.custrecord_uccuid,
                },
            ];
        }
        log.debug('Label Access search results', resultObj);
        return resultObj;
    }
    exports.getLabelAccessObj = getLabelAccessObj;
    function getCustomManIdsCount() {
        var customrecord_sps_man_id_overrideSearchObj = search.create({
            type: 'customrecord_sps_man_id_override',
            filters: [['isinactive', 'is', 'F']],
            columns: [search.createColumn({ name: 'custrecord_sps_man_id_override', label: 'Manufacturer Id' })],
        });
        var searchResultCount = customrecord_sps_man_id_overrideSearchObj.runPaged().count;
        return searchResultCount;
    }
    exports.getCustomManIdsCount = getCustomManIdsCount;
    function getCustomerLabels() {
        var brandInfo = spsSubsidiary.getBrandConfigurationInfo();
        // first search for Label Configuration Records in Account
        var customerLabelSearch = search.create({
            type: 'customrecord_sps_customer_label_config',
            filters: [],
            columns: [
                search.createColumn({
                    name: 'custrecord_sps_label_config_customer',
                    sort: search.Sort.ASC,
                    label: 'Customer',
                }),
                search.createColumn({ name: 'custrecord_sps_label_company', label: 'Label Company' }),
                search.createColumn({ name: 'name', label: 'Name' }),
                search.createColumn({ name: 'custrecord_sps_label_config_default', label: 'Customer Default Label' }),
                search.createColumn({ name: 'custrecord_sps_label_uid', label: 'Label UID' }),
            ],
        });
        var searchResultCount = customerLabelSearch.runPaged().count;
        var searchResultArr = [];
        if (searchResultCount > 0) {
            customerLabelSearch.run().each(function (result) {
                var resultObj = {
                    customer: result.getValue('custrecord_sps_label_config_customer'),
                    companyName: result.getValue('custrecord_sps_label_company'),
                    labelName: result.getValue('name'),
                    customerDefault: result.getValue('custrecord_sps_label_config_default') === true ? 'T' : 'F',
                    labelUid: result.getValue('custrecord_sps_label_uid').toString().length > 0 ? result.getValue('custrecord_sps_label_uid') : 'N/A',
                    recordId: result.id,
                    removeLabel: "<button onclick=\"deleteLabel(0)\">Remove</button>",
                };
                searchResultArr.push(resultObj);
                return true;
            });
        }
        // if subsidiary is active in this account, we want to filter out only customers the user has access to.
        // we need to ensure searchResultArr is not empty before filtering because it will throw an error if we pass an empty array into our search record
        if (brandInfo.length > 0 && searchResultArr.length > 0) {
            // if subsidiary is active in this account, we want to filter by the users role ID
            var uniqueCustIdArr = searchResultArr
                .map(function (obj) {
                return obj.customer;
            })
                .filter(function (custId, index, array) {
                return array.indexOf(custId) === index;
            });
            var filteredCustomerList_1 = sps_lib_subsidiary_1.useRoleSubsidiariesToFilterCustomerArr(uniqueCustIdArr);
            log.debug('SPS Brand Configuration Filtering', "Filtering Customer Label Records for NS account. Total customers with labels setup in account: " + uniqueCustIdArr.length + " after filter: " + filteredCustomerList_1.length);
            searchResultArr = searchResultArr.filter(function (searchObj) {
                if (filteredCustomerList_1.indexOf(searchObj.customer) > -1) {
                    return searchObj;
                }
            });
        }
        log.debug('Customer label list', searchResultArr);
        return searchResultArr;
    }
    exports.getCustomerLabels = getCustomerLabels;
});
