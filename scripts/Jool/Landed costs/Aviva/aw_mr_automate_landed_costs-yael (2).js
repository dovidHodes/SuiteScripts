/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/record','N/query','N/runtime','N/log'], function (record, query, runtime, log) {

  const costCategories = [
     {
          "id": 6,
          "name": "Per Diem"
     },
     {
          "id": 10,
          "name": "Freight Handling Charge"
     },
     {
          "id": 11,
          "name": "Warehouse Receiving Fee"
     },
     {
          "id": 8,
          "name": "Duty Fees"
     },
     {
          "id": 9,
          "name": "Customs Broker Fee"
     },
     {
          "id": 12,
          "name": "Warehouse Palletizing Fee"
     },
     {
          "id": 4,
          "name": "Drayage"
     },
     {
          "id": 7,
          "name": "Tariff/Duty"
     },
     {
          "id": 14,
          "name": "Outsourcing Charge"
     },
     {
          "id": 1,
          "name": "EXW Charge"
     },
     {
          "id": 13,
          "name": "Customs Exam Expense"
     },
     {
          "id": 2,
          "name": "Ocean Freight"
     },
     {
          "id": 3,
          "name": "Additional Freight"
     },
     {
          "id": 5,
          "name": "Demurrage"
     }
]
  const PARAM_BILL_ID = 'custscript_ir_id';
  const FIELD_ASSOC_IR = 'custcol_related_ir';
  const DUTY_ITEM_ID = 635; // "Tariff/Duty" -> value mode

  function getInputData() {
  const script = runtime.getCurrentScript();

  // Try array param first (new)
  let idParam = script.getParameter({ name: 'custscript_ir_id' });
    log.debug('idParam',idParam)
  let ids = [];

  if (idParam) {
    log.debug('trying to prase')
    try {
      ids = JSON.parse(idParam);
      if (!Array.isArray(ids)) ids = [ids];
      log.debug('ids',ids)
    } catch (e) {
      log.error('Invalid JSON in custscript_ir_ids', { idParam, err: e });
      ids = [];
    }
  }

  // Fall back to single bill param (legacy)
  if (ids.length === 0) {
    log.debug('single');
    const singleId = script.getParameter({ name: 'custscript_ir_id' });
    if (singleId) {
      ids.push(singleId);
    }
  }

  if (ids.length === 0) {
    log.error({ title: 'Missing parameters', details: 'No bill/check IDs found in script params' });
    return [];
  }

  var work = [];

  ids.forEach(billId => {
    let bill;
    try {
      var tranTypeResult = query.runSuiteQL({
        query: `SELECT type FROM transaction WHERE id = ${billId}`
      }).asMappedResults();

      var tranType = tranTypeResult[0]?.type;
log.debug(tranType,billId);
      if (tranType === 'VendBill') {
        bill = record.load({ type: record.Type.VENDOR_BILL, id: billId, isDynamic: false });
      } else if (tranType === 'Check') {
        bill = record.load({ type: record.Type.CHECK, id: billId, isDynamic: false });
      } else {
        log.error({ title: 'Unsupported transaction type', details: { billId, tranType } });
        return;
      }
    } catch (e) {
      log.error({ title: 'Failed to load bill/check', details: { billId, err: e } });
      return;
    }

    var lineCount = bill.getLineCount({ sublistId: 'item' });

    for (let i = 0; i < lineCount; i++) {
      log.debug('cycling lines')
      var irId = Number(bill.getSublistValue({ sublistId: 'item', fieldId: FIELD_ASSOC_IR, line: i })) || 0;
      if (!irId) continue;
log.debug('irid ' + irId);
      var itemId = Number(bill.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i })) || 0;
      var amount = Number(bill.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i })) || 0;
      log.debug('amount ' +amount)
      if (!amount) continue;

      var costcategory = query.runSuiteQL(
        `SELECT cc.id, cc.name 
         FROM costcategory cc  
         JOIN item i ON i.itemid = cc.name 
         WHERE i.id = ${itemId}`
      ).asMappedResults();

      var mode = (itemId == DUTY_ITEM_ID) ? 'value' : 'cbm';
