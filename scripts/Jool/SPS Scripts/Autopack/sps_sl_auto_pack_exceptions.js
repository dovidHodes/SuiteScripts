/**
 *@NApiVersion 2.1
 *@NModuleScope SameAccount
 *@NScriptType Suitelet
 */
define(["require", "exports", "N/log", "N/ui/serverWidget", "N/record", "./lib/sps_lib_script_status_search", "N/url", "N/runtime"], function (require, exports, log, ui, record, script_status_search, url, runtime) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.onRequest = void 0;
    function resolveRecordURL(type, internalID, recordMode) {
        var scheme = 'https://';
        var host = url.resolveDomain({
            hostType: url.HostType.APPLICATION,
        });
        var relativePath = url.resolveRecord({
            recordType: type,
            recordId: internalID,
            isEditMode: false,
        });
        var myURL = scheme + host + relativePath;
        return myURL;
    }
    function onRequest(ctx) {
        var customerAccessAllowed = false;
        // Push the name of the custom search into a constant that we can change to the desired saved search.
        try {
            if (ctx.request.method === 'GET') {
                var runAsRole = void 0;
                var customerRoleName = runtime.getCurrentUser().roleId;
                var scriptDeploymentName = runtime.getCurrentScript().deploymentId;
                var userSubsidiary = void 0;
                userSubsidiary = runtime.getCurrentUser().subsidiary;
                var deploymentInternalID = script_status_search.checkDeploymentRunAs(scriptDeploymentName);
                var scriptDeploymentRecord = record.load({
                    type: 'scriptdeployment',
                    id: deploymentInternalID,
                });
                if (scriptDeploymentRecord)
                    runAsRole = scriptDeploymentRecord.getValue('runasrole');
                log.audit('Script Deployment Run As Role: ', runAsRole);
                customerAccessAllowed = customerRoleName == 'administrator' || runAsRole == '3';
                var form = void 0, sublistForm_1, autoPackExceptionsResults = void 0, autoPackExceptionsColumns_1;
                var uniqueExceptionRecordResults = void 0;
                var hideSearchData_1 = [];
                var exceptionMatchItemInternalid_1, exceptionMatchLineID_1;
                form = ui.createForm({ title: 'Manage Auto Pack Exceptions' });
                sublistForm_1 = form.addSublist({
                    id: 'custpage_package_exceptions_list',
                    type: ui.SublistType.LIST,
                    label: 'Package Exceptions',
                });
                var defaultItemFulfillmentFilterValue = ctx.request.parameters.itemFulfillmentFilter;
                var defaultItemFilterValue = ctx.request.parameters.itemFilter;
                var defaultCustomerFilterValue = ctx.request.parameters.customerFilter;
                var defaultExceptionFilterValue = ctx.request.parameters.exceptionFilter;
                var subsidiaryFilter = userSubsidiary;
                log.debug('subsidiaryFilter', subsidiaryFilter);
                // This is where we include the client script responsible for processing the field changes for our filters
                form.clientScriptModulePath = './sps_cs_process_pkg_excp_filters';
                form.addButton({
                    label: 'Clear Filters',
                    id: 'custpage_clear_filters',
                    functionName: 'clearFilters()',
                });
                // This is where we add the different filters we will need for our exceptions search
                form.addField({
                    id: 'custpage_item_ff_number_filter',
                    type: ui.FieldType.SELECT,
                    label: 'Item Fulfillment Number',
                    source: 'itemfulfillment',
                }).defaultValue = defaultItemFulfillmentFilterValue;
                form.addField({
                    id: 'custpage_item_filter',
                    type: ui.FieldType.SELECT,
                    label: 'Item',
                    source: 'item',
                }).defaultValue = defaultItemFilterValue;
                form.addField({
                    id: 'custpage_customer_filter',
                    type: ui.FieldType.SELECT,
                    label: 'Customer',
                    source: 'customer',
                }).defaultValue = defaultCustomerFilterValue;
                form.addField({
                    id: 'custpage_exception_reason_filter',
                    type: ui.FieldType.TEXT,
                    label: 'Exception Reason',
                }).defaultValue = defaultExceptionFilterValue;
                autoPackExceptionsResults = script_status_search.exceptionsSearch({
                    itemFulfillmentFilter: defaultItemFulfillmentFilterValue,
                    itemFilter: defaultItemFilterValue,
                    customerFilter: defaultCustomerFilterValue,
                    exceptionFilter: defaultExceptionFilterValue,
                    subsidiaryFilter: subsidiaryFilter,
                });
                autoPackExceptionsColumns_1 = autoPackExceptionsResults.columns;
                // This is where we add columns to our suitelet table display based on labels
                var columnCounter_1 = 0;
                autoPackExceptionsColumns_1.forEach(function () {
                    var customPageFieldID;
                    if (columnCounter_1 == 0) {
                        customPageFieldID = 'custpage_field' + '_column_' + columnCounter_1;
                        // @ts-ignore
                        var labelField = autoPackExceptionsColumns_1[columnCounter_1]['label'];
                        sublistForm_1.addField({
                            id: customPageFieldID,
                            label: labelField,
                            type: ui.FieldType.TEXT,
                        });
                    }
                    else {
                        customPageFieldID = 'custpage_field' + '_column_' + columnCounter_1;
                        var labelField = autoPackExceptionsColumns_1[columnCounter_1]['label'];
                        if (labelField != 'Item - Internal ID' && labelField != 'Line ID') {
                            sublistForm_1.addField({
                                id: customPageFieldID,
                                label: labelField,
                                type: ui.FieldType.TEXT,
                            });
                        }
                        else {
                            hideSearchData_1.push(columnCounter_1);
                        }
                    }
                    columnCounter_1++;
                    return true;
                });
                // This is how we add the sublist (row) data. It parses through the search based on column positions and checks for normal id and text values.
                // Also checks for any group/max functions in the saved search.
                var rowCounter_1 = 0, checkJoins_1, checkSummary_1;
                autoPackExceptionsResults.run().each(function (result) {
                    var columnCounter = 0, searchRowText, searchRowValues, rowValue, itemFulfillmentID;
                    var exceptionText;
                    autoPackExceptionsColumns_1.forEach(function () {
                        var customPageFieldID = 'custpage_field' + '_column_' + columnCounter;
                        checkJoins_1 = autoPackExceptionsColumns_1[columnCounter]['join'];
                        checkSummary_1 = autoPackExceptionsColumns_1[columnCounter]['summary'];
                        if (checkJoins_1) {
                            checkJoins_1 = checkJoins_1.toString();
                            checkJoins_1 = checkJoins_1.toLowerCase();
                        }
                        if (checkSummary_1) {
                            checkSummary_1 = checkSummary_1.toString();
                            checkSummary_1 = checkSummary_1.toLowerCase();
                        }
                        if (checkJoins_1) {
                            if (checkSummary_1) {
                                searchRowText = result.getText({
                                    name: autoPackExceptionsColumns_1[columnCounter]['name'],
                                    join: checkJoins_1,
                                    summary: checkSummary_1,
                                });
                                searchRowValues = result.getValue({
                                    name: autoPackExceptionsColumns_1[columnCounter]['name'],
                                    join: checkJoins_1,
                                    summary: checkSummary_1,
                                });
                            }
                            else {
                                searchRowText = result.getText({
                                    name: autoPackExceptionsColumns_1[columnCounter]['name'],
                                    join: checkJoins_1,
                                });
                                searchRowValues = result.getValue({
                                    name: autoPackExceptionsColumns_1[columnCounter]['name'],
                                    join: checkJoins_1,
                                });
                            }
                        }
                        else {
                            if (checkSummary_1) {
                                searchRowText = result.getText({
                                    name: autoPackExceptionsColumns_1[columnCounter]['name'],
                                    summary: checkSummary_1,
                                });
                                searchRowValues = result.getValue({
                                    name: autoPackExceptionsColumns_1[columnCounter]['name'],
                                    summary: checkJoins_1,
                                });
                            }
                            else {
                                searchRowText = result.getText(autoPackExceptionsColumns_1[columnCounter]['name']);
                                searchRowValues = result.getValue(autoPackExceptionsColumns_1[columnCounter]['name']);
                            }
                        }
                        if (searchRowText || searchRowValues) {
                            if (!searchRowText) {
                                rowValue = searchRowValues;
                            }
                            else {
                                rowValue = searchRowText;
                            }
                            if (autoPackExceptionsColumns_1[columnCounter]['label'] == 'Internal ID') {
                                itemFulfillmentID = rowValue;
                            }
                            if (hideSearchData_1.includes(columnCounter) == true) {
                                if (autoPackExceptionsColumns_1[columnCounter]['label'] == 'Item - Internal ID') {
                                    exceptionMatchItemInternalid_1 = rowValue;
                                }
                                else if (autoPackExceptionsColumns_1[columnCounter]['label'] == 'Line ID') {
                                    exceptionMatchLineID_1 = rowValue;
                                }
                            }
                            else if (autoPackExceptionsColumns_1[columnCounter]['label'] == 'Exception Reason') {
                                var exceptionReasonSplit = rowValue.split(',');
                                for (var j = 0; j < exceptionReasonSplit.length; j++) {
                                    if (exceptionReasonSplit[j].indexOf(exceptionMatchItemInternalid_1) > -1 && exceptionReasonSplit[j].indexOf(exceptionMatchLineID_1) > -1) {
                                        // Return only the string of text from the exception match
                                        exceptionText = exceptionReasonSplit[j].replace(/[^a-zA-Z]+/g, ' ');
                                        sublistForm_1.setSublistValue({
                                            id: customPageFieldID,
                                            line: rowCounter_1,
                                            value: exceptionText,
                                        });
                                        break;
                                    }
                                }
                            }
                            else if (autoPackExceptionsColumns_1[columnCounter]['label'] == 'Item Fulfillment/Shipment') {
                                var recordInternalID = itemFulfillmentID;
                                var recordURL = resolveRecordURL('itemfulfillment', recordInternalID, 'view');
                                sublistForm_1.setSublistValue({
                                    id: customPageFieldID,
                                    line: rowCounter_1,
                                    value: '<a href="' + recordURL + '">' + searchRowValues + '</a>',
                                });
                            }
                            else if (autoPackExceptionsColumns_1[columnCounter]['label'] == 'Associated Sales Order') {
                                var recordInternalID = searchRowValues;
                                var recordURL = resolveRecordURL('salesorder', recordInternalID, 'view');
                                sublistForm_1.setSublistValue({
                                    id: customPageFieldID,
                                    line: rowCounter_1,
                                    value: '<a href="' + recordURL + '">' + searchRowText + '</a>',
                                });
                            }
                            else if (autoPackExceptionsColumns_1[columnCounter]['label'] == 'Perform Action') {
                                if (exceptionText && exceptionText.indexOf('Manual') > -1) {
                                    var manualPackRecord = url.resolveRecord({
                                        recordType: 'customrecord_sps_package',
                                        recordId: null,
                                        isEditMode: true,
                                        params: {
                                            pf: 'CUSTRECORD_SPS_PACK_ASN',
                                            pr: '-30',
                                            pi: searchRowValues,
                                        },
                                    });
                                    sublistForm_1.setSublistValue({
                                        id: customPageFieldID,
                                        line: rowCounter_1,
                                        value: '<a href=' + manualPackRecord + '>Manually Pack Item Fulfillment</a>',
                                    });
                                }
                                else {
                                    var packRuleRecord = url.resolveRecord({
                                        recordType: 'customrecord_sps_pack_qty',
                                        recordId: null,
                                        isEditMode: true,
                                        params: {
                                            itemFilter: exceptionMatchItemInternalid_1,
                                        },
                                    });
                                    sublistForm_1.setSublistValue({
                                        id: customPageFieldID,
                                        line: rowCounter_1,
                                        value: '<a href=' + packRuleRecord + '&whence=>Create Pack Rule</a>',
                                    });
                                }
                            }
                            else {
                                sublistForm_1.setSublistValue({
                                    id: customPageFieldID,
                                    line: rowCounter_1,
                                    value: rowValue,
                                });
                            }
                        }
                        else {
                            sublistForm_1.setSublistValue({
                                id: customPageFieldID,
                                line: rowCounter_1,
                                value: ' ',
                            });
                        }
                        columnCounter++;
                        return true;
                    });
                    rowCounter_1++;
                    return true;
                });
                ctx.response.writePage(form);
            }
            else if (ctx.request.method === 'POST') {
                log.debug({ title: 'Suitelet is posting.', details: '' });
            }
        }
        catch (e) {
            if (customerAccessAllowed == false) {
                alert('You do not have permissions to access this page. Please reach out to your administrator. Details: ' + e);
                log.error('Unable to generate Suitelet page due to permissions: ', e);
            }
            else {
                log.error('Unable to generate Suitelet page: ', e);
            }
        }
    }
    exports.onRequest = onRequest;
});
