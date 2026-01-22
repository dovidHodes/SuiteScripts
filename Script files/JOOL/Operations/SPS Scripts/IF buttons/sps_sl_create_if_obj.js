/**
 *@NApiVersion 2.1
 *@NModuleScope SameAccount
 *@NScriptType Suitelet
 */
define(["require", "exports", "N/error", "N/config", "./lib/sps_lib_create_if_obj"], function (require, exports, error, config, ifObjData) {
    function onRequest(ctx) {
        var paramObj = ctx.request.parameters;
        var itemFulfillmentStr = paramObj.id || paramObj.param1;
        var companyConfigRecord = config.load({ type: config.Type.COMPANY_PREFERENCES });
        var asnSearchId = companyConfigRecord.getValue({ fieldId: 'custscript_bf_asn_search' });
        var searchId = paramObj.labelId || asnSearchId;
        var packSource = paramObj.packsourceId;
        if (typeof itemFulfillmentStr === 'string') {
            var itemFulfillmentArr = itemFulfillmentStr.split(',');
            if (itemFulfillmentArr.length > 0) {
                var results = ifObjData.getIfObj(itemFulfillmentArr, searchId, packSource);
                var resultStr = JSON.stringify(results, null, ' ');
                ctx.response.write(resultStr);
            }
            else {
                var myError = error.create({ name: 'MISSING_REQUIRED_QUERY_PARAM', message: 'Query parameter itemFulfillmentIds not specified.' });
                throw myError;
            }
        }
        else {
            var myError = error.create({ name: 'MISSING_REQUIRED_QUERY_PARAM', message: 'Query parameter itemFulfillmentIds not specified.' });
            throw myError;
        }
    }
    return { onRequest: onRequest };
});