log.debug('finished working')
      work.push({
        irId,
        costCategory: costcategory[0]?.id,
        componentCost: amount,
        mode,
        sourceBillId: billId,
        billLine: i
      });
          }
    log.debug('work',work)
  });

  log.audit({ title: 'getInputData: total components', details: work.length });
  return work;
}

  function map(context) {
    const row = JSON.parse(context.value);
const key = `${row.irId}_${row.sourceBillId}`;
context.write({ key, value: row });
  }

function reduce(context) {
  const [irIdStr, billIdStr] = String(context.key).split('_');
  const irId = Number(irIdStr);
  const billId = Number(billIdStr);
  const parts = context.values.map(JSON.parse);

  if (!irId || parts.length === 0) return;

  log.debug('reduce →', { irId, billId, partsCount: parts.length });

  // === Load IR lines ===
  let irLines = [];
  try {
    irLines = query.runSuiteQL({
      query: `
        SELECT DISTINCT
          ir.id AS irId,
          irl.item AS itemId,
          irl.quantity AS quantity,
          i.custitemunits_per_carton AS unitsPerCarton,
          i.custitemcustitem_carton_cbf AS cbmPerUnit,
          i.cost AS purchasePrice
        FROM transaction ir
        JOIN transactionline irl ON ir.id = irl.transaction
        JOIN item i ON i.id = irl.item
        WHERE ir.id = ${irId}
          AND irl.quantity IS NOT NULL
      `
    }).asMappedResults();
  } catch (e) {
    log.error({ title: 'SuiteQL(IR lines) failed', details: { irId, err: e } });
    return;
  }

  if (!irLines || irLines.length === 0) {
    log.audit({ title: 'No IR lines to allocate', details: { irId } });
    return;
  }

  // === Begin allocation work ===
  try {
    const rec = record.load({ type: record.Type.ITEM_RECEIPT, id: irId, isDynamic: false });
    
// --- Manual override check ---
var manualOverride = rec.getValue('custbody_manual_lc_calc');
if (manualOverride) {
  log.audit('Manual override enabled', { irId, msg: 'Skipping LC allocation for this IR' });
  return;
}
    // Handle each cost component (one per Vendor Bill / Check line)
    for (const p of parts) {
      const allocs = allocate(irLines.map(r => ({ ...r })), Number(p.componentCost) || 0, p.mode);
      let byItem = {};
      let zeroAmountDetected = false;

      for (const a of allocs) {
        const itemId = Number(a.itemid || a.itemId) || 0;
        const amt = Number(a.allocatedCost) || 0;

        if (amt === 0) {
          zeroAmountDetected = true;
          log.debug('Zero amount detected for IR', { irId, itemId, billId: p.sourceBillId });
          // mark the offending bill(s)
          setAutoStatus(p.sourceBillId, 'Items on IR missing CBM information');
        }

        if (!itemId || amt <= 0) continue;
        if (!byItem[itemId]) byItem[itemId] = [];
        byItem[itemId].push(amt);
      }

      // If any zero allocations occurred, stop the reduce for this IR.
      if (zeroAmountDetected) {
        log.audit('Halting reduce: zero allocation detected', { irId });
        return;
      }

      const lcCount = rec.getLineCount({ sublistId: 'item' });
      for (let i = 0; i < lcCount; i++) {
        const irItemId = rec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
        const relatedCosts = byItem[irItemId] || [];
        if (relatedCosts.length === 0) continue;

        const totalCost = relatedCosts.reduce((a, b) => a + b, 0);
        const landCost = rec.getSublistSubrecord({
          sublistId: 'item',
          fieldId: 'landedcost',
          line: i
        });

        let existingIdx = -1;
        const lcCount2 = landCost.getLineCount({ sublistId: 'landedcostdata' });
        for (let j = 0; j < lcCount2; j++) {
          const cc = landCost.getSublistValue({
            sublistId: 'landedcostdata',
            fieldId: 'costcategory',
            line: j
          }) || 0;
          if (cc == p.costCategory) {
            existingIdx = j;
            break;
          }
        }

        if (existingIdx >= 0) {
          landCost.setSublistValue({
            sublistId: 'landedcostdata',
            fieldId: 'amount',
            line: existingIdx,
            value: totalCost
          });
        } else {
          const insertAt = lcCount2;
          landCost.insertLine({ sublistId: 'landedcostdata', line: insertAt });
          landCost.setSublistValue({
            sublistId: 'landedcostdata',
            fieldId: 'costcategory',
            line: insertAt,
            value: p.costCategory
          });
          landCost.setSublistValue({
            sublistId: 'landedcostdata',
            fieldId: 'amount',
            line: insertAt,
            value: totalCost
          });
        }
      }
    }

    const saved = rec.save({ enableSourcing: true, ignoreMandatoryFields: true });
    log.audit('IR updated with landed cost', { irId, saved });

    // // ✅ Mark all related bills/checks as updated successfully
    // for (const b of billIds) {
    //   setAutoStatus(b, 'Successfully updated IR');
    // }
      setAutoStatus(billId, 'Successfully updated IR');


  } catch (e) {
    log.error({ title: 'Failed to write landed costs', 
               details: { irId, err: e } 
              });
     // Detect if the error is a closed accounting period
    const isClosedPeriod = e?.name?.includes('CLOSED_PERIOD') ||
                         /closed period/i.test(e?.message || '');

    // Always set the base status
    setAutoStatus(billId, 'Failed to write landed costs');

     // If it's specifically a closed period, add another note
    if (isClosedPeriod) {
      setAutoStatus(billId, 'Accounting period closed — LC not applied');
    }
    
    // for (const b of billIds) {
    //   setAutoStatus(b, 'Failed to write landed costs');
    // }
  }
}

  // === allocation helper (cbm or value) ===
  function allocate(lines, totalCost, mode) {
    let totalBase = 0;

    lines.forEach(r => {
      const qty = Number(r.quantity) || 0;
      const unitsPerCarton = Number(r.unitspercarton || r.unitsPerCarton) || 0;
      const cbmPerUnit = Number(r.cbmperunit || r.cbmPerUnit) || 0;
      const purchasePrice = Number(r.purchaseprice || r.purchasePrice) || 0;

      if (mode === 'cbm') {
        r.lineBase = (unitsPerCarton > 0 && cbmPerUnit > 0) ? (qty / unitsPerCarton) * cbmPerUnit : 0;
      } else {
        r.lineBase = (purchasePrice > 0) ? purchasePrice * qty : 0;
      }
      totalBase += (Number(r.lineBase) || 0);
    });

    lines.forEach(r => {
      const share = totalBase > 0 ? ((Number(r.lineBase) || 0) / totalBase) : 0;
      r.allocatedCost = share * (Number(totalCost) || 0);
    });

    return lines;
  }

  function setAutoStatus(billId, lcStatus) {
  try {
    log.debug('in setAuto fuinction')
    // Determine original source record type
    const tranTypeResult = query.runSuiteQL({
      query: `SELECT type FROM transaction WHERE id = ${billId}`
    }).asMappedResults();

    const tranType = tranTypeResult[0]?.type;
    let sourceRecType;

    if (tranType === 'VendBill') {
      sourceRecType = record.Type.VENDOR_BILL;
    } else if (tranType === 'Check') {
      sourceRecType = record.Type.CHECK;
    }

    if (sourceRecType) {
      const srcRec = record.load({
        type: sourceRecType,
        id: billId,
        isDynamic: true
      });
log.debug('trying to set')
      // Update custom body field for missing CBM info
      srcRec.setValue({
        fieldId: 'custbody_lc_auto_status',
        value: lcStatus
      });

      const savedSrc = srcRec.save({ enableSourcing: true, ignoreMandatoryFields: true });
      log.audit({
        title: 'Updated Bill/Check for LC Status',
        details: { sourceId: savedSrc, message: 'custbody_lc_auto_status updated' }
      });
      const checkValue = srcRec.getValue('custbody_lc_auto_status');
log.audit('Verify field value after save', checkValue);
    }
     else {
      log.error({
        title: 'Unknown transaction type for zero CBM update',
        details: { tranType, sourceBillId: billId }
      });
    }
  } catch (updateErr) {
    log.error({
      title: 'Failed to update bill/check with zero allocation info',
      details: { billId: billId, err: updateErr }
    });
}
}
  return { getInputData, map, reduce };
});

