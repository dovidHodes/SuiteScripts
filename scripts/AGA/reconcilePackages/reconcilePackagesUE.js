/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * 
 * NOTE: Use this script to flesh out logic: https://6448561.app.netsuite.com/app/common/scripting/script.nl?id=2621&whence=
 */
define(['N/record'], (record) => {
    
    function beforeLoad(context) {
        if (context.type !== context.UserEventType.VIEW) return;

        const rec = context.newRecord;
        const form = context.form;
        
        // TODO: Add your conditions here to determine when to show the button
        // Example conditions (modify as needed):
        // const recordType = rec.type;
        // const shouldShowButton = /* your logic here */;
        
        // For now, showing button on all view records - adjust as needed
        const shouldShowButton = true;
        
        if (shouldShowButton) {
            form.clientScriptModulePath = './reconcilePackagesClient.js';
            
            form.addButton({
                id: 'custpage_reconcile_packages_btn',
                label: 'Reconcile Packages',
                functionName: 'callReconcilePackages(' + rec.id + ', \'' + rec.type + '\')'
            });
        }
    }

    return { beforeLoad };
});

