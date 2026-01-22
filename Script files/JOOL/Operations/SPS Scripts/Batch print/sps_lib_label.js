define(["require", "exports", "N/log", "N/record", "N/error", "N/search", "N/file", "./openSource/handebar_lib2", "./sps_lib_rest_label_xml_temp", "./sps_lib_label_map_override", "./sps_lib_packdata", "./sps_lib_subsidiary", "./sps_lib_packdata_interfaces", "N/config", "N/url", "./sps_lib_label_searches"], function (require, exports, log, record, error, search, file, handlebar, spsLabelTemp, mappingOverride, spsLibPackdata, spsLibSubsidiary, sps_lib_packdata_interfaces_1, config, url, sps_lib_label_searches_1) {
    function getExtensionDigit(itemFulfillments) {
        if (itemFulfillments.length !== 1) {
            // not setup to handle multiple IFs for this
            var multipleIfError = error.create({
                message: 'SPS Label scripting does not support multiple Item Fulfillments for Label scripting',
                name: 'SPS Label Extension Digit Error',
                notifyOff: true,
            });
            throw multipleIfError;
        }
        //get customer rec from IF
        var numberExtensionDigit = search.lookupFields({
            type: search.Type.ITEM_FULFILLMENT,
            id: itemFulfillments[0],
            columns: 'customer.custentity_sps_sscc_ext_digit',
        });
        var extensionDigit = numberExtensionDigit['customer.custentity_sps_sscc_ext_digit'].toString();
        var extensionMessage;
        if (extensionDigit) {
            extensionMessage = "Using custom extension digit from customer record. Extension Digit: " + extensionDigit + " ";
        }
        else {
            extensionDigit = '0';
            extensionMessage = "No custom extension digit set in customer record, so using 0 as extension digit by default";
        }
        log.debug('Extension Digit Info', extensionMessage);
        return extensionDigit;
    }
    function logXmlRecordForTesting(xmlRecord, fileName) {
        var folderId;
        var folderSearchObj = search.create({
            type: 'folder',
            filters: [['name', 'is', 'SPSDebug']],
            columns: ['numfiles'],
        });
        folderSearchObj.run().each(function (result) {
            folderId = result.id;
            return false;
        });
        if (!folderId) {
            log.debug('FOLDER_NOT_FOUND', 'no SPS Debug Folder Exists');
            return;
        }
        if (!xmlRecord) {
            log.debug('SPS Debug Error', 'XML not passed to debug process');
            return;
        }
        var labelFile = file.create({
            fileType: file.Type.XMLDOC,
            name: fileName + ".xml",
            folder: folderId,
            description: 'SPS Label API Debug File',
            contents: "" + xmlRecord,
        });
        var fileId = labelFile.save();
    }
    function spsBuildFileName(tranId, currentCount, finalCount, packageId) {
        // TODO: updates for SOTPI naming for Pallet batch request files.
        var transactionName = search.lookupFields({
            type: search.Type.TRANSACTION,
            id: tranId,
            columns: 'tranid',
        });
        if (packageId) {
            var labelFileName = transactionName.tranid + "_Label_for_Package_" + packageId;
            return labelFileName;
        }
        else {
            var labelFileName = transactionName.tranid + "_Label_" + currentCount + "_Of_" + finalCount;
            return labelFileName;
        }
    }
    function getLabelRecObj() {
        var compLabelSettings = search.lookupFields({
            type: 'customrecord_sps_label_access',
            id: 1,
            columns: ['custrecord_sps_label_login_token', 'custrecord_uccuid', 'custrecord_sps_label_login_mfgid'],
        });
        return compLabelSettings;
    }
    function setSellByDate(date, labelId) {
        if (!mappingOverride.labelOverrideObj[labelId]) {
            // Label does not require formatting, return the date as it is originally formatted
            return date;
        }
        if (mappingOverride.labelOverrideObj[labelId].FieldFormat.hasOwnProperty('SellByDate')) {
            // Format Lot Expiration date MM/DD/YYYY into SellByDate YYMMDD
            var formattedDate = mappingOverride.labelOverrideObj[labelId].FieldFormat.SellByDate;
            var yearStr = date.slice(-2);
            var monthStr = date.slice(0, 2);
            var dayStr = date.slice(3, 5);
            formattedDate = formattedDate.replace('YY', yearStr);
            formattedDate = formattedDate.replace('MM', monthStr);
            formattedDate = formattedDate.replace('DD', dayStr);
            return formattedDate;
        }
    }
    function getLabelResultObj(itemFulfillmentIds, itemFulfillmentObj, packageObj, labelSettings, labaelPerArr, defaultPackSource) {
        var labelLimitPerRequest = labaelPerArr;
        var _a = getManIdAndLabelOffset(labelSettings, itemFulfillmentIds), labelOffest = _a.labelOffest, mfgId = _a.mfgId;
        log.debug('labelOffset', labelOffest);
        var companyConfigRec = config.load({ type: config.Type.COMPANY_PREFERENCES });
        var isSellByDateEnabled = companyConfigRec.getValue({ fieldId: 'custscript_sps_label_sellby_date' });
        log.debug('Is Sell by Date Enabled?', isSellByDateEnabled);
        var packages = packageObj;
        // TODO: Update id below to not be hardcoded before going live
        var labelXmlTemp = spsLabelTemp.xmlTemplate;
        var spsLabelXml = handlebar.compile(labelXmlTemp, { compat: true });
        // Add error handling for SSCC length here
        if (packages.length < 1) {
            var noPackErr = error.create({
                name: 'MISSING_DATA',
                message: 'No package data found. Please pack items before generating labels',
                notifyOff: true,
            });
            throw noPackErr;
        }
        var fulfillmentInfo = search.lookupFields({
            type: search.Type.ITEM_FULFILLMENT,
            id: itemFulfillmentIds[0],
            columns: ['custbody_sps_trans_carton_ct', 'custbody_sps_package_data_source'],
        });
        var cartonCount = "" + packages.length;
        //if there is only one package, it's likely that the print individual label URL was selected, so to get an accurate count of the total number of
        // cartons, use the carton count on the item fulfillment rather than from the total number of packages in the packages object
        if (packages.length == 1) {
            cartonCount = fulfillmentInfo.custbody_sps_trans_carton_ct ? fulfillmentInfo.custbody_sps_trans_carton_ct : "" + packages.length;
        }
        var packageSourceStr = defaultPackSource || sps_lib_packdata_interfaces_1.PackageSourceString.SPS;
        if (fulfillmentInfo.custbody_sps_package_data_source[0]) {
            var packageSource = fulfillmentInfo.custbody_sps_package_data_source[0].value.toString();
            packageSourceStr = spsLibPackdata.getPackageSourceString(packageSource);
        }
        var labelArr = [];
        var shipping_xml_header = '<ShippingLabels>\n';
        var updatedPackageArr = [];
        var responseArr = [];
        for (var pageStart = 0; pageStart < packages.length; pageStart += labelLimitPerRequest) {
            var shipping_xml_body = null;
            var shipping_xml = null;
            var _loop_1 = function (i) {
                var currentPackage = packages[i];
                var itemFulfillmentId = currentPackage.itemFulfillmentId;
                var mixedPack = false;
                var mixedLotPack = false;
                if (currentPackage.items.length > 1) {
                    mixedLotPack = true;
                    for (var i_1 = 0; i_1 < currentPackage.items.length; i_1++) {
                        if (currentPackage.items[0].itemFulfillmentLine !== currentPackage.items[i_1].itemFulfillmentLine) {
                            //there are different items in this package, set the mixedPack to true and break out
                            mixedPack = true;
                            break;
                        }
                    }
                }
                var currentLineId = currentPackage.items[0].itemFulfillmentLine;
                var itemFulfillmentKey = itemFulfillmentId + "^" + currentLineId;
                var currentItemFulfilObj = itemFulfillmentObj[itemFulfillmentKey];
                if (!currentItemFulfilObj) {
                    spsLibPackdata.invalidIFLineNumberError(currentLineId, currentPackage.cartonIndex, 'Label', packageSourceStr, itemFulfillmentId, currentPackage.spsPackageId, currentPackage.items[0].spsPackageContentId);
                }
                var currentPackageLabelId = currentPackage.labelId || false;
                // create Label ID for each package
                if (!currentPackageLabelId) {
                    if (packageSourceStr === sps_lib_packdata_interfaces_1.PackageSourceString.SPS) {
                        var extensionDigit = getExtensionDigit(itemFulfillmentIds);
                        var packId = currentPackage.spsPackageId;
                        var offset = isFinite(parseInt(labelOffest)) ? labelOffest : 0;
                        var packMaxLen = 16 - mfgId.length;
                        var labelLimitModulo = Math.pow(10, packMaxLen);
                        var uccId = ((Number(packId) + Number(offset)) % labelLimitModulo).toString();
                        // New Extension Digit and update for Ucc Base that removes added zero
                        var uccBase = "" + extensionDigit + mfgId;
                        while (uccBase.length + uccId.toString().length < 17) {
                            uccId = "0" + uccId.toString();
                        }
                        var uccFinal = uccBase + uccId;
                        var uccArr = [0, 0];
                        for (var X = 0; X < uccFinal.length; X++) {
                            uccArr[Math.ceil((X + 1) % 2)] += parseInt(uccFinal.charAt(X));
                        }
                        var checkDigit = (10 - (uccArr[1] * 3 + uccArr[0] - 10 * Math.floor((uccArr[1] * 3 + uccArr[0]) / 10))).toString();
                        var uccChecked = uccFinal.concat(checkDigit === '10' ? '0' : checkDigit);
                        currentPackage.labelId = uccChecked;
                        var updatedPack = record.submitFields({
                            type: 'customrecord_sps_package',
                            id: packId,
                            values: {
                                custrecord_sps_package_ucc: uccChecked,
                            },
                        });
                        updatedPackageArr.push(updatedPack);
                        currentPackageLabelId = uccChecked;
                    }
                    else {
                        var labelIdError = error.create({
                            message: "Required SSCC18 number missing. SPS - " + packageSourceStr + " integration sources the SSCC 18 value from the " + (packageSourceStr === sps_lib_packdata_interfaces_1.PackageSourceString.NetsuiteWms ? 'Autogenerated UCC ID Code (AutoUCCId)' : 'PackShip - Pack Carton') + " record. One or more of these records associated to this IF is missing tracking number(s).",
                            name: "SPS  - " + packageSourceStr + " Integration Error",
                            notifyOff: true,
                        });
                        log.error(labelIdError.name, labelIdError.message);
                        throw labelIdError;
                    }
                }
                if (currentPackageLabelId.length !== 18) {
                    var ssccError = error.create({
                        name: 'Label SSCC-18 Error',
                        message: 'Label SSCC Code is either less or more than 18 digits long. Please make sure label SSCC code is exactly 18 digits',
                        notifyOff: true,
                    });
                    log.error(ssccError.name, ssccError.message);
                    throw ssccError;
                }
                // Check for any overrides in the mapping of the XML for this LabelUID
                var labelId = currentItemFulfilObj.LabelUID;
                if (mappingOverride.labelOverrideObj[labelId]) {
                    var labelOverrideObj_1 = mappingOverride.labelOverrideObj[labelId];
                    if (labelOverrideObj_1.FieldOverrides) {
                        var fieldOverrideArr = Object.keys(labelOverrideObj_1.FieldOverrides);
                        fieldOverrideArr.forEach(function (oField) {
                            if (!currentPackage[oField]) {
                                currentPackage[oField] = currentItemFulfilObj[labelOverrideObj_1.FieldOverrides[oField]];
                                log.debug('Label Sourcing Override', "Label UID: " + labelId + " has sourcing override for " + oField + " to be replaced by data from " + labelOverrideObj_1.FieldOverrides[oField]);
                            }
                        });
                    }
                }
                var labelItem = {
                    BuyerPartNumber: mixedPack ? 'MIXED' : currentItemFulfilObj.BuyerPartNumber,
                    VendorPartNumber: mixedPack ? 'MIXED' : currentItemFulfilObj.VendorPartNumber,
                    GTIN: mixedPack ? 'MIXED' : currentItemFulfilObj.GTIN,
                    UPCCaseCode: mixedPack ? 'MIXED' : currentItemFulfilObj.UPCCaseCode,
                    ShipQty: currentPackage.packageQuantity,
                    ShipQtyUOM: currentItemFulfilObj.ShipQtyUOM,
                    ProductSizeCode: mixedPack ? 'MIXED' : currentItemFulfilObj.ProductSizeCode,
                    ProductSizeDescription: mixedPack ? 'MIXED' : currentItemFulfilObj.ProductSizeDescription,
                    ProductColorCode: mixedPack ? 'MIXED' : currentItemFulfilObj.ProductColorCode,
                    ProductColorDescription: mixedPack ? 'MIXED' : currentItemFulfilObj.ProductColorDescription,
                    ProductWidthDescription: mixedPack ? 'MIXED' : currentItemFulfilObj.ProductWidthDescription,
                    ProductStyleDescription: mixedPack ? 'MIXED' : currentItemFulfilObj.ProductStyleDescription,
                    ProductDescription: mixedPack ? 'MIXED' : currentItemFulfilObj.ProductDescription,
                    Department: currentItemFulfilObj.Department,
                    Class: currentItemFulfilObj.Class,
                    ItemComment1: currentItemFulfilObj.ItemComment1,
                    ItemComment2: currentItemFulfilObj.ItemComment2,
                    ItemFlexField1: currentItemFulfilObj.ItemFlexField1,
                    ItemFlexField2: currentItemFulfilObj.ItemFlexField2,
                    ItemFlexField3: currentItemFulfilObj.ItemFlexField3,
                    ConsumerPackageCode: mixedPack ? 'MIXED' : currentItemFulfilObj.ConsumerPackageCode,
                    InnerPack: mixedPack ? 'MIXED' : currentItemFulfilObj.InnerPack,
                    OuterPack: mixedPack ? 'MIXED' : currentItemFulfilObj.OuterPack,
                };
                var labelPack = {
                    PackSize: currentItemFulfilObj.PackSize,
                    PackWeight: currentPackage.weight,
                    InnerPack: currentPackage.innerPack,
                    OuterPack: currentPackage.outerPack,
                    PackagingCharacteristicCode: currentItemFulfilObj.PackagingCharacteristicCode,
                    PackComment1: currentItemFulfilObj.PackComment1,
                    PackComment2: currentItemFulfilObj.PackComment2,
                    PackFlexField1: currentItemFulfilObj.PackFlexField1,
                    PackFlexField2: currentItemFulfilObj.PackFlexField2,
                    PackFlexField3: currentItemFulfilObj.PackFlexField3,
                    SerialShippingContainerCode: currentPackage.labelId,
                    ShippingContainerCode: currentPackage.trackingNumber,
                    ExpirationDate: mixedPack && currentPackage.items[0].lotExpirationDate ? 'MIXED' : currentPackage.items[0].lotExpirationDate,
                    LotNumber: mixedLotPack && currentPackage.items[0].lotNumber ? 'MIXED' : currentPackage.items[0].lotNumber,
                    QuantityEach: currentPackage.packageQuantity,
                    PackNumberOfUnitsShipped: currentItemFulfilObj.PackNumberOfUnitsShipped,
                    ShipToOrDeliverToPostalCode: currentItemFulfilObj.ShipToOrDeliverToPostalCode,
                    SellByDate: isSellByDateEnabled ? setSellByDate(currentPackage.items[0].lotExpirationDate, labelId) : '',
                    PackagingDescription: currentItemFulfilObj.PackagingDescription,
                    AssignedID: currentItemFulfilObj.AssignedID,
                };
                var labelShipFrom = {
                    ShipFromAddressLocationNumber: currentItemFulfilObj.ShipFromAddressLocationNumber,
                    ShipFromAddressName: currentItemFulfilObj.ShipFromAddressName,
                    ShipFromAddressAlternateName: currentItemFulfilObj.ShipFromAddressAlternateName,
                    ShipFromAddress1: currentItemFulfilObj.ShipFromAddress1,
                    ShipFromAddress2: currentItemFulfilObj.ShipFromAddress2,
                    ShipFromAddress3: currentItemFulfilObj.ShipFromAddress3,
                    ShipFromCity: currentItemFulfilObj.ShipFromCity,
                    ShipFromState: currentItemFulfilObj.ShipFromState,
                    ShipFromPostalCode: currentItemFulfilObj.ShipFromPostalCode,
                    ShipFromCountry: currentItemFulfilObj.ShipFromCountry,
                    ShipFromContactName: currentItemFulfilObj.ShipFromContactName,
                    ShipFromAddressAlternateName2: currentItemFulfilObj.ShipFromAddressAlternateName2,
                };
                var labelShipTo = {
                    ShipToAddressLocationNumber: currentItemFulfilObj.ShipToAddressLocationNumber,
                    ShipToAddressName: currentItemFulfilObj.ShipToAddressName,
                    ShipToAddressAlternateName: currentItemFulfilObj.ShipToAddressAlternateName,
                    ShipToAddress1: currentItemFulfilObj.ShipToAddress1,
                    ShipToAddress2: currentItemFulfilObj.ShipToAddress2,
                    ShipToAddress3: currentItemFulfilObj.ShipToAddress3,
                    ShipToCity: currentItemFulfilObj.ShipToCity,
                    ShipToState: currentItemFulfilObj.ShipToState,
                    ShipToPostalCode: currentItemFulfilObj.ShipToPostalCode,
                    ShipToCountry: currentItemFulfilObj.ShipToCountry,
                    ShipToContactName: currentItemFulfilObj.ShipToContactName,
                    ShipToAddressAlternateName2: currentItemFulfilObj.ShipToAddressAlternateName2,
                };
                var labelAddAddress = {
                    AdditionalAddressLocationNumber: currentItemFulfilObj.AdditionalAddressLocationNumber,
                    AdditionalAddressName: currentItemFulfilObj.AdditionalAddressName,
                    AdditionalAddressAlternateName: currentItemFulfilObj.AdditionalAddressAlternateName,
                    AdditionalAddress1: currentItemFulfilObj.AdditionalAddress1,
                    AdditionalAddress2: currentItemFulfilObj.AdditionalAddress2,
                    AdditionalAddress3: currentItemFulfilObj.AdditionalAddress3,
                    AdditionalCity: currentItemFulfilObj.AdditionalCity,
                    AdditionalState: currentItemFulfilObj.AdditionalState,
                    AdditionalPostalCode: currentItemFulfilObj.AdditionalPostalCode,
                    AdditionalCountry: currentItemFulfilObj.AdditionalCountry,
                    AdditionalContactName: currentItemFulfilObj.AdditionalContactName,
                    AdditionalAddressAlternateName2: currentItemFulfilObj.AdditionalAddressAlternateName2,
                };
                var labelStore = {
                    StoreName: currentItemFulfilObj.StoreName,
                    StoreNumber: currentItemFulfilObj.StoreNumber,
                    StoreAddress1: currentItemFulfilObj.StoreAddress1,
                    StoreAddress2: currentItemFulfilObj.StoreAddress2,
                    StoreCity: currentItemFulfilObj.StoreCity,
                    StoreState: currentItemFulfilObj.StoreState,
                    StorePostalCode: currentItemFulfilObj.StorePostalCode,
                    StoreCountry: currentItemFulfilObj.StoreCountry,
                };
                var labelRequest = {
                    ShipmentIdentification: currentItemFulfilObj.ShipmentIdentification,
                    ShipmentDate: currentItemFulfilObj.ShipmentDate,
                    Vendor: currentItemFulfilObj.Vendor,
                    ShipmentLadingQuantity: currentItemFulfilObj.ShipmentLadingQuantity,
                    CarrierAlphaCode: currentItemFulfilObj.CarrierAlphaCode,
                    CarrierRouting: currentItemFulfilObj.CarrierRouting,
                    BillOfLadingNumber: currentItemFulfilObj.BillOfLadingNumber,
                    CarrierProNumber: currentItemFulfilObj.CarrierProNumber,
                    AppointmentNumber: currentItemFulfilObj.AppointmentNumber,
                    CurrentScheduledDeliveryDate: currentItemFulfilObj.CurrentScheduledDeliveryDate,
                    CurrentScheduledDeliveryTime: currentItemFulfilObj.CurrentScheduledDeliveryTime,
                    CartonCount: currentPackage.cartonIndex,
                    CartonTotal: cartonCount,
                    CarrierEquipmentNumber: currentItemFulfilObj.CarrierEquipmentNumber,
                    Comment1: currentItemFulfilObj.Comment1,
                    Comment2: currentItemFulfilObj.Comment2,
                    Comment3: currentItemFulfilObj.Comment3,
                    Comment4: currentItemFulfilObj.Comment4,
                    Comment5: currentItemFulfilObj.Comment5,
                    FlexField1: currentItemFulfilObj.FlexField1,
                    FlexField2: currentItemFulfilObj.FlexField2,
                    FlexField3: currentItemFulfilObj.FlexField3,
                    ShipFrom: labelShipFrom,
                    ShipTo: labelShipTo,
                    Additional: labelAddAddress,
                    InvoiceNumber: currentItemFulfilObj.InvoiceNumber,
                    PurchaseOrderNumber: currentItemFulfilObj.PurchaseOrderNumber,
                    ReleaseNumber: currentItemFulfilObj.ReleaseNumber,
                    PurchaseOrderDate: currentItemFulfilObj.PurchaseOrderDate,
                    Department: currentItemFulfilObj.Department,
                    Division: currentItemFulfilObj.Division,
                    BusinessFamily: currentItemFulfilObj.BusinessFamily,
                    CustomerAccountNumber: currentItemFulfilObj.CustomerAccountNumber,
                    CustomerOrderNumber: currentItemFulfilObj.CustomerOrderNumber,
                    PromotionDealNumber: currentItemFulfilObj.PromotionDealNumber,
                    OrderStatusCode: currentItemFulfilObj.OrderStatusCode,
                    NumberOfUnitsShipped: currentPackage.packageQuantity,
                    ShipToName: currentItemFulfilObj.ShipToName,
                    Store: labelStore,
                    RecordType: currentItemFulfilObj.RecordType,
                    EventCode: currentItemFulfilObj.EventCode,
                    OuterPack: currentPackage.outerPack,
                    'UPC-ACaseCode': mixedPack ? 'MIXED' : currentItemFulfilObj['UPC-ACaseCode'],
                    'UPC-ACaseCodeText': currentItemFulfilObj['UPC-ACaseCodeText'],
                    Packs: labelPack,
                    Items: labelItem,
                };
                shipping_xml_body += spsLabelXml(labelRequest) + "\n";
                responseArr.push(labelRequest);
            };
            for (var i = pageStart; i < pageStart + labelLimitPerRequest && i < packages.length; i++) {
                _loop_1(i);
            }
            shipping_xml = shipping_xml_header + shipping_xml_body + "</ShippingLabels>";
            labelArr.push(shipping_xml);
        }
        log.debug(updatedPackageArr.length + " Packages were updated", updatedPackageArr);
        return { labelArr: labelArr, responseArr: responseArr };
    }
    function getDefaultLabelUID(itemFulfillmentId) {
        var fulfillmentInfo = search.lookupFields({
            type: search.Type.ITEM_FULFILLMENT,
            id: itemFulfillmentId,
            columns: 'entity',
        });
        var labelSearchFilter = [
            search.createFilter({
                name: 'custrecord_sps_label_config_customer',
                operator: search.Operator.ANYOF,
                values: fulfillmentInfo.entity[0].value,
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
            ],
        });
        var labelUID;
        labelSearch.run().each(function (result) {
            if (result.getValue('custrecord_sps_label_config_default')) {
                labelUID = result.getValue('custrecord_sps_label_uid');
            }
            return true;
        });
        return labelUID;
    }
    function getManIdAndLabelOffset(labelSettings, itemFulfillmentIds) {
        var fulfillmentInfo = search.lookupFields({
            type: search.Type.ITEM_FULFILLMENT,
            id: itemFulfillmentIds[0],
            columns: 'entity',
        });
        var transSubsidiary = spsLibSubsidiary.getTransactionSubsidiary(itemFulfillmentIds[0]);
        var labelAccessRecord = sps_lib_label_searches_1.getLabelAccessObj(transSubsidiary)[0]; // This object is either Subsidiary OR Global Account Label data. Only need to worry about custom overrides from here on out
        var manIdSearchFilter = [['custrecord_sps_man_id_customer', 'anyof', fulfillmentInfo.entity[0].value], 'AND', ['isinactive', 'is', 'F']];
        var manIdSearch = search.create({
            type: 'customrecord_sps_man_id_override',
            filters: manIdSearchFilter,
            columns: [
                search.createColumn({ name: 'internalid', label: 'Record Internal ID' }),
                search.createColumn({
                    name: 'custrecord_sps_man_id_override',
                    sort: search.Sort.ASC,
                }),
                'custrecord_sps_ucc_label_offset_override',
            ],
        });
        var manIdSearchResultCount = manIdSearch.runPaged().count;
        var mfgRecInternalID;
        switch (manIdSearchResultCount) {
            // IF 0 custom overrides exist for this IF record. Then just break out
            case 0: {
                break;
            }
            // IF 1 custom override exists, validate whether the man ID in custom record can be used and update our Label Accces Record
            case 1: {
                var regExp = /^([0-9]){7,10}$/;
                var manufacturerId_1, labelOffset_1;
                manIdSearch.run().each(function (result) {
                    mfgRecInternalID = result.getValue('internalid').toString();
                    manufacturerId_1 = result.getValue('custrecord_sps_man_id_override');
                    labelOffset_1 = result.getValue('custrecord_sps_ucc_label_offset_override');
                    return false;
                });
                if (regExp.test(manufacturerId_1) == false) {
                    var mfgRecUrl = url.resolveRecord({
                        recordType: 'customrecord_sps_man_id_override',
                        recordId: mfgRecInternalID,
                        isEditMode: true,
                    });
                    var manufacturingIDLinkString = '<a href=' + mfgRecUrl + '>' + manufacturerId_1 + '</a>';
                    var manInvalidError = error.create({
                        name: 'INVALID_MANUFACTURING_IDS_DEFINED_FOR_CUSTOMER',
                        message: 'Invalid Manufacturing ID has been found for customer ' +
                            fulfillmentInfo.entity[0].text +
                            ' (' +
                            fulfillmentInfo.entity[0].value +
                            '). Labels will not be able to be created until corrected. ' +
                            manufacturingIDLinkString,
                        notifyOff: true,
                    });
                    throw manInvalidError;
                }
                else {
                    labelAccessRecord.mfgId = manufacturerId_1;
                    labelAccessRecord.labelOffest = labelOffset_1;
                    break;
                }
            }
            default: {
                var multipleManError = error.create({
                    name: 'MULTIPLE_MANUFACTURING_IDS_DEFINED_FOR_CUSTOMER',
                    message: 'Multiple Manufacturing IDs have been found for customer ' +
                        fulfillmentInfo.entity[0].text +
                        ' (' +
                        fulfillmentInfo.entity[0].value +
                        '). Labels will not be able to be created until corrected.',
                    notifyOff: true,
                });
                log.error(multipleManError.name, multipleManError.message);
                throw multipleManError;
            }
        }
        if (!labelAccessRecord.mfgId) {
            var manIdNotDefined = error.create({
                name: 'DEFAULT_MANUFACTURING_ID_NOT_DEFINED',
                message: "The default manufacturing ID could not be found. Labels will not be able to be created until corrected.",
                notifyOff: true,
            });
            log.error(manIdNotDefined.name, manIdNotDefined.message);
            throw manIdNotDefined;
        }
        return labelAccessRecord;
    }
    return { getLabelResultObj: getLabelResultObj, getLabelRecObj: getLabelRecObj, spsBuildFileName: spsBuildFileName, logXmlRecordForTesting: logXmlRecordForTesting, getDefaultLabelUID: getDefaultLabelUID };
});
