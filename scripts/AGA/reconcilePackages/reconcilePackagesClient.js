/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
define(['N/url', 'N/ui/message', 'N/log', 'N/currentRecord'], (url, message, log, currentRecord) => {

    function pageInit(context) {
        try { log.debug('ClientScript', 'Reconcile Packages Client Script loaded successfully.'); } catch (e) {}
    }

    function callReconcilePackages(recordId, recordType) {
        try {
            var rec = currentRecord.get();
            var type = recordType || (rec && rec.type);
            if (!recordId || !type) {
                alert('Record not available.');
                return;
            }

            var processingMsg = message.create({
                title: 'Reconciling Packages',
                message: 'Reconciling packages please wait...',
                type: message.Type.INFORMATION
            });
            try { processingMsg.show(); } catch (e) {}

            var u = url.resolveScript({
                scriptId: 'customscript_reconcile_packages_suitelet',
                deploymentId: 'customdeploy_reconcile_packages_suitelet',
                returnExternalUrl: false,
                params: { recordId: String(recordId), recordType: String(type) }
            });

            // Use XHR when available; fallback to navigation with redirect
            try {
                if (window.fetch) {
                    fetch(u, { method: 'GET', credentials: 'same-origin' })
                        .then(function(res) { return res.text().then(function(text){ return { ok: res.ok, text: text }; }); })
                        .then(function(result) {
                            try { processingMsg.hide(); } catch (_) {}
                            if (result.ok && result.text && !result.text.includes('Error')) {
                                var successMsg = message.create({
                                    title: 'Success',
                                    message: result.text || 'Packages reconciled successfully.',
                                    type: message.Type.CONFIRMATION
                                });
                                try { successMsg.show(); } catch (_) {}
                                location.reload();
                            } else {
                                var errMsg = message.create({
                                    title: 'Reconciliation Failed',
                                    message: result.text || 'Failed to reconcile packages.',
                                    type: message.Type.ERROR
                                });
                                try { errMsg.show(); } catch (_) {}
                            }
                        })
                        .catch(function(err){
                            try { processingMsg.hide(); } catch (_) {}
                            var errMsg = message.create({
                                title: 'Reconciliation Failed',
                                message: 'An error occurred while reconciling packages.',
                                type: message.Type.ERROR
                            });
                            try { errMsg.show(); } catch (_) {}
                        });
                } else {
                    window.location = u + '&redirect=T';
                }
            } catch (_) {
                window.location = u + '&redirect=T';
            }
        } catch (e) {
            try { log.error('callReconcilePackages Error', e); } catch (_) {}
            alert('Error occurred: ' + (e && e.message ? e.message : 'Unable to reconcile packages.'));
        }
    }

    return { pageInit: pageInit, callReconcilePackages: callReconcilePackages };
});

