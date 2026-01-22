/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */

 //change folder id and script id in prod //sb //2244

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

define([
  'N/search',
  'N/render',
  'N/file',
  'N/runtime',
  'N/record',
  'N/url',
  'N/task',
  'N/xml'
], function (search, render, file, runtime, record, url, task,xml) {
  function beforeSubmit (context) {
    try{
      log.debug('Before Submit start');
    let beforeSubRec = context.newRecord
    let shipperInfoArr = []
    let totalPkgCount = 0
    let jsonData = {}
    let IfSubmitObj = {}
    IfSubmitObj.ifids = {}
    let itemDatafield = beforeSubRec.getValue(
      'custrecord_gbs_bol_print_pdf_item_data'
    )
    itemDatafield = itemDatafield ? JSON.parse(itemDatafield) : ''
    log.audit('itemDatafield', itemDatafield)
 
    let combineChkbx = beforeSubRec.getValue(
      'custrecord_gbs_bol_print_pdf_combine_chk'
    )
// let shipfromBody= beforeSubRec.getValue(
//   'custpage_shipfrom'
// )
    let isConsolidated = beforeSubRec.getValue(
      'custrecord_gbs_bol_print_pdf_chkbx'
    )
      let bolUrl;
    if (_logValidation(itemDatafield) && !combineChkbx) {
    //  log.debug('50')
     log.audit('here', 'not combined')

      let bodyData = beforeSubRec.getValue(
        'custrecord_gbs_bol_print_pdf_othr_bdy_dt'
      )
      bodyData = bodyData ? JSON.parse(bodyData) : ''
log.debug('bodyData',bodyData)
      let pdfFolderId = runtime
        .getCurrentScript()
        .getParameter({ name: 'custscript_gbs_folderid_url' })

      //!usage 10 units
     // log.debug('67')
      let results = itemFullSearch(itemDatafield.ifid)
      let {potype,department,vendorNumber,mabdDate}=itemPODepDataSearchData(results);
    var nmfcind = getNfmc(itemDatafield.ifid);
      jsonData.potype=potype;
      jsonData.department=department;
      jsonData.vendorNumber=vendorNumber;
      jsonData.mabdDate=mabdDate;
    log.debug('calc' + bodyData.nmfcCalc);
    if(bodyData.nmfcCalc != 'F'){
      jsonData.nmfc=nmfcind;
      
      }
      log.debug('nmfc' + jsonData.nmfc);
      
//log.debug('results',results)
let finalSPSWeight=0
      for (let i = 0; i < results.length; i++) {
        if (i === 0) {
          var {
            ifId,
            relatedPO,
             totalweight,
            // potype,
            pkgCount,
            shipaddress1,
            shipaddress2,
            addressee,
            attention,
            city,
            phone,
            state,
            zip,
            country
          } = itemFullSearchData(results, i)
         // totalweight=((totalweight*0.50)-totalweight)
          finalSPSWeight+=parseFloat(totalweight)
        } else {
          var {
            ifId,
            relatedPO,
             totalweight,
           //  potype,
            pkgCount,
            addressee
          } = itemFullSearchData(results, i);
          finalSPSWeight+=parseFloat(totalweight)
        }
        IfSubmitObj.ifids[ifId] = relatedPO
        shipperInfoArr.push({
          relatedPO: relatedPO,
          // weight:
          //   itemDatafield.singleIfPdfWeight != null ||
          //   itemDatafield.singleIfPdfWeight != undefined
          //     ? itemDatafield.singleIfPdfWeight[ifId] || itemDatafield.singleIfPdfWeight
          //     : '',
         //department: department,
          //potype: potype,
          pkgCount: pkgCount,
          weight:totalweight?totalweight:0,
          dcNum:("0"+addressee.replace(/^\D+|\D+$/g, "")).slice(-5)
        })

        totalPkgCount += parseInt(pkgCount)
      }
    //  log.debug('114')

      //{"customer":"540","carrier":"","frieghtChargeTerms":"3rd party selection","shipTofobVal":"F","shipFromfobVal":"F","location":"4"}
      //jsonData.totalWeight = isConsolidated ? itemDatafield.totalWeight :  itemDatafield.singleIfPdfWeight
      jsonData.pageNum=bodyData.pageNum
      jsonData.totalPages=bodyData.totalPages
      jsonData.totalWeight =finalSPSWeight?finalSPSWeight.toFixed(2):0
      jsonData.shipperInfoArr = shipperInfoArr
      jsonData.totalPkgCount = totalPkgCount
      jsonData.frieghtChargeTerms = bodyData.frieghtChargeTerms
      jsonData.shipTofobVal = bodyData.shipTofobVal
      jsonData.shipFromfobVal = bodyData.shipFromfobVal
      jsonData.shiptocid = bodyData.shiptocid
      jsonData.shipToName = bodyData.shipToName;
      jsonData.shipToAddress = bodyData.shipToAddress;
      jsonData.shipToCity = bodyData.shipToCity;
      jsonData.shipToState = bodyData.shipToState;
      jsonData.shipToZip = bodyData.shipToZip;
      jsonData.mabdDateCommon = bodyData.mabdDateCommon;
      jsonData.proNumber = bodyData.proNumber;
      jsonData.pdfType=bodyData.pdfType;
      IfSubmitObj.proNumber = bodyData.proNumber;
      IfSubmitObj.shipmethod = bodyData.carrier
      jsonData.shipmethod = bodyData.carrier
      jsonData.scac = bodyData.scac
      jsonData.loadID=bodyData.loadID
      jsonData.mblNumber=bodyData.mblNumber;
      jsonData.bclass=bodyData.bclass;  
       IfSubmitObj.scac = bodyData.scac
    //  jsonData.nmfc = bodyData.nmfc
      if(bodyData.nmfcCalc = 'T'){
      IfSubmitObj.nmfc = bodyData.nmfc
      }
      IfSubmitObj.carrierTransMethodCode = bodyData.carrierTransMethodCode
      
      if (isConsolidated === true || isConsolidated === 'true' || isConsolidated === 'T') {
        jsonData.shipToFullInfo = {
          shipaddress1: bodyData.shipToAddress,
          //shipaddress2: shipaddress2,
          addressee: bodyData.shipToName,
          attention: bodyData.shipToName,
          city: bodyData.shipToCity,
         // phone: phone,
          state: bodyData.shipToState,
          zip: bodyData.shipToZip,
          country: bodyData.shipToName.replace(/^\D+|\D+$/g, "") //location number mapped to country
        }
      
      } else {
      jsonData.shipToFullInfo = {
        shipaddress1: shipaddress1,
        shipaddress2: shipaddress2,
        addressee: addressee,
        attention: attention,
        city: city,
        phone: phone,
        state: state,
        zip: zip,
        country: addressee.replace(/^\D+|\D+$/g, "") //location number mapped to country
      }
    }
   // jsonData.shipFromFullInfo =shipfromBody?shipfromBody:' '
     //AW Comment out 7/4 jsonData.shipFromFullInfo = (((bodyData.shipFromText).replace('Jool Baby','')).replaceAll('\r', '<br/>'))
      jsonData.shipFromFullInfo = ((bodyData.shipFromText).replaceAll('\r', '<br/>'))
      log.audit('full ship from info', jsonData.shipFromFullInfo )
      //   ? shipFromLocationNS(bodyData.shipFrom)
      //  : '' //10
      //todo trailer and seal number remaining - done
      //!usage 50
      jsonData.bolNumber =relatedPO
        // getBOLNum('customrecord_gbs_consolidated_bol_num', isConsolidated) ||
        // relatedPO
      IfSubmitObj.bolNumber = jsonData.bolNumber
      jsonData.isconsolidated = isConsolidated
      var itemArray=jsonData.shipperInfoArr
     // log.debug('itemArray191',itemArray)
      if(jsonData.isconsolidated==true||jsonData.isconsolidated=='true'||jsonData.isconsolidated=='T'){
      // log.debug('itemArray192',itemArray)
        jsonData.shipperInfoArr =  itemArray.sort((a, b) => {
          let fa = a.relatedPO.toLowerCase(),
              fb = b.relatedPO.toLowerCase();
      
          if (fa < fb) {
              return -1;
          }
          if (fa > fb) {
              return 1;
          }
          return 0;
      })
      }
      let todayDate=new Date();
      let dateFormated=(todayDate.getMonth()+1)+'/'+todayDate.getDate()+'/'+todayDate.getFullYear();
      jsonData.trandate=dateFormated

      log.debug('jsonData', jsonData)

      //question what to takes ship from and ship to address
      beforeSubRec.setValue(
        'custrecord_gbs_bol_print_pdf_shp_addr',
        JSON.stringify({
          shipaddress1: shipaddress1,
          shipaddress2: shipaddress2,
          addressee: addressee,
          attention: attention,
          city: city,
          phone: phone,
          state: state,
          zip: zip,
          country:country
        })
      )
//log.debug('187','187')
      beforeSubRec.setValue(
        'custrecord_gbs_bol_print_pdf_pkg_count',
        JSON.stringify(shipperInfoArr)
      )
    //  log.debug('192','192')
       bolUrl = renderBolPdf(jsonData, beforeSubRec, pdfFolderId);
    //  log.debug('194','194')
      updateIFFields(ifId, IfSubmitObj, isConsolidated)
    } else if (_logValidation(itemDatafield) && combineChkbx) {
      //send only 95 at a time - done
      log.audit('here', 'combined')
       bolUrl = renderSet(itemDatafield)
    }

    log.audit('bol url', bolUrl)
    beforeSubRec.setValue('custrecord_gbs_bol_print_pdf_url', bolUrl)
    // log.debug({
    //   title: 'runtime.getCurrentScript().getRemainingUsage()',
    //   details: runtime.getCurrentScript().getRemainingUsage()
    // })
  }catch(e){
      log.debug("error in beofreSubmit",e);
    }
  }

  function afterSubmit (context) {
    try{
     // log.debug('afterSubmit  start');
    var afterSubitRec = context.newRecord
    afterSubitRec = record.load({
      type: afterSubitRec.type,
      id: afterSubitRec.id
    })
    var modified = afterSubitRec.getValue(
      'custrecord_gbs_bol_print_detail_pdf_modi'
    )
    afterSubitRec.setValue('custrecord_gbs_bol_print_detail_pdf_modi', false)
    afterSubitRec.save();
  }catch(e){
    log.debug("error in afterSubmit",e);
  }
  }

 function updateIFFields (ifId, IfSubmitObj, isConsolidated) {
    if (!isConsolidated) {
      //10
      record.submitFields({
        type: 'itemfulfillment',
        id: ifId,
        values: {
          custbody_sps_carrierpronumber: IfSubmitObj.proNumber,
          //submitfieldobj.values.custbody_sps_billofladingnumber = poNumber,
          custbody_sps_billofladingnumber: IfSubmitObj.bolNumber,
          custbody_sps_carrieralphacode: IfSubmitObj.scac,
          custbody_sps_carriertransmethodcode: IfSubmitObj.carrierTransMethodCode
        }
      })  // Aviva updated on 4-14 because SCAC was being overwritten.
    } else {
      var schTask = task.create({
        taskType: task.TaskType.SCHEDULED_SCRIPT,
        //scriptId: 1174,//prod
        scriptId: 950, //sb
        deploymentId: 'customdeploy_gbs_sch_consolidated_bol_sb',
        params: {
          custscript_gbs_ifsubmit_obj: IfSubmitObj
        }
      })

      //schTask.submit()
    }
  }

  function shipFromLocationNS (loc) {
    var locationSearchObj = search.create({
      type: 'location',
      filters: [['internalid', 'anyof', loc]],
      columns: [
        search.createColumn({
          name: 'name',
          sort: search.Sort.ASC,
          label: 'Name'
        }),
        search.createColumn({ name: 'phone', label: 'Phone' }),
        search.createColumn({ name: 'city', label: 'City' }),
        search.createColumn({ name: 'state', label: 'State/Province' }),
        search.createColumn({ name: 'country', label: 'Country' }),
        search.createColumn({ name: 'address1', label: 'Address 1' }),
        search.createColumn({ name: 'address2', label: 'Address 2' }),
        search.createColumn({ name: 'address3', label: 'Address 3' }),
        search.createColumn({ name: 'phone', label: 'Phone' }),
        search.createColumn({ name: 'zip', label: 'Zip' })
      ]
    })
    var searchResultCount = locationSearchObj.run().getRange(0, 1)
    // log.debug(
    //   'JSON.stringify(searchResultCount) result count',
    //   JSON.stringify(searchResultCount)
    // )
    searchResultCount = JSON.stringify(searchResultCount)
    log.audit('searchResultCount', searchResultCount);
    searchResultCount = searchResultCount
      ? JSON.parse(searchResultCount)
      : searchResultCount
    return searchResultCount[0].values
  }

  function renderBolPdf (jsonData, beforeSubRec, pdfFolderId) {
    try {
      log.audit('jsonData', jsonData);
      let renderer = render.create()
      renderer.setTemplateByScriptId('CUSTTMPL_108_6448561_565');
   //   log.debug('294','294');
      renderer.addCustomDataSource({
        format: render.DataSource.OBJECT,
        alias: 'JSON',
        data: { record: jsonData }
      })
    //  log.debug('299','299');
      let bol = renderer.renderAsPdf()
     // log.debug('302','302');
      bol.folder = pdfFolderId
      bol.name = 'BOL_PDF_' + beforeSubRec.id
      bol.isOnline = true
     // log.debug("bol", bol);
      let fileid = bol.save()
      log.audit('file id', fileid)
      let pdfSingle = file.load(fileid);
    //  log.debug('pdfSingle', pdfSingle)
      let output =
        'https://' +
        url.resolveDomain({
          hostType: url.HostType.APPLICATION
        }) +
        pdfSingle.url
      log.audit('output', output)
      return output
    } catch (error) {
      log.debug('error in renderBolPdf', error)
    }
  }

  function itemFullSearch (ifIdArr) {
    //log.debug('ifIdArr',ifIdArr)
    var results = search
      .create({
        type: 'itemfulfillment',
        filters: [
          ['formulanumeric: MOD({linesequencenumber},3)', 'equalto', '0'],
          'AND',
          ['type', 'anyof', 'ItemShip'],
          'AND',
          ['shipping', 'is', 'F'],
          'AND',
          ['mainline', 'is', 'T'],
          //   'AND',
          //   ['item.internalid', itemIdArr],
          'AND',
          ['internalid', 'anyof', ifIdArr]
        ],
        columns: [
          search.createColumn({
            name: 'internalid',
            summary: 'GROUP',
            label: 'Internal ID'
          }),
          search.createColumn({
            name: 'custbody_sps_ponum_from_salesorder',
            summary: 'GROUP',
            label: 'Related PO #'
          }),
          search.createColumn({
            name: 'createdfrom',
            summary: 'GROUP',
            label: 'Created From'
          }),
          //   search.createColumn({
          //     name: 'formulanumeric',
          //     summary: 'SUM',
          //     formula: 'CASE WHEN {quantity} < 0 THEN 0 ELSE {item.weight} END',
          //     label: 'Formula (Numeric)'
          //   }),
         
          search.createColumn({
            name: 'custbody_sps_potype',
            summary: 'GROUP',
            label: 'PO Type'
          }),
          search.createColumn({
            name: 'custbody_gbs_mabd',
            summary: 'GROUP',
            label: 'MUST ARRIVE BY DATE'
          }),
          // search.createColumn({
          //   name: 'department',
          //   summary: 'GROUP',
          //   label: 'Department'
          // }),
          search.createColumn({
            name: "custbody_sps_department",
            summary: 'GROUP',
            label: "Department",
          }),
          search.createColumn({
            name: 'name',
            join: 'CUSTRECORD_SPS_PACK_ASN',
            summary: 'COUNT',
            label: 'ID'
          }),
          search.createColumn({
            name: "custrecord_sps_pk_weight",
            join: "CUSTRECORD_SPS_PACK_ASN",
            summary: "SUM",
            label: "Total Weight"
         }),
          search.createColumn({
            name: 'address1',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: ' Address 1'
          }),
          search.createColumn({
            name: 'address2',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: ' Address 2'
          }),
          search.createColumn({
            name: 'addressee',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: ' Addressee'
          }),
          search.createColumn({
            name: 'attention',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: ' Attention'
          }),
          search.createColumn({
            name: 'city',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: ' City'
          }),
          search.createColumn({
            name: 'phone',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: ' Phone'
          }),
          search.createColumn({
            name: 'state',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: ' State'
          }),
          search.createColumn({
            name: 'zip',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: ' Zip'
          }),
          search.createColumn({
            name: 'country',
            join: 'shippingAddress',
            summary: 'GROUP',
            label: 'Country'
          }),
          search.createColumn({
            name: "accountnumber",
            join: "customer",
            summary: 'GROUP',
            label: "Account"
         }),
         search.createColumn({
          name: 'custbody_sps_reference_mr',
          summary: 'GROUP',
          label: 'MERCHANDISE TYPE CODE'
       }),
      
        ]
      }).run()
      .getRange({ start: 0, end: 1000 });

    if (!results || results.length == 0) {
      return false
    }
   
     return results
  }
  function itemPODepDataSearchData (results) {
    let potype = results[0].getValue({
      name: 'custbody_sps_reference_mr',
      summary: 'GROUP',
      label: 'MERCHANDISE TYPE CODE'
    })
    let department =results[0].getValue({name: "custbody_sps_department",
    summary: 'GROUP',
    label: "Department",});
    let vendorNumber =results[0].getValue({name: "accountnumber",
    join: "customer",
    summary: 'GROUP',
    label: "Account",})
    let mabdDate=results[0].getValue({name: 'custbody_gbs_mabd',
    summary: 'GROUP',
    label: 'MUST ARRIVE BY DATE'})
    mabdDate?mabdDate:' '
    
    return {
      potype,department,vendorNumber,mabdDate
    }
  }
  function itemFullSearchData (results, i) {
    let ifId = results[i].getValue({
      name: 'internalid',
      summary: 'GROUP',
      label: 'Internal ID'
    })
    let relatedPO = results[i].getValue({
      name: 'custbody_sps_ponum_from_salesorder',
      summary: 'GROUP',
      label: 'Related PO #'
    })
    // let totalweight = results[i].getValue({
    //   name: 'formulanumeric',
    //   summary: 'SUM',
    //   formula: 'CASE WHEN {quantity} < 0 THEN 0 ELSE {item.weight} END',
    //   label: 'Formula (Numeric)'
    // })
    let potype = results[i].getValue({
      name: 'custbody_sps_reference_mr',
      summary: 'GROUP',
      label: 'MERCHANDISE TYPE CODE'
    })
    let department =results[i].getValue({name: "custbody_sps_department",
    summary: 'GROUP',
    label: "Department",});
    let pkgCount = results[i].getValue({
      name: 'name',
      join: 'CUSTRECORD_SPS_PACK_ASN',
      summary: 'COUNT',
      label: 'ID'
    })
   // log.debug('487')
   let totalweight= results[i].getValue({
    name: "custrecord_sps_pk_weight",
    join: "CUSTRECORD_SPS_PACK_ASN",
    summary: "SUM",
    label: "Total Weight"
 })
 totalweight=totalweight?totalweight:0
 //log.debug('494')
    let shipaddress1 = results[i].getValue({
      name: 'address1',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: ' Address 1'
    })
    let shipaddress2 = results[i].getValue({
      name: 'address2',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: ' Address 2'
    })
    let addressee = results[i].getValue({
      name: 'addressee',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: ' Addressee'
    })
    let attention = results[i].getValue({
      name: 'attention',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: ' Attention'
    })
    let city = results[i].getValue({
      name: 'city',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: ' City'
    })
    let phone = results[i].getValue({
      name: 'phone',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: ' Phone'
    })
    let state = results[i].getValue({
      name: 'state',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: ' State'
    })
    let zip = results[i].getValue({
      name: 'zip',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: ' Zip'
    })
    let country = results[i].getValue({
      name: 'country',
      join: 'shippingAddress',
      summary: 'GROUP',
      label: 'Country'
    })
    return {
      ifId,
      relatedPO,
      totalweight,
      potype,
      pkgCount,
      shipaddress1,
      shipaddress2,
      addressee,
      attention,
      city,
      phone,
      state,
      zip,
      country
    }
  }

  function getBOLNum (customrecord, isMaster) {
    if (isMaster == true) {
      let todayDate = new Date()
      var todayDateStr =
        todayDate.getMonth() +
        1 +
        '' +
        todayDate.getDate() +
        '' +
        todayDate.getFullYear()

      todayDateStr = parseInt(todayDateStr)

      //units 50
      let conBolNum = record.create({
        type: customrecord
      })

      let conBolNumId = conBolNum.save()

      let currNum = search.lookupFields({
        type: customrecord,
        id: conBolNumId,
        columns: 'name'
      })

      //delete it to avoid garbage in the system
      record.delete({
        type: customrecord,
        id: conBolNumId
      })

      var bolNumber = todayDateStr + currNum.name

      return bolNumber
    }
  }

  function renderSet (opts) {
    try {
      //10 x files + 30 + 10(search) --> 95 files combine per custom record
      log.debug('opts In Master',opts)
      var tpl = ['<?xml version="1.0"?>', '<pdfset>']
      var output = url.resolveDomain({
        hostType: url.HostType.APPLICATION
      })
      opts.forEach(function (id, idx) {
        id = parseInt(id);
        log.audit('id', id);
        const partFile = file.load({ id: id }) //10 per file
        var pdf_fileURL = xml.escape({ xmlText: partFile.url })
        tpl.push("<pdf src='" + pdf_fileURL + "'/>")
      })
      tpl.push('</pdfset>')
      pdfFinal = render.xmlToPdf({
        xmlString: tpl.join('\n')
      })

      pdfFinal.name = 'MASTER_INDV_COMB' + '_' + '.pdf'
      pdfFinal.isOnline = true
      pdfFinal.folder = 1373
      let fileId = pdfFinal.save() //20
      log.debug('master BOL PDF', fileId)
      pdfFinal = file.load(fileId) //10
      output = 'https://' + output + pdfFinal.url
      return output
    } catch (error) {
      log.debug({
        title: 'error in renderSet',
        details: error
      })
    }
  }


  function getNfmc(ifIdArr){
    log.debug('getNfmc',ifIdArr);
    var results = search
    .create({
      type: 'itemfulfillment',
      filters: [
        ["type","anyof","ItemShip"], 
        "AND", 
     //   ['mainline', 'is', 'T'],
     //   'AND',
        ['internalid', 'anyof', ifIdArr],
         "AND", 
        ["item.custitem_nfmc_bol","isnotempty",""]
      ],
       columns: [
           search.createColumn({
            name: "quantity",
            label: "Quantity",
            sort: search.Sort.DESC,
            summary: search.Summary.SUM
        }), 
        search.createColumn({
            name: "custitem_nfmc_bol",
            join: "item",
            label: "NFMC",
            summary: search.Summary.GROUP
        })
    
      ]
    }).run()
    .getRange({ start: 0, end: 1000 });
 // log.debug('nmfc results',results)
  if (!results || results.length == 0) {
    log.debug('no results nfmc')
    return false
  }
  log.debug(results[[0]]);
    var nmfcid = results[0].getValue({
            name: "custitem_nfmc_bol",
            join: "item",
            label: "NFMC",
            summary: search.Summary.GROUP
        });
    log.debug('nmfc id'+nmfcid);
    switch (nmfcid){
      case '1': var nmfc2 = '81800'; break;
        case '2': var nmfc2 = '84260'; break;
        case '3': var nmfc2 = '172700'; break;
        case '4': var nmfc2 = '80830-2'; break;
        case '5': var nmfc2 = '39480'; break;
      
    };
    log.debug(nmfc2)
   return nmfc2
  }
  function _logValidation (value) {
    if (
      value != null &&
      value != '' &&
      value != 'null' &&
      value != undefined &&
      value != 'undefined' &&
      value != '@NONE@' &&
      value != 'NaN'
    ) {
      return true
    } else {
      return false
    }
  }

  return {
    beforeSubmit: beforeSubmit,
    afterSubmit: afterSubmit
  }
})