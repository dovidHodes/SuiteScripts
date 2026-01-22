/**
 * @NApiVersion 2.x
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/search', 'N/email', 'N/runtime', 'N/log'],
    function (record, search, email, runtime, log) {

        function afterSubmit(context) {
            try {

                var soRec = context.newRecord;
                var soId = soRec.id;
                
                var entityId = soRec.getValue({ fieldId: 'entity' });
                var poNumber = soRec.getValue({ fieldId: 'otherrefnum' });
                var customerName = soRec.getText('entity');

                log.debug("Got SO with PO: " + poNumber);

                // Map SO customer entity ID to marketplace ID
                var entityMarketplaceMap = {
                    '119': '1',   //Home Depot
                    '546': '9',   //target
                    '5968': '5',  //Lowe's S2S
                    '122': '5',   //Lowe's 
                    '545': '14'    //Menards
                };

                if (!entityMarketplaceMap.hasOwnProperty(entityId)) return;

                var marketplaceId = entityMarketplaceMap[entityId];
                var lineCount = soRec.getLineCount({ sublistId: 'item' });
                log.debug("Was entity: " + customerName);

                for (var i = 0; i < lineCount; i++) {
                    var itemId = soRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });
                    var itemName = soRec.getSublistText({
                        sublistId: 'item',
                        fieldId: 'item',
                        line: i
                    });

                    var rate = parseFloat(soRec.getSublistValue({
                        sublistId: 'item',
                        fieldId: 'rate',
                        line: i
                    }));

                    log.debug("Item ID: " + itemId);
                    log.debug("Item rate: " + rate);

                    if (isNaN(rate)) continue;

                    // Search marketplace listings for this marketplace + item
                    var listingSearch = search.create({
                        type: 'customrecord_marketplacelisting',
                        filters: [
                            ['custrecord_marketplace_marketplace', 'anyof', marketplaceId],
                            'AND',
                            ['custrecord_marketplaceitem', 'anyof', itemId]
                        ],
                        columns: ['custrecord_merchant_cost', 'name']
                    });

                    var results = listingSearch.run().getRange({ start: 0, end: 1 });

                    if (results.length === 0) continue;

                    var merchantCostRaw = results[0].getValue({
                        name: 'custrecord_merchant_cost'
                    });

                    var name = results[0].getValue({
                        name: 'name'
                    });
                    log.debug("Found listing with name " + name);
                    if (!merchantCostRaw || isNaN(parseFloat(merchantCostRaw))) {
                        continue; // Skip if merchant cost is empty or invalid
                    }

                    var merchantCost = parseFloat(merchantCostRaw);

                    if (Math.abs(rate - merchantCost) > 0.04) {
                        log.debug("Rate does not match, sending email");


                        email.send({
                            author: 562057,
                            recipients: ['d.hodes@agaimport.com', 'e.klein@agaimport.com'], 
                            subject: 'Rate Mismatch on Sales Order ' + poNumber + "(" + customerName + ")",
                            body:
                                'Mismatch rate on Sales Order:\n\n' +
                                'PO Number: ' + poNumber + '\n' +
                                'Customer: ' + customerName + '\n' +
                                'Item: ' + itemName + '\n' +
                                'Rate on Sales Order: ' + rate + '\n' +
                                'Expected Merchant Cost: ' + merchantCostRaw
                        });
                        //break; // Stop after first mismatch. Remove to continue checking all lines.
                    }
                }

            } catch (e) {
                log.error('Rate Check Error', e.toString());
            }
        }

        return {
            afterSubmit: afterSubmit
        };
    });
