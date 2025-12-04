/**
 *@NApiVersion 2.0
 *@NModuleScope SameAccount
 *@NScriptType ClientScript
 */
define(["require", "exports", "N/search", "./lib/openSource/sweetalert2_min"], function (require, exports, search, sweetalert2_min_1) {
    function fieldChanged(ctx) {
        var packDefRec = ctx.currentRecord;
        var packDefId = packDefRec.id;
        var isInactive = packDefRec.getValue({ fieldId: 'isinactive' });
        var mapReduceFired = packDefRec.getValue({ fieldId: 'custpage_set_mr_executed' });
        console.log('Is Inactive Fired Value: ', isInactive);
        console.log('Map Reduce Fired Value: ', mapReduceFired);
        // Check if Inactive checkbox has been checked
        if (ctx.fieldId === 'isinactive' && isInactive === true) {
            console.log('Inactive checkbox clicked, marked true');
            // Search to find pack rules associated to a package definition
            var customrecord_sps_packRuleSearchObj = search.create({
                type: 'customrecord_sps_pack_qty',
                filters: [['isinactive', 'is', 'F']],
                columns: [
                    search.createColumn({
                        name: 'internalid',
                        label: 'Internal ID',
                    }),
                    search.createColumn({
                        name: 'isinactive',
                        label: 'Inactive',
                    }),
                ],
            });
            if (packDefId) {
                customrecord_sps_packRuleSearchObj.filters.push(search.createFilter({
                    name: 'custrecord_sps_package_type',
                    operator: search.Operator.ANYOF,
                    values: packDefId,
                }));
            }
            var packRulesResultCount = customrecord_sps_packRuleSearchObj.runPaged().count;
            console.log('Pack Rules Count: ', packRulesResultCount);
            if (packRulesResultCount > 0) {
                sweetalert2_min_1.default.fire({
                    title: 'Warning',
                    text: "This package definition is tied to " + packRulesResultCount + " pack rules. Marking this package definition inactive and saving this record will inactivate all of the pack rules. Do you wish to mark inactive?",
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Mark Inactive',
                }).then(function (result) {
                    if (result.isConfirmed) {
                        console.log('User confirmed, marking inactive');
                    }
                    else if (result.dismiss === sweetalert2_min_1.default.DismissReason.cancel) {
                        console.log('User cancelled, not marking inactive');
                        packDefRec.setValue({ fieldId: 'isinactive', value: false });
                    }
                });
            }
        }
    }
    function saveRecord(ctx) {
        var packDefRec = ctx.currentRecord;
        var packDefId = packDefRec.id;
        var isInactive = packDefRec.getValue({ fieldId: 'isinactive' });
        var customrecord_sps_packRuleSearchObj = search.create({
            type: 'customrecord_sps_pack_qty',
            filters: [['isinactive', 'is', 'F']],
            columns: [
                search.createColumn({
                    name: 'internalid',
                    label: 'Internal ID',
                }),
                search.createColumn({
                    name: 'isinactive',
                    label: 'Inactive',
                }),
            ],
        });
        if (packDefId) {
            customrecord_sps_packRuleSearchObj.filters.push(search.createFilter({
                name: 'custrecord_sps_package_type',
                operator: search.Operator.ANYOF,
                values: packDefId,
            }));
        }
        var packRulesResultCount = customrecord_sps_packRuleSearchObj.runPaged().count;
        console.log('Pack Rules Count: ', packRulesResultCount);
        if (packRulesResultCount > 485 && isInactive === true) {
            sweetalert2_min_1.default.fire({
                title: 'Information',
                text: 'Script will take too long to inactivate all the corresponding records, will pass off to Map/Reduce.',
                icon: 'info',
                confirmButtonText: 'Okay',
            }).then(function (result) {
                if (result.isConfirmed) {
                    console.log('Map Reduce is confirmed');
                    return true;
                }
            });
        }
        return true;
    }
    return { fieldChanged: fieldChanged, saveRecord: saveRecord };
});
