/**
 *@NApiVersion 2.0
 *@NModuleScope SameAccount
 *@NScriptType UserEventScript
 *@NAmdConfig ./module_config.json
 */
define(["require", "exports", "N/ui/serverWidget", "N/log", "./lib/sps_lib_features", "N/runtime"], function (require, exports, serverWidget, log, spsLibFeatures, runtime) {
    function beforeLoad(context) {
        if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT || context.type === context.UserEventType.COPY) {
            if (spsLibFeatures.isAutopackEnabled() && runtime.isFeatureInEffect({ feature: 'UNITSOFMEASURE' })) {
                try {
                    var currentRecord = context.newRecord;
                    var form = context.form;
                    log.debug('currentRecord', currentRecord.type);
                    // eslint-disable-next-line no-unused-vars
                    var field = form.addField({ id: 'custpage_units_field', type: serverWidget.FieldType.SELECT, label: 'Units', source: '-221' });
                    //Here is where we could inject the ClientScript
                }
                catch (e) {
                    log.debug('Error in BeforeLoad UpdateStatus Create', e.message);
                }
            }
        }
    }
    return { beforeLoad: beforeLoad };
});
