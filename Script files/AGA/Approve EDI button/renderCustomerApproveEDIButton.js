/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(['N/record'], (record) => {

    function beforeLoad(context) {
        if (context.type !== context.UserEventType.VIEW) return;

        const rec = context.newRecord;
        const form = context.form;
        const customerId = rec.getValue('entity');
        const isApproved = rec.getValue('custbody_approved_to_send_edi');

        if (!customerId) return;

        // Load customer to check relevant field
        const custRec = record.load({
            type: record.Type.CUSTOMER,
            id: customerId
        });

        const showButtonIF = !custRec.getValue('custentity_auto_approve_856');
        const showButtonINV = !custRec.getValue('custentity_auto_approve_810');

        const recType = rec.type;
        let shouldShowButton = false;

        if (recType === record.Type.ITEM_FULFILLMENT && showButtonIF) {
            shouldShowButton = true;
        }
        if (recType === record.Type.INVOICE && showButtonINV) {
            shouldShowButton = true;
        }

        const buttonText = isApproved ? 'EDI Approved' : 'Approve EDI';

        if (shouldShowButton) {
            form.clientScriptModulePath = './ediToggleClient.js';
            form.addButton({
                id: 'custpage_autoapprove_btn',
                label: buttonText,
                functionName: "callAutoApprove(" + rec.id + ", '" + rec.type + "')"
            });
        }
    }

    return { beforeLoad };

});
