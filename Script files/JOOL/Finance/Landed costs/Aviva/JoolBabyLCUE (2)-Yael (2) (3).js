 /**
  * @NApiVersion 2.1
  * @NScriptType UserEventScript
  */

define(['N/task','N/record','N/query','N/search','N/log'], (task, record, query, search, log) => {

  function beforeSubmit(context) {
    try {
      if (context.type !== context.UserEventType.CREATE &&
          context.type !== context.UserEventType.EDIT) return;

      const billRec = context.newRecord;
      const lineCount = billRec.getLineCount({ sublistId: 'item' });

      // Clear any prior status
  //    billRec.setValue({ fieldId: 'custbody_lc_auto_status', value: '' });

      for (let i = 0; i < lineCount; i++) {
        const memo = billRec.getSublistValue({ sublistId: 'item', fieldId: 'description', line: i });
        const item = billRec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });

        log.debug('item', item);
        log.debug('memo', memo);

        if (!memo) continue;

        // Example: detect PO number in description
        const poMatch = memo.match(/\bPO\s*#?([A-Za-z0-9\-]+)/i);
        log.debug('po match', poMatch);
        if (!poMatch) continue;

        const poNumber = poMatch[1];

        // Find related IR(s) by PO number via SuiteQL
        const relatedIRs = query.runSuiteQL(`
          SELECT DISTINCT 
            PO.TranID AS PONumber,
            PO.TranDate AS DateOrdered,
            NextTransaction.id,
            NextTransaction.TranDate,
            NextTransaction.Memo
          FROM Transaction AS PO
          INNER JOIN NextTransactionLink AS NTL ON (NTL.PreviousDoc = PO.ID)
          INNER JOIN Transaction AS NextTransaction ON (NextTransaction.ID = NTL.NextDoc)
          WHERE PO.type = 'PurchOrd' 
            AND NextTransaction.type = 'ItemRcpt'
            AND PO.tranid='${poNumber}'
        `).asMappedResults();

        if (relatedIRs.length > 1) {
          billRec.setValue({ fieldId: 'custbody_lc_auto_status', value: 'Multiple IRs found' });
        } else if (relatedIRs.length < 1) {
          billRec.setValue({ fieldId: 'custbody_lc_auto_status', value: 'No IRs found' });
        } else {
          log.debug('IR line being set', i);
          billRec.setSublistValue({
            sublistId: 'item',
            fieldId: 'custcol_related_ir', // your custom column
            line: i,
            value: relatedIRs[0].id
          });
          log.debug('ir_ids', [relatedIRs[0].id]);
        }
      }

      // NOTE: calculateAllocations() is defined below if you want to use it here for previews, 
      // but the actual landed-cost writes should be done by the MR.

    } catch (e) {
      log.audit('Error in beforeSubmit', e);
    }
  }

function afterSubmit(context) {
  try {
    if (context.type !== context.UserEventType.CREATE &&
        context.type !== context.UserEventType.EDIT) return;

    const tranId = context.newRecord.id;
    if (!tranId) {
      log.audit('afterSubmit', 'No transaction ID, skipping MR');
      return;
    }

    // --- Detect transaction type (Check or Vendor Bill) ---
    const tranTypeResult = query.runSuiteQL({
      query: `SELECT type FROM transaction WHERE id = ${tranId}`
    }).asMappedResults();

    const tranType = tranTypeResult[0]?.type;
    let recType;

    if (tranType === 'VendBill') {
      recType = record.Type.VENDOR_BILL;
    } else if (tranType === 'Check') {
      recType = record.Type.CHECK;
    } else {
      log.audit('afterSubmit', `Unsupported transaction type: ${tranType}`);
      return;
    }

    const rec = record.load({ type: recType, id: tranId, isDynamic: false });
    const lineCount = rec.getLineCount({ sublistId: 'item' });
    let hasRelatedIR = false;

    // --- Scan for related IR ---
    for (let i = 0; i < lineCount; i++) {
      const irVal = rec.getSublistValue({
        sublistId: 'item',
        fieldId: 'custcol_related_ir',
        line: i
      });
      if (irVal) {
        hasRelatedIR = true;
        break;
      }
    }

    if (!hasRelatedIR) {
      log.audit('afterSubmit', `No related IR found on any line — skipping MR. TranID: ${tranId}`);
      return;
    }
      // --- Manual override check on related IR(s) ---
const irIds = new Set();
for (let i = 0; i < lineCount; i++) {
  const irVal = rec.getSublistValue({
    sublistId: 'item',
    fieldId: 'custcol_related_ir',
    line: i
  });
  if (irVal) irIds.add(Number(irVal));
}

for (const id of irIds) {
  try {
    const irRec = record.load({ type: record.Type.ITEM_RECEIPT, id, isDynamic: false });
    const manualOverride = irRec.getValue('custbody_manual_lc_calc');
    if (manualOverride) {
      log.audit('Manual override enabled', `IR ${id} — skipping landed cost MR for tran ${tranId}`);
      return; // stop the script early
    }
  } catch (e) {
    log.error('Manual override check failed', { irId: id, err: e });
  }
}
    
    // --- Launch MR ---
    const t = task.create({
      taskType: task.TaskType.MAP_REDUCE,
      scriptId: 'customscript_aw_mr_landed_cost_automatio',
      deploymentId: 'customdeploy_aw_mr_landed_cost_automati',
      params: { custscript_ir_id: String(tranId) }
    });

    const taskId = t.submit();
    log.audit('LandedCost MR Submitted', { taskId, tranId, tranType });

  } catch (e) {
    log.error('afterSubmit error', e);
  }
}

  /**
   * Same helper you had before — kept here in case you want to reuse it.
   * Not called by default in this UE (the MR does the real allocation).
   */
  function calculateAllocations(lines, totalCost, mode) {
    let totalBase = 0;

    lines.forEach(r => {
      if (mode === 'cbm') {
        r.lineBase = (r.unitspercarton && r.cbmperunit)
          ? (r.quantity / r.unitspercarton) * r.cbmperunit
          : 0;
      } else {
        r.lineBase = r.purchaseprice ? r.purchaseprice * r.quantity : 0;
      }
      totalBase += r.lineBase;
    });

    lines.forEach(r => {
      const share = totalBase > 0 ? (r.lineBase / totalBase) : 0;
      r.share = share;
      r.allocatedCost = share * (totalCost || 0);
    });

    return lines;
  }

  return { beforeSubmit, afterSubmit };
});