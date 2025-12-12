/**
 * SuiteScript 2.1 - Process Replacement Items (Suitelet)
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
// Modified by David Hodes 3/24/25 to fix logic to set reploc to new line item field, 
// as well as copy over shopify-specific column values
// Modified by David Hodes 7/23/25 to not mark the line we are removing as closed, 
// doing so prevents the line item from getting pushed to JASCI to be deleted, it must be marked closed afterwards
// Modified by David HOdes 8/11/25 to insert the replacement line before the old line, so tit deones t delete the SO in JASCI

define(['N/record', 'N/ui/serverWidget', 'N/url', 'N/log'], function (record, serverWidget, url, log) {

    function onRequest(context) {
        if (context.request.method === 'GET') {
            var recId = context.request.parameters.id;
            executeProcess(recId);

            // Redirect back to the record view
            context.response.sendRedirect({
                type: 'RECORD',
                identifier: 'customtransaction106',
                id: recId
            });
        }
    }

    function executeProcess(recId) {
        log.debug("Running...");
        try {
            var rec = record.load({ type: 'customtransaction106', id: recId });
            var numLines = rec.getLineCount({ sublistId: 'line' });
            var lineUpdated = false;

            for (var i = 0; i < numLines; i++) {
                // Skip if already processed
                if (rec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_reppro', line: i })) continue;

                var soId = rec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_repso', line: i });
                if (!soId) continue;

                var soRec = record.load({ type: record.Type.SALES_ORDER, id: soId });
                var needsSave = false;

                // Replacement record values
                var replLoc = rec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_reploc', line: i });
                var locSwitch = rec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_locsw', line: i });
                var itemToRepl = rec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_itemtorepl', line: i });
                var replItem = rec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_replitem', line: i });
                var replQty = rec.getSublistValue({ sublistId: 'line', fieldId: 'custcol_repqty', line: i });

                // Set SO-level location flags
                if (replLoc) {
                    if (replLoc == 3 || replLoc == '3' || replLoc.toString().toLowerCase().indexOf('amazon') !== -1) {
                        soRec.setValue({ fieldId: 'custbody_send_amzm_fulfill', value: true });
                    }
                    needsSave = true;
                }

                // JASCI modify code if replacing without location switch
                if (!locSwitch && itemToRepl) {
                    if (replLoc == 4 || replLoc == '4' || replLoc.toString().toLowerCase().indexOf('instaship') !== -1) {
                        soRec.setValue({ fieldId: 'custbody_jasci_actioncode', value: "2" });
                        soRec.setValue({ fieldId: 'custbody_jasci_status', value: "1" });
                        soRec.setValue({ fieldId: 'custbody2', value: "2" });
                    }
                }

                // Find original line
                var originalLineNumber = soRec.findSublistLineWithValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    value: itemToRepl
                });

                if (originalLineNumber >= 0 && replItem) {
                    // Mark old line for JASCI deletion
                    soRec.setSublistValue({
                        sublistId: 'item',
                        fieldId: 'custcol_jasci_actioncode_line',
                        line: originalLineNumber,
                        value: "4"
                    });

                    // Insert new line before the old one
                    soRec.insertLine({ sublistId: 'item', line: originalLineNumber });
                    var newLineNumber = originalLineNumber;
                    var shiftedOriginalLineNumber = originalLineNumber + 1;

                    // Rate calculation
                    var origQty = soRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'quantity',
                        line: shiftedOriginalLineNumber
                    });
                    var origRate = soRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'rate',
                        line: shiftedOriginalLineNumber
                    });
                    var newRate = (origQty && origRate && replQty)
                        ? (origRate * origQty / replQty)
                        : origRate;

                    // Set new line fields
                    soRec.setSublistValue({ sublistId: 'item', fieldId: 'item', line: newLineNumber, value: replItem });
                    soRec.setSublistValue({ sublistId: 'item', fieldId: 'quantity', line: newLineNumber, value: replQty });
                    soRec.setSublistValue({ sublistId: 'item', fieldId: 'price', line: newLineNumber, value: -1 });
                    soRec.setSublistValue({ sublistId: 'item', fieldId: 'rate', line: newLineNumber, value: newRate });
                    soRec.setSublistValue({ sublistId: 'item', fieldId: 'custcol_sps_shp_noteinformationfield', line: newLineNumber, value: origRate });
                    soRec.setSublistValue({ sublistId: 'item', fieldId: 'custcol_jasci_actioncode_line', line: newLineNumber, value: "3" });
                    soRec.setSublistValue({ sublistId: 'item', fieldId: 'custcol_sps_spe_noteinformationfield', line: newLineNumber, value: origQty });

                    // Preserve certain fields from old line
                    [
                        'location', 'department', 'class', 'custcol_sps_bpn', 'custcol_sps_linesequencenumber',
                        'custcol_sps_orderqtyuom', 'custcol_sps_purchaseprice', 'custcol_sps_upc',
                        'custcol_sps_vendorpartnumber', 'custcol_in8_shopify_line_id', 'custcol_in8_shop_original_quantity'
                    ].forEach(function (fld) {
                        var val = soRec.getSublistValue({
                            sublistId: 'item',
                            fieldId: fld,
                            line: shiftedOriginalLineNumber
                        });
                        if (val) {
                            soRec.setSublistValue({ sublistId: 'item', fieldId: fld, line: newLineNumber, value: val });
                        }
                    });

                    // If replLoc given, override location
                    if (replLoc) {
                        soRec.setSublistValue({ sublistId: 'item', fieldId: 'location', line: newLineNumber, value: replLoc });
                    }

                    // Mark old line as closed
                    soRec.setSublistValue({ sublistId: 'item', fieldId: 'isclosed', line: shiftedOriginalLineNumber, value: true });

                    needsSave = true;
                }

                // Save SO and mark this replacement record line as processed
                if (needsSave) {
                    soRec.save();
                    rec.setSublistValue({
                        sublistId: 'line',
                        fieldId: 'custcol_reppro',
                        line: i,
                        value: true
                    });
                    lineUpdated = true;
                }
            }

            // Update main record status if any line was processed
            if (lineUpdated) {
                rec.setValue({ fieldId: 'status', value: 'Processed' });
                rec.setValue({ fieldId: 'statusref', value: 'statusB' });
                rec.setValue({ fieldId: 'transtatus', value: 'B' });
                rec.save();
            }

        } catch (e) {
            log.error('executeProcess', e.toString());
        }
    }

    return {
        onRequest: onRequest
    };
});