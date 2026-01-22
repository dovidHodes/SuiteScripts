/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/record', 'N/query', 'N/search', 'N/log'], function (record, query, search, log) {

  function beforeSubmit(context) {
    try {
      if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
        return;
      }

      const billRec = context.newRecord;
      const lineCount = billRec.getLineCount({ sublistId: 'item' });
      let irIds = [];

      // --- Loop Vendor Bill lines ---
      for (let i = 0; i < lineCount; i++) {
        let memo = billRec.getSublistValue({
          sublistId: 'item',
          fieldId: 'description', // adjust to your actual memo field
          line: i
        });

        log.debug('memo', memo);

        if (memo) {
          // Example: Extract PO number from memo
          let poMatch = memo.match(/PO#\s*(.+)/i);
          log.debug('po match', poMatch)
          if (poMatch) {
            let poNumber = poMatch[1];

            // Search related Item Receipts by PO #
            let relatedIRs = query.runSuiteQL(`SELECT DISTINCT 
	               PO.TranID AS PONumber,
	               PO.TranDate AS DateOrdered,
             NextTransaction.id,
	         NextTransaction.TranDate,
	         NextTransaction.Memo	
            FROM
	          Transaction AS PO
	        INNER JOIN NextTransactionLink AS NTL ON
		    ( NTL.PreviousDoc = PO.ID )
	        INNER JOIN Transaction AS NextTransaction ON
		    ( NextTransaction.ID = NTL.NextDoc )
            WHERE
             PO.type = 'PurchOrd'
             AND PO.tranid= '${poNumber}'`).asMappedResults();

             let fieldValue = relatedIRs.length === 1? relatedIRs[0]: relatedIRs.length > 1? 'Multiple IRs found' : 'No IRs found';
              // Set custom field on bill line with IR number
              billRec.setSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_related_ir', // adjust custom field ID
                line: i,
                value: fieldValue
              });

            if (relatedIRs.length === 1) irIds.push(relatedIRs[0]);
          }
        }
      }

      log.debug('ir_ids', irIds);
      
      /* --- Query IR lines for carton + qty info ---
      if (irIds.length > 0) {
        let suiteQl = `
          SELECT ir.id AS irId,
                 irl.item AS itemId,
                 irl.quantity,
                 i.custitemunits_per_carton AS unitsPerCarton,
                 i.custitemcustitem_carton_cbf AS cbmPerUnit,
                 i.cost AS purchasePrice
          FROM transaction ir
          JOIN transactionline irl ON ir.id = irl.transaction
          JOIN item i ON i.id = irl.item
          WHERE ir.id IN (${irIds.join(',')})
        `;

        let results = query.runSuiteQL({ query: suiteQl }).asMappedResults();

        // check if 'maunal override required is not checked
        // Call our calculation helper
        let allocations = calculateAllocations(results, billRec.getValue({ fieldId: 'usertotal' }));

        log.debug('Allocation Results', allocations);

        // write the allocations to the lines of the IR

      }*/
        // TODO: Trigger MR with bill id

    } catch (e) {
      log.error('Error in beforeSubmit', e);
    }
  }

function calculateAllocations(lines, totalCost, mode) {
  let totalBase = 0;

  lines.forEach(r => {
    if (mode === "cbm") {
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

    return {
        beforeSubmit: beforeSubmit
    };
});


