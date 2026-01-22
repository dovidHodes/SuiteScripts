/**
 *@NApiVersion 2.1
 *@NScriptType Suitelet
 */
define(['N/record'], (record) => {

    function onRequest(context) {
        const request = context.request;
        const response = context.response;

        const recId = request.parameters.recordId;
        const recType = request.parameters.recordType;

        if (!recId || !recType) {
            response.write('Missing record ID or type.');
            return;
        }

        try {
            const rec = record.load({
                type: recType,
                id: recId
            });

            rec.setValue({
                fieldId: 'custbody_approved_to_send_edi',
                value: true
            });

            rec.save();

            response.write('Record successfully approved to send EDI.');

        } catch (e) {
            log.error('Suitelet Error', e);
            response.write('Error processing record: ' + e.message);
        }
    }

    return { onRequest };

});
