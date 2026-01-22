/**
 *@NApiVersion 2.1
 *@NModuleScope SameAccount
 *@NScriptType Suitelet
 */
define(["require", "exports", "N/ui/serverWidget", "N/search", "N/log", "N/record", "./lib/sps_lib_packdata_pacejet", "./lib/sps_lib_packdata_netsuite", "./lib/sps_lib_packdata_shipcentral", "./lib/sps_lib_packdata_interfaces"], function (require, exports, serverWidget, search, log, record, paceJet, packdataNetsuite, packdataShipCentral, sps_lib_packdata_interfaces_1) {
    function createStepOneForm() {
        var myForm = serverWidget.createForm({ title: 'Enable Package Sources - Step 1' });
        myForm.addFieldGroup({ id: 'custpage_group_select', label: 'Select' });
        myForm.addFieldGroup({ id: 'custpage_group_help', label: 'About' });
        myForm.addField({ type: serverWidget.FieldType.INLINEHTML, label: 'About', id: 'custform_help', container: 'custpage_group_help' }).defaultValue = "\n    <div>\n      <p>Your enabled package sources determine where to pull package data for generating Advance Ship Notice documents or shipping labels through the SPS bundle.</p>\n      <p>If field is disabled, this means you do not have that WMS system installed into your account, therefore you cannot select it as an option.</p>\n      <ul>\n          <li>SPS - Data comes from SPS custom records Package and Package Content.</li>\n          <li>NetSuite WMS - Data comes from records created from packing with the NetSuite WMS bundle.</li>\n          <li>Pacejet WMS - Data comes from records created from packing with the Pacejet ADS bundle.</li>\n          <li>NetSuite Ship Central - Data comes from records created from packing with the NetSuite Ship Central bundle.</li>\n          <li>Native NetSuite - Data comes from records created from packing with NetSuite Native Packages</li>\n      </ul>\n    </div>\n  ";
        myForm.addSubmitButton({ label: 'Save & Continue' });
        var customrecord_sps_package_sourceSearchObj = search.create({
            type: 'customrecord_sps_package_source',
            filters: [],
            columns: ['name', 'isinactive', 'custrecord_sps_id_string'],
        });
        var enabledFieldsObj = {};
        customrecord_sps_package_sourceSearchObj.run().each(function (result) {
            var isInactive = result.getValue('isinactive');
            var fieldId = "custpage_enabled_package_sources_" + result.id;
            var label = "" + result.getValue('name');
            log.debug('obj', { fieldId: fieldId, label: label });
            var currentField = myForm.addField({
                id: fieldId,
                label: label,
                type: serverWidget.FieldType.CHECKBOX,
                container: 'custpage_group_select',
            });
            if (isInactive) {
                currentField.defaultValue = 'F';
            }
            else {
                currentField.defaultValue = 'T';
            }
            enabledFieldsObj["" + result.id] = fieldId;
            var wmsCode = result.getValue('custrecord_sps_id_string');
            if (wmsCode === sps_lib_packdata_interfaces_1.PackageSourceString.PacejetWms) {
                var checkVal = paceJet.doesAccountHavePaceJetRec();
                if (checkVal === false) {
                    currentField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
                }
            }
            else if (wmsCode === sps_lib_packdata_interfaces_1.PackageSourceString.NetsuiteWms && !packdataNetsuite.isAvailable()) {
                currentField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            }
            else if (wmsCode === sps_lib_packdata_interfaces_1.PackageSourceString.NetsuiteShipCentral && !packdataShipCentral.isAvailable()) {
                currentField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            }
            return true;
        });
        log.debug('enabledFieldsObj', enabledFieldsObj);
        var objField = myForm.addField({
            id: 'custpage_obj_step_1',
            label: 'Enabled Fields Obj',
            type: serverWidget.FieldType.TEXT,
        });
        objField.defaultValue = JSON.stringify(enabledFieldsObj);
        objField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        return myForm;
    }
    function processFirstStep(ctx) {
        var obj = JSON.parse(ctx.request.parameters.custpage_obj_step_1);
        var spsPackageSourceSearchObj = search.create({
            type: 'customrecord_sps_package_source',
            filters: [],
            columns: ['name', 'isinactive'],
        });
        var enabledIds = [];
        spsPackageSourceSearchObj.run().each(function (result) {
            var currentlyInactive = result.getValue('isinactive');
            var internalId = "" + result.id;
            var currentFieldId = obj[internalId];
            var enable = ctx.request.parameters[currentFieldId];
            if (enable === 'T') {
                enabledIds.push(internalId);
            }
            log.debug('enable', { enable: enable, currentlyInactive: currentlyInactive, currentFieldId: currentFieldId, internalId: internalId });
            if (currentlyInactive && enable === 'T') {
                record.submitFields({ id: internalId, type: 'customrecord_sps_package_source', values: { isinactive: false } });
            }
            else if (!currentlyInactive && enable === 'F') {
                record.submitFields({ id: internalId, type: 'customrecord_sps_package_source', values: { isinactive: true } });
            }
            return true;
        });
        if (enabledIds.length === 1) {
            record.submitFields({ id: enabledIds[0], type: 'customrecord_sps_package_source', values: { isdefault: true } });
        }
    }
    function createStepTwoForm() {
        var myForm = serverWidget.createForm({ title: 'Select Default Package Source - Step 2' });
        myForm.addSubmitButton({ label: 'Save' });
        myForm.addFieldGroup({ id: 'custpage_group_select', label: 'Select' });
        myForm.addFieldGroup({ id: 'custpage_group_help', label: 'About' });
        myForm.addField({ type: serverWidget.FieldType.INLINEHTML, label: 'About', id: 'custform_help', container: 'custpage_group_help' }).defaultValue = "\n    <div>\n      <p>Sets the default system-level package source.  This will be the default value used on the Consolidated ASN page\n      and it populates the Package Source field on an Item Fulfillment if a default is not specified for the customer on the transaction.</p>\n    </div>\n  ";
        var customrecord_sps_package_sourceSearchObj = search.create({
            type: 'customrecord_sps_package_source',
            filters: [['isinactive', 'is', false]],
            columns: ['name', 'custrecord_sps_default'],
        });
        var defaultPackageSourceField = myForm.addField({
            id: 'custpage_default_package_source',
            label: 'Default Package Source',
            type: serverWidget.FieldType.SELECT,
            container: 'custpage_group_select',
        });
        customrecord_sps_package_sourceSearchObj.run().each(function (result) {
            var isDefault = result.getValue('custrecord_sps_default');
            var name = result.getValue('name');
            var selectOption = { value: result.id, text: name };
            defaultPackageSourceField.addSelectOption(selectOption);
            if (isDefault) {
                defaultPackageSourceField.defaultValue = result.id;
            }
            return true;
        });
        return myForm;
    }
    function processSecondStep(ctx) {
        var newDefaultPackageSourceId = ctx.request.parameters.custpage_default_package_source;
        var customrecord_sps_package_sourceSearchObj = search.create({
            type: 'customrecord_sps_package_source',
            filters: [['isinactive', 'is', false]],
            columns: ['name', 'custrecord_sps_default'],
        });
        customrecord_sps_package_sourceSearchObj.run().each(function (result) {
            var isDefault = result.getValue('custrecord_sps_default');
            var internalId = "" + result.id;
            if (isDefault && internalId !== newDefaultPackageSourceId) {
                record.submitFields({ id: internalId, type: 'customrecord_sps_package_source', values: { custrecord_sps_default: false } });
            }
            else if (!isDefault && internalId === newDefaultPackageSourceId) {
                record.submitFields({ id: internalId, type: 'customrecord_sps_package_source', values: { custrecord_sps_default: true } });
            }
            return true;
        });
    }
    function createFinalForm() {
        var myForm = serverWidget.createForm({ title: 'Saved.  Redirecting...' });
        myForm.clientScriptModulePath = './sps_cs_config_package_source';
        var htmlField = myForm.addField({ type: serverWidget.FieldType.INLINEHTML, id: 'custpage_html', label: 'HTML' });
        htmlField.defaultValue = '<p></p>';
        return myForm;
    }
    function onRequest(ctx) {
        log.debug('params', ctx.request.parameters);
        log.debug('Method', ctx.request.method);
        if (ctx.request.method === 'GET') {
            var stepOneForm = createStepOneForm();
            ctx.response.writePage({ pageObject: stepOneForm });
        }
        else if (ctx.request.method === 'POST' && ctx.request.parameters.custpage_obj_step_1) {
            processFirstStep(ctx);
            var stepTwoForm = createStepTwoForm();
            ctx.response.writePage({ pageObject: stepTwoForm });
        }
        else if (ctx.request.method === 'POST' && ctx.request.parameters.custpage_default_package_source) {
            processSecondStep(ctx);
            var finalForm = createFinalForm();
            ctx.response.writePage({ pageObject: finalForm });
        }
    }
    return { onRequest: onRequest };
});
