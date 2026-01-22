/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/log'], (record, log) => {

    const beforeSubmit = (context) => {
        try {
            if (context.type !== context.UserEventType.EDIT) return;

            const rec = context.newRecord;
            const lineCount = rec.getLineCount({ sublistId: 'line' });

            let totalProfit = 0;
            let totalMargin = 0;
            let totalCost = 0;
            let validLines = 0;

            log.debug("LINE COUNT: " + lineCount);

            for (let i = 0; i < lineCount; i++) {
                const amount = parseFloat(rec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'amount',
                    line: i
                })) || 0;

                // ✅ NEW: Get cashback percent or default to 5%
                let cashbackPercent = parseFloat(rec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_cashback',
                    line: i
                }));
                if (isNaN(cashbackPercent)) {
                    cashbackPercent = 5;
                }
                const cashback = amount * (cashbackPercent / 100);

                const bgPaying = parseFloat(rec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_bg_paying',
                    line: i
                })) || 0;

                const qty = parseFloat(rec.getSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_qty',
                    line: i
                })) || 0;

                const profitPerItem = bgPaying - amount + cashback;
                const lineProfit = profitPerItem * qty;
                const profitMargin = amount > 0 ? Math.round((profitPerItem / amount) * 10000) / 100 : 0;

                // Set line-level fields
                rec.setSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_profit_per_item',
                    line: i,
                    value: Math.round(profitPerItem * 100) / 100
                });

                rec.setSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_profit_margin',
                    line: i,
                    value: profitMargin
                });

                rec.setSublistValue({
                    sublistId: 'line',
                    fieldId: 'custcol_total_profit',
                    line: i,
                    value: Math.round(lineProfit * 100) / 100
                });

                // Accumulate totals
                totalProfit += lineProfit;
                totalMargin += profitMargin;
                totalCost += amount * qty;
                validLines++;

                log.debug(`Line ${i}`, {
                    amount,
                    cashbackPercent,
                    cashback,
                    bgPaying,
                    qty,
                    profitPerItem,
                    profitMargin,
                    lineProfit
                });
            }

            const averageMargin = validLines > 0 ? totalMargin / validLines : 0;

            rec.setValue({
                fieldId: 'custbody_total_profit',
                value: Math.round(totalProfit * 100) / 100
            });

            rec.setValue({
                fieldId: 'custbody_proft_margin',
                value: ((Math.round(totalProfit * 100) / 100) / totalCost) * 100
            });

            rec.setValue({
                fieldId: 'custbody_order_total',
                value: totalCost
            });

            // ✅ Always set isNew to false
            rec.setValue({
                fieldId: 'custbody_is_new',
                value: false
            });

            log.debug('Transaction totals', {
                totalProfit,
                averageMargin,
                totalCost
            });

        } catch (e) {
            log.error('Error in beforeSubmit (Profit Calc)', e);
            throw e; // rethrow so NetSuite can handle it if needed
        }
    };

    return { beforeSubmit };
});
