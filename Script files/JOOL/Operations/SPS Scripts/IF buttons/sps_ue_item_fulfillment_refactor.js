/**
 *@NApiVersion 2.0
 *@NModuleScope SameAccount
 *@NScriptType UserEventScript
 *@NAmdConfig ./module_config.json
 */
define(["require", "exports", "N/ui/serverWidget", "N/config", "N/log", "N/url", "N/search", "N/record", "N/ui/message", "./lib/sps_lib_packdata", "./lib/sps_lib_packing_slip", "./lib/sps_lib_packdata_interfaces", "./lib/sps_lib_features", "./lib/sps_lib_script_status_rec", "./lib/sps_lib_script_status_rec", "./lib/sps_lib_logging_util"], function (require, exports, serverWidget, config, log, url, search, record, message, sps_lib_packdata_1, spsLibPackingSlip, sps_lib_packdata_interfaces_1, sps_lib_features_1, spsStatusRec, sps_lib_script_status_rec_1, sps_lib_logging_util_1) {
    // buttons names section
    var asnButtonLabel = 'Create Advance Ship Notice';
    var autoPackButtonLabel = 'Auto Pack Shipment';
    var batchPrinButtonLabel = 'Batch Print Labels';
    var pacejetConsolidatedAsnLabel = 'Consolidated Pacejet ASN or SOTI ASN';
    var addNewPackageButtonLabel = 'Add New Package';
    var createConsolidatedAsnButtonLabel = 'Create Consolidated ASN';
    var spsPackingSlipButtonLabel = 'Generate Packing Slip';
    var sciptExecutionLogger = new sps_lib_logging_util_1.ScriptExecutionLogger();
    var existingPackageUrl = function (itemFulfillmentId, packageId) {
        var params = { itemFulfillmentId: itemFulfillmentId };
        if (packageId) {
            params.packageId = packageId;
        }
        return url.resolveScript({
            scriptId: 'customscript_sps_sl_new_package_ui',
            deploymentId: 'customdeploy_sps_sl_new_package_ui',
            params: params,
            returnExternalUrl: false,
        });
    };
    function buildPackageTab(ctx, asnEnabled, betaNewPackingUiFeatureFlag) {
        var customerId = ctx.newRecord.getValue({ fieldId: 'entity' });
        var ifRecId = ctx.newRecord.id;
        if (customerId && asnEnabled) {
            if (ctx.type === ctx.UserEventType.VIEW || ctx.type === ctx.UserEventType.EDIT || ctx.type === ctx.UserEventType.CREATE) {
                ctx.form.addTab({
                    id: 'custpage_sps_packages',
                    label: 'SPS EDI Packages',
                });
                var custlabel_1 = ctx.form.addField({
                    id: 'custpage_custlabel',
                    type: 'select',
                    label: 'Customer Label',
                    container: 'custpage_sps_packages',
                });
                var labelSearchFilter = [
                    search.createFilter({
                        name: 'custrecord_sps_label_config_customer',
                        operator: search.Operator.ANYOF,
                        values: customerId,
                    }),
                ];
                var labelSearch = search.create({
                    type: 'customrecord_sps_customer_label_config',
                    filters: labelSearchFilter,
                    columns: [
                        search.createColumn({
                            name: 'custrecord_sps_label_config_customer',
                            sort: search.Sort.ASC,
                        }),
                        'name',
                        'custrecord_sps_label_config_default',
                        'custrecord_sps_label_uid',
                        'custrecord_sps_label_company',
                    ],
                });
                var selectedLabelConfigRecId_1 = ctx.newRecord.getValue({ fieldId: 'custbody_sps_customer_label' }) || '';
                var selectedLabelConfigRecText = ctx.newRecord.getText({ fieldId: 'custbody_sps_customer_label' }) || '';
                if (ctx.type === ctx.UserEventType.VIEW) {
                    // IF only view context, just set the display field value, no reason ot have options since its just view context
                    custlabel_1.addSelectOption({
                        value: selectedLabelConfigRecId_1,
                        text: selectedLabelConfigRecText,
                        isSelected: true,
                    });
                }
                if (ctx.type === ctx.UserEventType.EDIT || ctx.type === ctx.UserEventType.CREATE) {
                    var labelOptionsSetupLogger = sciptExecutionLogger.newExecutionContext('Label Options Setup');
                    custlabel_1.addSelectOption({
                        text: '',
                        value: '',
                        isSelected: false,
                    });
                    labelSearch.run().each(function (result) {
                        var labelName = result.getValue('name');
                        var labelDefault = result.getValue('custrecord_sps_label_config_default');
                        if (!selectedLabelConfigRecId_1 && labelDefault) {
                            custlabel_1.addSelectOption({
                                text: labelName,
                                value: result.id,
                                isSelected: true,
                            });
                            try {
                                ctx.newRecord.setValue({
                                    fieldId: 'custbody_sps_customer_label',
                                    value: result.id,
                                });
                            }
                            catch (e) {
                                log.error('ERROR', "Unable to Update the Customer Label: " + e.toString());
                            }
                        }
                        else if (selectedLabelConfigRecId_1 === result.id) {
                            custlabel_1.addSelectOption({
                                text: labelName,
                                value: result.id,
                                isSelected: true,
                            });
                        }
                        else {
                            custlabel_1.addSelectOption({
                                text: labelName,
                                value: result.id,
                                isSelected: false,
                            });
                        }
                        return true;
                    });
                    labelOptionsSetupLogger.executionFinished();
                }
                if (sps_lib_features_1.isPackingSlipEnabled() && customerId) {
                    var packingSlipOptionsLogger = sciptExecutionLogger.newExecutionContext('Packing Slip Options');
                    var packingSlip_1 = ctx.form.addField({
                        id: 'custpage_packingslip',
                        type: 'select',
                        label: 'Packing Slip',
                        container: 'custpage_sps_packages',
                    });
                    var selectedPackSlipConfigRecId_1 = ctx.newRecord.getValue({ fieldId: 'custbody_sps_packing_slip' }) || '';
                    var selectedPackSlipConfigRecName = ctx.newRecord.getText({ fieldId: 'custbody_sps_packing_slip' }) || '';
                    if (ctx.type === ctx.UserEventType.VIEW) {
                        // get value set to hidden field and set as default value
                        packingSlip_1.addSelectOption({
                            text: selectedPackSlipConfigRecName,
                            value: selectedPackSlipConfigRecId_1,
                            isSelected: true,
                        });
                    }
                    if (ctx.type === ctx.UserEventType.EDIT || ctx.type === ctx.UserEventType.CREATE) {
                        packingSlip_1.addSelectOption({
                            text: '',
                            value: '',
                            isSelected: false,
                        });
                        var _a = spsLibPackingSlip.getPackingSlipInfoAndDefault(customerId), resultObj_1 = _a.resultObj, packingSlipDefault_1 = _a.packingSlipDefault;
                        log.debug('Packing slip default value', packingSlipDefault_1);
                        log.debug('Result obj', resultObj_1);
                        var dupCheckArray_1 = [];
                        Object.keys(resultObj_1).forEach(function (customer, customerIndex) {
                            var resultsArr = resultObj_1[customer].results;
                            resultsArr.forEach(function (temp) {
                                var index;
                                var nameMatch = dupCheckArray_1.some(function (item, i) {
                                    if (item.packingSlipName === temp.packingSlipName) {
                                        index = i;
                                        return true;
                                    }
                                });
                                if (!nameMatch) {
                                    dupCheckArray_1.push(temp);
                                }
                                else {
                                    if (dupCheckArray_1[index].isDefault == false && temp.isDefault == true) {
                                        dupCheckArray_1.splice(index, 1);
                                        dupCheckArray_1.push(temp);
                                    }
                                }
                                return true;
                            });
                        });
                        dupCheckArray_1.forEach(function (slip) {
                            if (!selectedPackSlipConfigRecId_1 && packingSlipDefault_1 === slip.packingSlipAssignmentId) {
                                packingSlip_1.addSelectOption({
                                    text: slip.packingSlipName,
                                    value: slip.packingSlipAssignmentId,
                                    isSelected: true,
                                });
                                ctx.newRecord.setValue({
                                    fieldId: 'custbody_sps_packing_slip',
                                    value: slip.packingSlipAssignmentId,
                                });
                                ctx.newRecord.setValue({
                                    fieldId: 'custpage_packingslip',
                                    value: slip.packingSlipAssignmentId,
                                });
                                if (ctx.type === ctx.UserEventType.VIEW || ctx.type === ctx.UserEventType.EDIT) {
                                    record.submitFields({
                                        type: record.Type.ITEM_FULFILLMENT,
                                        id: ifRecId,
                                        values: { custbody_sps_packing_slip: slip.packingSlipAssignmentId },
                                    });
                                }
                            }
                            else if (selectedPackSlipConfigRecId_1 === slip.packingSlipAssignmentId) {
                                packingSlip_1.addSelectOption({
                                    text: slip.packingSlipName,
                                    value: slip.packingSlipAssignmentId,
                                    isSelected: true,
                                });
                                ctx.newRecord.setValue({
                                    fieldId: 'custpage_packingslip',
                                    value: slip.packingSlipAssignmentId,
                                });
                            }
                            else {
                                packingSlip_1.addSelectOption({
                                    text: slip.packingSlipName,
                                    value: slip.packingSlipAssignmentId,
                                    isSelected: false,
                                });
                            }
                        });
                    }
                    packingSlipOptionsLogger.executionFinished();
                }
                if (ctx.type === ctx.UserEventType.VIEW || ctx.type === ctx.UserEventType.EDIT) {
                    // Package SubTab
                    var subList_1;
                    if (ctx.type === ctx.UserEventType.VIEW) {
                        var asnViewUrl = url.resolveScript({
                            scriptId: 'customscript_sps_sl_asn_view',
                            deploymentId: 'customdeploy_sps_sl_asn_view',
                            params: {
                                tranIds: ifRecId,
                            },
                        });
                        subList_1 = ctx.form.addSublist({
                            id: 'custpage_sps_package_sublist',
                            label: 'Package',
                            tab: 'custpage_sps_packages',
                            type: serverWidget.SublistType.INLINEEDITOR,
                        });
                        var packIdField = subList_1.addField({
                            id: 'sps_packageid',
                            label: 'ID',
                            tab: 'custpage_sps_packages',
                            source: 'customrecord_sps_package',
                            type: betaNewPackingUiFeatureFlag ? serverWidget.FieldType.TEXT : serverWidget.FieldType.SELECT,
                        });
                        packIdField.updateDisplayType({
                            displayType: serverWidget.FieldDisplayType.NORMAL,
                        });
                        ctx.form.addPageLink({
                            type: serverWidget.FormPageLinkType.BREADCRUMB,
                            url: asnViewUrl,
                            title: 'Preview SPS ASN',
                        });
                    }
                    else if (ctx.type === ctx.UserEventType.EDIT) {
                        subList_1 = ctx.form.addSublist({
                            id: 'custpage_sps_package_sublist',
                            label: 'Package',
                            tab: 'custpage_sps_packages',
                            type: serverWidget.SublistType.LIST,
                        });
                        var packIdField = subList_1.addField({
                            id: 'sps_packageid',
                            label: 'ID',
                            tab: 'custpage_sps_packages',
                            source: 'customrecord_sps_package',
                            type: betaNewPackingUiFeatureFlag ? serverWidget.FieldType.TEXT : serverWidget.FieldType.SELECT,
                        });
                        packIdField.updateDisplayType({
                            displayType: serverWidget.FieldDisplayType.INLINE,
                        });
                    }
                    subList_1.addField({
                        id: 'sps_cartonindex',
                        label: 'Carton Index',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.INTEGER,
                    });
                    subList_1.addField({
                        id: 'sps_totalweight',
                        label: 'Package Weight (lbs)',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.FLOAT,
                    });
                    subList_1.addField({
                        id: 'sps_totalqty',
                        label: 'Total Qty',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.INTEGER,
                    });
                    subList_1.addField({
                        id: 'sps_trackingnum',
                        label: 'Tracking Number',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.TEXT,
                    });
                    subList_1.addField({
                        id: 'sps_labeluid',
                        label: 'Label ID',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.TEXT,
                    });
                    subList_1.addField({
                        id: 'sps_printlabel',
                        label: 'Print Label',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.TEXT,
                    });
                    subList_1.addField({
                        id: 'sps_length',
                        label: 'Length',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.FLOAT,
                    });
                    subList_1.addField({
                        id: 'sps_width',
                        label: 'Width',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.FLOAT,
                    });
                    subList_1.addField({
                        id: 'sps_height',
                        label: 'Height',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.FLOAT,
                    });
                    subList_1.addField({
                        id: 'sps_innerpack',
                        label: 'Inner Pack',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.FLOAT,
                    });
                    subList_1.addField({
                        id: 'sps_outerpack',
                        label: 'Outer Pack',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.FLOAT,
                    });
                    subList_1.addField({
                        id: 'sps_labelresult',
                        label: 'Label Result',
                        tab: 'custpage_sps_packages',
                        type: serverWidget.FieldType.TEXT,
                    });
                    var packageSearchFilter1 = ['custrecord_sps_pack_asn.mainline', search.Operator.IS, 'T'];
                    var packageSearchFilter2 = ['custrecord_sps_pack_asn', search.Operator.ANYOF, ifRecId];
                    var packageSearch = search.create({
                        type: 'customrecord_sps_package',
                        filters: [packageSearchFilter1, 'AND', packageSearchFilter2],
                        columns: [
                            'name',
                            search.createColumn({
                                name: 'custrecord_sps_package_carton_index',
                                sort: search.Sort.ASC,
                            }),
                            'custrecord_sps_pk_weight',
                            'custrecord_sps_package_qty',
                            'custrecord_sps_track_num',
                            'custrecord_sps_package_ucc',
                            'custrecord_sps_pack_asn',
                            'custrecord_sps_package_length',
                            'custrecord_sps_package_width',
                            'custrecord_sps_package_height',
                            'custrecord_sps_package_inner',
                            'custrecord_sps_package_outer',
                            'custrecord_sps_package_label_result',
                            'custrecord_sps_package_label_url',
                        ],
                    });
                    var lineCounter_1 = 0;
                    var packageSearchResultCount = packageSearch.runPaged({}).count;
                    if (packageSearchResultCount > 0) {
                        var packageSearchLogger = sciptExecutionLogger.newExecutionContext('Package Search');
                        var pagedData = packageSearch.runPaged({ pageSize: 1000 });
                        var page = pagedData.fetch({ index: pagedData.pageRanges[0].index });
                        page.data.forEach(function (result) {
                            var cartonIndex = result.getValue('custrecord_sps_package_carton_index');
                            var packageWeight = result.getValue('custrecord_sps_pk_weight');
                            var packageQty = result.getValue('custrecord_sps_package_qty');
                            var trackNum = result.getValue('custrecord_sps_track_num');
                            var packageUcc = result.getValue('custrecord_sps_package_ucc');
                            var packageLength = result.getValue('custrecord_sps_package_length');
                            var packageWidth = result.getValue('custrecord_sps_package_width');
                            var packageHeight = result.getValue('custrecord_sps_package_height');
                            var packageInner = result.getValue('custrecord_sps_package_inner');
                            var packageOuter = result.getValue('custrecord_sps_package_outer');
                            var packageLabelResult = result.getValue('custrecord_sps_package_label_result');
                            var packageLabelUrl = result.getValue('custrecord_sps_package_label_url');
                            subList_1.setSublistValue({
                                id: 'sps_packageid',
                                line: lineCounter_1,
                                value: betaNewPackingUiFeatureFlag ? "<a href=\"" + existingPackageUrl(ifRecId, result.id) + "\">PK-" + result.id + "</a>" : result.id,
                            });
                            if (cartonIndex) {
                                subList_1.setSublistValue({
                                    id: 'sps_cartonindex',
                                    line: lineCounter_1,
                                    value: cartonIndex,
                                });
                            }
                            if (packageWeight) {
                                subList_1.setSublistValue({
                                    id: 'sps_totalweight',
                                    line: lineCounter_1,
                                    value: packageWeight,
                                });
                            }
                            if (packageQty) {
                                subList_1.setSublistValue({
                                    id: 'sps_totalqty',
                                    line: lineCounter_1,
                                    value: packageQty,
                                });
                            }
                            if (trackNum) {
                                subList_1.setSublistValue({
                                    id: 'sps_trackingnum',
                                    line: lineCounter_1,
                                    value: trackNum,
                                });
                            }
                            if (packageUcc) {
                                subList_1.setSublistValue({
                                    id: 'sps_labeluid',
                                    line: lineCounter_1,
                                    value: packageUcc,
                                });
                            }
                            var updateCreateLabelScript = url.resolveScript({
                                scriptId: 'customscript_sps_sl_batch_label_2x',
                                deploymentId: 'customdeploy_sps_sl_batch_label_2x',
                                params: { id: ifRecId, packid: result.id },
                            });
                            var updateCreateLabelUrl = subList_1.setSublistValue({
                                id: 'sps_printlabel',
                                line: lineCounter_1,
                                value: "<a href=\"" + updateCreateLabelScript + "\">Print Label</a>",
                            });
                            if (updateCreateLabelUrl) {
                                subList_1.setSublistValue({
                                    id: 'sps_printlabel',
                                    line: lineCounter_1,
                                    value: updateCreateLabelUrl,
                                });
                            }
                            if (packageLength) {
                                subList_1.setSublistValue({
                                    id: 'sps_length',
                                    line: lineCounter_1,
                                    value: packageLength,
                                });
                            }
                            if (packageWidth) {
                                subList_1.setSublistValue({
                                    id: 'sps_width',
                                    line: lineCounter_1,
                                    value: packageWidth,
                                });
                            }
                            if (packageHeight) {
                                subList_1.setSublistValue({
                                    id: 'sps_height',
                                    line: lineCounter_1,
                                    value: packageHeight,
                                });
                            }
                            if (packageInner) {
                                subList_1.setSublistValue({
                                    id: 'sps_innerpack',
                                    line: lineCounter_1,
                                    value: packageInner,
                                });
                            }
                            if (packageOuter) {
                                subList_1.setSublistValue({
                                    id: 'sps_outerpack',
                                    line: lineCounter_1,
                                    value: packageOuter,
                                });
                            }
                            if (packageLabelResult) {
                                subList_1.setSublistValue({
                                    id: 'sps_labelresult',
                                    line: lineCounter_1,
                                    value: packageLabelResult,
                                });
                            }
                            else if (packageLabelUrl) {
                                subList_1.setSublistValue({
                                    id: 'sps_labelresult',
                                    line: lineCounter_1,
                                    value: "<a href=\"" + packageLabelUrl + "\">View Label</a>",
                                });
                            }
                            // eslint-disable-next-line no-plusplus
                            lineCounter_1++;
                        });
                        packageSearchLogger.executionFinished();
                    }
                }
            }
        }
    }
    function addSpsShipCentralButtons(ctx, ifId) {
        var shipCentralButtonLabel = 'SPS-NetSuite Ship Central Label And ASN Page';
        ctx.form.addButton({
            id: 'custpage_sps_shipcentral_labelAsn_button',
            label: shipCentralButtonLabel,
            functionName: "spsShipCentralFuncName(" + ifId + ")",
        });
    }
    function addSpsPacejetWmsButtons(ctx, ifIds) {
        var consolidatePjAsnUrlParams = ifIds ? { itemFulfillment: ifIds } : {};
        var consolidatePjAsnUrl = url.resolveScript({
            scriptId: 'customscript_sps_sl_pj_ship_processing',
            deploymentId: 'customdeploy_sps_sl_pj_ship_processing',
            params: consolidatePjAsnUrlParams,
            returnExternalUrl: false,
        });
        var pjFunctionName = "window.open('" + consolidatePjAsnUrl + "');";
        ctx.form.addButton({
            id: 'custpage_consolidate_pj_asn',
            label: pacejetConsolidatedAsnLabel,
            functionName: pjFunctionName,
        });
    }
    function addSpsPackingButtons(ctx, betaNewPackingUiFeatureFlag) {
        var autoPackObj = {
            scriptId: 'customscript_sps_sl_auto_pack_2',
            deploymentId: 'customdeploy_sps_sl_auto_pack_2',
            buttonId: 'custpage_sps_autopack',
            buttonLabel: 'Auto Pack Shipment',
            waitingMessageBody: 'Automatically packing items...',
        };
        ctx.form.addButton({
            id: 'custpage_sps_autopack',
            label: addNewPackageButtonLabel,
            functionName: "sps_manualPackage_notification(" + betaNewPackingUiFeatureFlag + ")",
        });
        ctx.form.addButton({
            id: 'custpage_sweetAlert_auto_pack2',
            label: autoPackButtonLabel,
            functionName: "sps_SweetAlertOnButtonClick('" + JSON.stringify(autoPackObj) + "')",
        });
    }
    function addStandardSpsBatchLabelButton(ctx) {
        var labelObj = {
            scriptId: 'customscript_sps_sl_batch_label_2x',
            deploymentId: 'customdeploy_sps_sl_batch_label_2x',
            buttonId: 'custpage_batch_print_lables',
            buttonLabel: 'Batch Print Labels',
            waitingMessageBody: 'Generating labels...',
        };
        ctx.form.addButton({
            id: 'custpage_batch_print_lables',
            label: batchPrinButtonLabel,
            functionName: "sps_SweetAlertOnButtonClick('" + JSON.stringify(labelObj) + "')",
        });
    }
    function addStandardSpsPackingSlipButton(ctx, ifRecId, customerId) {
        if (!customerId || !ifRecId) {
            log.error("SPS Packing Slip Button Error", "Customer ID: " + customerId + " or IF Record ID: " + ifRecId + " is missing cannot add SPS Packing Slip Button");
            return;
        }
        var packingSlipLogger = sciptExecutionLogger.newExecutionContext('Packing Slip');
        var scriptStatusObj = spsStatusRec.findScriptStatusRecord({ ifId: ifRecId, scriptTitle: 'SPS Packing Slip' });
        if (scriptStatusObj) {
            if (scriptStatusObj.status == sps_lib_script_status_rec_1.scriptStatusStatus.Error) {
                ctx.form.addPageInitMessage({
                    type: message.Type.ERROR,
                    title: 'Please Resolve - Packing Slip Generation Error',
                    message: "The following packing slip error has not been resolved - " + scriptStatusObj.statusMessage.substr(65),
                    duration: 10000,
                });
            }
            if (scriptStatusObj.status == sps_lib_script_status_rec_1.scriptStatusStatus.Complete && scriptStatusObj.successMsgCheck == false) {
                ctx.form.addPageInitMessage({
                    type: message.Type.CONFIRMATION,
                    title: 'Success - Generate Packing Slip',
                    message: "" + scriptStatusObj.statusMessage,
                    duration: 10000,
                });
                record.submitFields({
                    type: 'customrecord_sps_script_status',
                    id: scriptStatusObj.recordId,
                    values: {
                        custrecord_sps_success_message: true,
                    },
                });
            }
        }
        var packingSlipId = ctx.newRecord.getValue({ fieldId: 'custbody_sps_packing_slip' });
        log.debug('Getting pack slip ID param', packingSlipId);
        var packSlipConfigUrl = url.resolveScript({
            scriptId: 'customscript_sps_sl_configure_packslips',
            deploymentId: 'customdeploy_sps_sl_configure_packslips',
            params: { customerFilter: customerId },
        });
        ctx.form.addPageLink({
            type: serverWidget.FormPageLinkType.BREADCRUMB,
            url: packSlipConfigUrl,
            title: 'Packing Slip Configuration',
        });
        var spsPackingSlipObj = {
            scriptId: 'customscript_sps_sl_generate_pack_slip',
            deploymentId: 'customdeploy_sps_sl_generate_pack_slip',
            buttonId: 'custpage_generate_pack_slip',
            buttonLabel: 'Generate Packing Slip',
            waitingMessageBody: 'Packing Slip creation process has begun. Please refer to the Script Status Record (Custom -> SPS Script Status) for updates',
        };
        ctx.form.addButton({
            id: 'custpage_generate_pack_slip',
            label: spsPackingSlipButtonLabel,
            functionName: "sps_SweetAlertOnButtonClick('" + JSON.stringify(spsPackingSlipObj) + "')",
        });
        packingSlipLogger.executionFinished();
    }
    function addStandardSpsAsnButton(ctx, withConsolidatedButton) {
        var asnSetupLogger = sciptExecutionLogger.newExecutionContext('ASN Setup');
        var asnObj = {
            scriptId: 'customscript_sps_sl_svc_create_asn',
            deploymentId: 'customdeploy_sps_sl_svc_create_asn',
            buttonId: 'custpage_create_asn',
            buttonLabel: 'Create Advance Ship Notice',
            waitingMessageBody: 'Creating Advance Ship Notice for items...',
        };
        ctx.form.addButton({
            id: 'custpage_create_asn',
            label: asnButtonLabel,
            functionName: "sps_SweetAlertOnButtonClick('" + JSON.stringify(asnObj) + "')",
        });
        if (withConsolidatedButton) {
            ctx.form.addButton({
                id: 'custpage_sweetAlert_create_consolidated_asn',
                label: createConsolidatedAsnButtonLabel,
                functionName: 'consolidated_ASN_notification',
            });
        }
        asnSetupLogger.executionFinished();
    }
    function addDeepLinkingButton(ctx) {
        var deepLinkLogger = sciptExecutionLogger.newExecutionContext('Deep Link Button');
        try {
            ctx.form.addButton({
                functionName: 'sps_deepLinkOnButtonClickWithSweetAlert',
                id: 'custpage_sps_fulfillment_button',
                label: 'SPS Fulfillment',
            });
        }
        catch (e) {
            log.error({
                title: 'SPS Fulfillment Button',
                details: "Could not add SPS Fulfillment Button due to the following error: " + JSON.stringify(e),
            });
        }
        deepLinkLogger.executionFinished();
    }
    function addSpsStandardButtonSet(ctx, ifRecId, customerId, betaNewPackingUiFeatureFlag) {
        addSpsPackingButtons(ctx, betaNewPackingUiFeatureFlag);
        addStandardSpsBatchLabelButton(ctx);
        addStandardSpsAsnButton(ctx, true);
        addStandardSpsPackingSlipButton(ctx, ifRecId, customerId);
    }
    function beforeLoad(ctx) {
        var buildPackageTabTimer = sciptExecutionLogger.newExecutionContext('buildPackageTab');
        var companyConfigRecord = config.load({ type: config.Type.COMPANY_PREFERENCES });
        var asnEnabled = companyConfigRecord.getValue({ fieldId: 'custscript_sps_asn_enable_flag' });
        var betaNewPackingUiFeatureFlag = companyConfigRecord.getValue({ fieldId: 'custscript_sps_new_pack_ui_flag' });
        buildPackageTab(ctx, asnEnabled, betaNewPackingUiFeatureFlag);
        buildPackageTabTimer.executionFinished();
        var customerId = ctx.newRecord.getValue({ fieldId: 'entity' });
        if (ctx.type === ctx.UserEventType.VIEW) {
            if (asnEnabled) {
                var buttonSetupLogger = sciptExecutionLogger.newExecutionContext('Standard Button Setup');
                ctx.form.clientScriptModulePath = './sps_cs_item_fulfillment_sweetAlert';
                var ifRecId = ctx.newRecord.id;
                // Obtain Default Pack Source
                var packageSource = ctx.newRecord.getValue({ fieldId: 'custbody_sps_package_data_source' }) || sps_lib_packdata_1.getDefaultPackageSource(customerId);
                var packageSourceStr = sps_lib_packdata_1.getPackageSourceString(packageSource);
                log.debug('packageSourceStr', packageSourceStr);
                switch (packageSourceStr) {
                    case sps_lib_packdata_interfaces_1.PackageSourceString.NativeNetsuite: // native NS should suppot Packing Slip only via buttons
                        addStandardSpsPackingSlipButton(ctx, ifRecId, customerId);
                        break;
                    case sps_lib_packdata_interfaces_1.PackageSourceString.NetsuiteShipCentral:
                        addStandardSpsPackingSlipButton(ctx, ifRecId, customerId);
                        addSpsShipCentralButtons(ctx, ifRecId);
                        break;
                    case sps_lib_packdata_interfaces_1.PackageSourceString.NetsuiteWms:
                        addStandardSpsBatchLabelButton(ctx);
                        addStandardSpsPackingSlipButton(ctx, ifRecId, customerId);
                        addStandardSpsAsnButton(ctx, true);
                        break;
                    case sps_lib_packdata_interfaces_1.PackageSourceString.PacejetWms:
                        addStandardSpsBatchLabelButton(ctx);
                        addStandardSpsPackingSlipButton(ctx, ifRecId, customerId);
                        addStandardSpsAsnButton(ctx, false);
                        addSpsPacejetWmsButtons(ctx, ifRecId);
                        break;
                    case sps_lib_packdata_interfaces_1.PackageSourceString.SPS:
                    default:
                        addSpsStandardButtonSet(ctx, ifRecId, customerId, betaNewPackingUiFeatureFlag);
                        break;
                }
                var viewCsvListUrl = url.resolveScript({
                    scriptId: 'customscript_sps_sl_view_csv_list',
                    deploymentId: 'customdeploy_sps_sl_view_csv_list',
                });
                ctx.form.addPageLink({
                    type: serverWidget.FormPageLinkType.BREADCRUMB,
                    url: viewCsvListUrl,
                    title: 'Search SPS ASN CSV Files',
                });
                buttonSetupLogger.executionFinished();
                var recType = ctx.newRecord.type;
                if (recType && ifRecId) {
                    // if we know record type and the record id exists, we can try to add deep linking
                    addDeepLinkingButton(ctx);
                }
            }
        }
        else {
            var packageSourceLogger = sciptExecutionLogger.newExecutionContext('Package Source Setup');
            var currentPackageDataSource = ctx.newRecord.getValue({ fieldId: 'custbody_sps_package_data_source' });
            if (!currentPackageDataSource) {
                var defaultPackageSource = sps_lib_packdata_1.getDefaultPackageSource(customerId);
                if (defaultPackageSource) {
                    ctx.newRecord.setValue({ fieldId: 'custbody_sps_package_data_source', value: defaultPackageSource });
                }
            }
            packageSourceLogger.executionFinished();
        }
        sciptExecutionLogger.logAllExecutionTimes();
    }
    return { beforeLoad: beforeLoad };
});
