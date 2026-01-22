/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
 define(['N/url', 'N/ui/message', 'N/log', 'N/currentRecord'], (url, message, log, currentRecord) => {

     function pageInit(context) {
         try { log.debug('ClientScript', 'EDI Toggle Client Script loaded successfully.'); } catch (e) {}
     }

     function callAutoApprove(recordId, recordType) {
         try {
             var rec = currentRecord.get();
             var type = recordType || (rec && rec.type);
             if (!recordId || !type) {
                 alert('Record not available.');
                 return;
             }

             var processingMsg = message.create({
                 title: 'Toggling EDI Approval',
                 message: 'Please wait while we update approval status...',
                 type: message.Type.INFORMATION
             });
             try { processingMsg.show(); } catch (e) {}

             var u = url.resolveScript({
                 scriptId: 'customscript_toggle_edi_suitelet',
                 deploymentId: 'customdeploy_toggle_edi_suitelet',
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
                             if (result.ok) {
                                 location.reload();
                             } else {
                                 var errMsg = message.create({
                                     title: 'Toggle Failed',
                                     message: result.text || 'Failed to toggle EDI approval.',
                                     type: message.Type.ERROR
                                 });
                                 try { errMsg.show(); } catch (_) {}
                             }
                         })
                         .catch(function(){ window.location = u + '&redirect=T'; });
                 } else {
                     window.location = u + '&redirect=T';
                 }
             } catch (_) {
                 window.location = u + '&redirect=T';
             }
         } catch (e) {
             try { log.error('callAutoApprove Error', e); } catch (_) {}
             alert('Error occurred: ' + (e && e.message ? e.message : 'Unable to toggle EDI approval.'));
         }
     }

     return { pageInit: pageInit, callAutoApprove: callAutoApprove };
 });
