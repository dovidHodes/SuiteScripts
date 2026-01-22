/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/task', 'N/record', 'N/log', 'N/query', 'N/search'], function (task, record, log, query, search) {

function runSearch(poNumber) {
       var s = search.create({
      type: 'transaction',
      filters: [
        ['type','anyof','VendBill','Check'],'AND',
        ['mainline','is','F'],'AND',
        ['taxline','is','F'],'AND',
        ['memo','contains', poNumber] // line memo contains PO number
      ],
      columns: [
        search.createColumn({ name: 'internalid' }),     // vendor_txn_id
        search.createColumn({ name: 'line' }),  // expense_line (stable line id)
        search.createColumn({ name: 'type' }),           // txn_type
      ]
    });

        var results = [];
        s.run().each(function(r) {
            results.push({
                vendor_txn_id: r.getValue({ name: 'internalid'}),
                expense_line: r.getValue({ name: 'line'}),
                txn_type: r.getText({ name: 'type'})
          
            });
            return true;
        });

        return results;
    }
   

  
    function afterSubmit(context) {
        try {
            if (context.type !== context.UserEventType.CREATE &&
                context.type !== context.UserEventType.EDIT) {
                return;
            }

         
            var rec = record.load({
                type: record.Type.ITEM_RECEIPT,
                id: context.newRecord.id,
                isDynamic: false
            });
           // --- Manual override check ---
          var manualOverride = rec.getValue('custbody_manual_lc_calc');
          if (manualOverride) {
               log.audit('Manual override enabled', 'Skipping landed cost automation');
               return;
            }      

            let linkedExepnses = query.runSuiteQL(`
            -- SuiteQL: Get all costs linked to an Item Receipt via PO reference
            -- SuiteQL: Get all costs linked to an Item Receipt via PO reference
             SELECT DISTINCT vendor_txn_id, expense_line, txn_type, purchaseorder_number  FROM (SELECT DISTINCT
                ir.id                 AS itemreceipt_id,
                ir.tranid             AS itemreceipt_number,
                irl.item              AS IRL_line,
                po.id                 AS purchaseorder_id,
                po.tranid             AS purchaseorder_number,
                txn.id                AS vendor_txn_id,
                txn.tranid            AS vendor_txn_number,
                txn.type              AS txn_type,
                exp.id                AS expense_line,
            --   exp.account          AS expense_account,
                exp.memo AS expense_description,
                exp.rate AS expense_amount,
            i.itemid,
            irl.quantity,
            iritem.custitemunits_per_carton AS unitsPerCarton,
            iritem.custitemcustitem_carton_cbf AS cbmPerUnit,
            iritem.cost AS purchasePrice
            FROM
                transaction ir
            JOIN transactionline irl
                ON ir.id = irl.transaction
            JOIN transaction txn
                ON (txn.type IN ('VendBill', 'Check'))  -- Vendor Bills or Checks
            JOIN transactionline exp
                ON txn.id = exp.transaction
            JOIN transaction po
                ON irl.createdfrom = po.id
            JOIN item i on i.id = exp.item
            JOIN item iritem on iritem .id = irl.item
            WHERE
                ir.type = 'ItemRcpt'
                AND exp.memo LIKE '%' || po.tranid || '%'
                AND ir.id = ${context.newRecord.id}
            AND irl.item IS NOT NULL AND irl.quantity IS NOT NULL
            ORDER BY exp.item)`).asMappedResults();

            // take ach expense, and allocate them between the lines, ad ofr each line I want toput that alloctaed expense into its expnense sublist
            // get all bills
            // divide the expense by type
            // 
          const vendBills = [];
            const checks = [];
log.debug('linkedexpenses',linkedExepnses)
            for (const item of linkedExepnses) {
                // let relatedValues = runSearch(item.purchaseorder_number);
               //  log.debug('related values', relatedValues);
                 if (item.txn_type === "VendBill") {
                   vendBills.push(item);
                } else if (item.txn_type === "Check") {
               checks.push(item);
                }
             }

            log.debug('linedExp', linkedExepnses);
         //  divide linked expenses into bills and checks
          const vendorMap = {};
           for (const item of vendBills) {
               if (!vendorMap[item.vendor_txn_id]) {
                   vendorMap[item.vendor_txn_id] = [];
                }
            vendorMap[item.vendor_txn_id].push(item);
           }

          log.debug('vendBills', vendBills)
          // Step 2: Nested loop over all ids and their lines
 for (const vendorId in vendorMap) {
  const billRec = record.load({
    type: record.Type.VENDOR_BILL,
    id: vendorId,
    isDynamic: true
  });

  const poNumbers = [...new Set(vendorMap[vendorId].map(item => item.purchaseorder_number))];
   log.debug(poNumbers);
  const lineCount = billRec.getLineCount({ sublistId: 'item' });

  for (let i = 0; i < lineCount; i++) {
    const memoVal = billRec.getSublistValue({
      sublistId: 'item',
      fieldId: 'description',
      line: i
    }) || '';

    const matchPO = poNumbers.find(po => memoVal.includes(po));
        if (matchPO) {
          log.debug('matchpo')
      billRec.selectLine({ sublistId: 'item', line: i });
      billRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_related_ir',
        value: context.newRecord.id
      });
      billRec.commitLine({ sublistId: 'item' });
      log.debug('Linked IR', `Vendor Bill ${vendorId}, line ${i + 1}, PO match: ${matchPO}`);
    }
  }

  billRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
}


          const checkMap = {};
           for (const item of checks) {
               if (!checkMap[item.vendor_txn_id]) {
                   checkMap[item.vendor_txn_id] = [];
                }
            checkMap[item.vendor_txn_id].push(item);
           }

          // Step 2: Nested loop over all ids and their lines
 
 for (const checkId in checkMap) {
  try {
    log.debug('checkid',checkId)
    const checkRec = record.load({
      type: record.Type.CHECK,
      id: checkId,
      isDynamic: true
    });

 let poNumbers = [...new Set(checkMap[checkId].map(item => item.purchaseorder_number))];

if (typeof poNumbers === 'string') {
  poNumbers = JSON.parse(poNumbers);
}

var cleanPOs = (Array.isArray(poNumbers) ? poNumbers : [poNumbers])
  .map(po => po.toUpperCase().trim());
log.debug('cleande pos',cleanPOs);
var lineCount = checkRec.getLineCount({ sublistId: 'item' });
for (let i = 0; i < lineCount; i++) {
  log.debug('i',i);
  var memoVal = checkRec.getSublistValue({
    sublistId: 'item',
    fieldId: 'description',
    line: i
  }) || ''//).toUpperCase().trim();
log.debug('memo',memoVal);
  const matchPO = cleanPOs.find(po => memoVal.includes(po));
  if (matchPO) {
    log.debug('PO Match Found', { matchPO, memoVal });
    checkRec.selectLine({ sublistId: 'item', line: i });
    checkRec.setCurrentSublistValue({
      sublistId: 'item',
      fieldId: 'custcol_related_ir',
      value: context.newRecord.id
    });
    checkRec.commitLine({ sublistId: 'item' });
  }
}


    const savedId = checkRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
    log.audit('Updated Check', { checkId: savedId });

  } catch (err) {
    log.error('Failed updating check', { checkId, err });
  }
}



const idSet = new Set([
      ...Object.keys(vendorMap),
      ...Object.keys(checkMap)
    ]);
    const allTxnIds = Array.from(idSet);

    if (allTxnIds.length === 0) {
      log.audit('afterSubmit', 'No Vendor Bills or Checks to process — skipping MR');
      return;
    }
          log.debug('TxnIds',allTxnIds);
          log.debug('JSON',JSON.stringify(allTxnIds));

    //  Submit ONE MR with an array param
    // Add a Long Text parameter on the MR named "custscript_ir_ids"
    const t = task.create({
      taskType: task.TaskType.MAP_REDUCE,
      scriptId: 'customscript_aw_mr_landed_cost_automatio',
      deploymentId: 'customdeploy_aw_mr_landed_cost_automati',
      params: {
        custscript_ir_id: JSON.stringify(allTxnIds) // <-- single param with array
      }
    });

      var taskId = t.submit();
      log.audit('LandedCost MR Submitted', { taskId: taskId, billId: allTxnIds });   
          
        } catch (e) {
            log.error('Error in afterSubmit - Landed Cost', e);
        }

               
             
  
    }



    return {
        afterSubmit: afterSubmit
    };
});