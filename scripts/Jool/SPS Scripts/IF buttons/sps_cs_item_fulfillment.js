/**
 *@NApiVersion 2.0
 *@NModuleScope SameAccount
 *@NScriptType ClientScript
 */
define(["require", "exports"], function (require, exports) {
    function spsCommerceASN_pageinit(ctx) {
        console.log('sps setting packing slip field to disabled');
        if (ctx.mode !== 'edit')
            return true;
        var packingSlipPdfField = ctx.currentRecord.getField({ fieldId: 'custbody_sps_packing_slip_pdf_link' });
        packingSlipPdfField.isDisabled = true;
        return true;
    }
    function spsCommerceASN_fieldChanged(ctx) {
        if (ctx.fieldId === 'custpage_custlabel') {
            ctx.currentRecord.setValue({
                fieldId: 'custbody_sps_customer_label',
                value: ctx.currentRecord.getValue({ fieldId: 'custpage_custlabel' }),
                ignoreFieldChange: true,
            });
        }
        if (ctx.fieldId === 'custpage_packingslip') {
            ctx.currentRecord.setValue({
                fieldId: 'custbody_sps_packing_slip',
                value: ctx.currentRecord.getValue({ fieldId: 'custpage_packingslip' }),
                ignoreFieldChange: true,
            });
        }
        return true;
    }
    return { pageInit: spsCommerceASN_pageinit, fieldChanged: spsCommerceASN_fieldChanged };
});
