/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */

  // BEGIN SCRIPT DESCRIPTION BLOCK ==================================
{
  /*
  Script Name: _gbs_sl_consolidated_bol
  Author: Palavi Rajgude
  Company: Green Business
  Date: 10-12-2022

  Script Modification Log:  
  -- version--   -- Date --   -- Modified By --          --Requested By--                       -- Description --
  */
}
// END SCRIPT DESCRIPTION BLOCK ====================================

define(['N/runtime', 'N/record'], function (runtime, record) {
  function execute () {
    let ifSubmitObj = runtime
      .getCurrentScript()
      .getParameter({ name: 'custscript_gbs_ifsubmit_obj' })
    ifSubmitObj = ifSubmitObj ? JSON.parse(ifSubmitObj) : ''

    for (const ifId of ifSubmitObj.ifids) {
      record.submitFields({
        type: 'itemfulfillment',
        id: ifId,
        values: {
          custbody_sps_carrierpronumber: ifSubmitObj.proNumber,
          custbody_sps_masterbilloflading: ifSubmitObj.bolNumber,
          custbody_sps_billofladingnumber: ifSubmitObj.ifids[ifId],
          custbody_sps_carrieralphacode: ifSubmitObj.scac
        }
      })
    }
  }

  return {
    execute: execute
  }
})
