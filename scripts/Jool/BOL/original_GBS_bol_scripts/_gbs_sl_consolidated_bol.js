/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
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
       1.0       07-07-2022    Palavi Rajgude   Etty Frankel <etty@agaimport.com>     Add Shipped IF as well, currently on picked and packed
       2.0       08-07-2022    Palavi Rajgude   Albert Grazi                          Standalone PDF will have Shipping Address from Item Fulfillment
       3.0       10-12-2022    Palavi Rajgude   Albert Grazi                          Changed everything to include new consolidated pdf that will print unlimited pdf
       */
}
// END SCRIPT DESCRIPTION BLOCK ====================================

define([
  "N/record",
  "N/runtime",
  "N/search",
  "N/ui/serverWidget",
  "N/url",
  "N/https",
  "N/format"
], /**
 */ function (record, runtime, search, serverWidget, url, https, format) {
  var executedTime = format.format({
    value: format.parse({
      value: new Date(new Date().setSeconds(0, 0)),
      type: format.Type.DATETIMETZ
    }),
    type: format.Type.DATETIMETZ
  });
  var pageNumber=1;
  var totalPages=1
  function onRequest(context) {
    try {
      
      // log.debug({
      //   title: "executedTime declred globally 1",
      //   details: executedTime
      // });

      var { request, parameters } = getParameters(context);
      log.debug('request.method', request.method)
      request.method == "GET"
        ? context.response.writePage(mainForm(context, parameters))
        : context.response.writePage(postMethod(context, parameters));

      // log.debug({
      //   title: "runtime.getCurrentScript().getRemainingUsage()",
      //   details: runtime.getCurrentScript().getRemainingUsage()
      // });
    } catch (error) {
      log.debug({
        title: "error in on request",
        details: error
      });
    }
  }

  function mainForm(context, parameters) {
    try {
      var form = serverWidget.createForm({
        title: "Consolidated BOL"
      });
      form.clientScriptModulePath =
        "SuiteScripts/GBS/_gbs_cs_consolidated_bol.js";

      var {
        masterRadio,
        standaloneRadio,
        cosolidatedRadio,
        arrayoftabs,
        shipFrom,
        location,
        proNumber,
        scac,
        shipToName,
        shipToCustAddress,
        shipToAddress,
        shipToCity,
        shipToState,
        shipToZip,
        shipToCID,
        nmfc,
        //pallets,
        shipTofob,
        shipFromfob,
        carrier,
        frieghtChargeTerms,
        carrierTransMethodCode,
        shipToHiddenField,
        loadIdField,
        masterBillOfNumField
      } = addBodyFields(form);


      setRadioButtonValue(masterRadio,standaloneRadio,cosolidatedRadio,parameters)
      var defaultValues = {
        custpage_startdate: parameters.custpage_startdate,
        custpage_enddate: parameters.custpage_enddate,
        custpage_customer: parameters.custpage_customer,
        custpage_total_cubage: parameters.custpage_cubage,
        custpage_total_weight: parameters.custpage_total_weight,
        //custpage_fg_1:parameters.custpage_radiofield

        
        
        //custpage_location: parameters.custpage_location
      };
      form.updateDefaultValues(defaultValues);

      form.addSubmitButton({
        label: "Submit"
      });

      if (context.request.method != "GET") {
        form.addFieldGroup({
          id: "custpage_fg_2",
          label: "Item Fulfillments"
        });
        var formatted = formatJSON(
          resultsToJSON(
            getTransactions(
              "transaction",
              parameters.custpage_customer,
              parameters.custpage_startdate,
              parameters.custpage_enddate
              // parameters.custpage_location
            )
          )
        );
      //  log.debug('formatted', formatted)

        if (formatted) {
          arrayoftabs.defaultValue = JSON.stringify(
            addTabbedSublist(form, formatted)
          );
        }

        //update ship from location field
        shipFromLocation(parameters, shipFrom, location);
        //update sps fields
        addSpsFields(
          parameters,
          proNumber,
          scac,
          nmfc,
          //pallets,
          shipTofob,
          shipFromfob,
          carrier,
          carrierTransMethodCode
        );
        //update ship fields
        shipToLocation( 
          parameters,
          shipToName,
          shipToAddress,
          shipToCity,
          shipToState,
          shipToZip,
          shipToCID,
          frieghtChargeTerms,shipToCustAddress,shipToHiddenField,loadIdField,masterBillOfNumField);
          
      }

      return form;
    } catch (e) {
      log.debug("error in mainForm", e.toString());
    }
  }

  function postMethod(context, parameters) {
    try {
      var obj = JSON.parse(context.request.body);
    } catch (e) {
      var obj = {};
    }
//log.debug('postMethod',parameters);
    if (parameters.custpage_radiofield === "consolidated" &&
    parameters.custpage_array_of_tabs) {
      getSublistDataPDF(parameters, context, true);
      openPdfInTab(context, true, parameters);
    } else if (parameters.custpage_radiofield === "standalone" &&
    parameters.custpage_array_of_tabs) {
      getSublistDataPDF(parameters, context, false);
      openPdfInTab(context, false, parameters);
    } else if (parameters.custpage_radiofield === "masterandinvd" &&
    parameters.custpage_array_of_tabs) {
      //todo remaining - done mixed one too
     // log.debug('parameters',parameters)
      getSublistDataPDF(parameters, context, true);
      getSublistDataPDF(parameters, context, false);
      openPdfInTab(context, "", parameters);
    } else if (obj && obj.extraRecToCreate) {
      pdfDetailRecCreatefunc(obj.extraRecToCreate, obj.consolidated);
    } else if (obj && obj.submitRecToUpdate) {
      submitDataonPdfRecFunc(
        obj.customRecResult,
        obj.masterData,
        obj.submitRecToUpdate,
        obj.consolidated
      );
    } else {
      context.response.writePage( mainForm(context, parameters));
    }
  }
 function setRadioButtonValue(masterRadio,standaloneRadio,cosolidatedRadio,parameters){
let radioField1Value=parameters.custpage_radiofield
if(radioField1Value=='standalone'){
  standaloneRadio.defaultValue='standalone'
}else if(radioField1Value=='consolidated'){
  cosolidatedRadio.defaultValue='consolidated'
}else if(radioField1Value=='masterandinvd'){
  masterRadio.defaultValue='masterandinvd'
}
 }
  function openPdfInTab(context, consolidated, parameters) {
    let outputUrl = makeSuiteLetUrl(parameters);
    let pdfArr = [];

    var pdfUrlSearch = pdfUrlSearchFunc(consolidated);
    log.debug('pdfUrlSearch 232',pdfUrlSearch)
    //! imp todo how will you know how many to print or how many are created just now
    for (let i = 0; i < pdfUrlSearch.length; i++) {
      let pdfUrl = pdfUrlSearch[i].getValue({
        name: "custrecord_gbs_bol_print_pdf_url",
        label: "URL"
      });

      if (consolidated === "") {
        id = pdfUrl.substring(pdfUrl.search("id") + 3, pdfUrl.search("&"));
        pdfArr.push(id);
      } else {
        pdfArr.push(pdfUrl);
      }
    }
    // log.debug({
    //   title: "pdfArr244",
    //   details: pdfArr
    // });

    //if consolidated == both
    pdfArr =
      consolidated === ""
        ? masterIndvPdfUrlArr(consolidated, pdfUrlSearch, pdfArr)
        : pdfArr;
//log.debug('pdfArr229',pdfArr)
    pdfArr.forEach((URL) => {
     // log.debug('231')
      context.response.write(
        `<html><head><script>window.open("${URL}")</script></head></html>`
      );
    });

    context.response.write(
      `<html><head><script>window.location.href = '${outputUrl}'</script></head></html>`
    );
  }

  function pdfUrlSearchFunc(consolidated, combine) {
    // log.debug({
    //   title: "executedTime declred globally 2",
    //   details: executedTime
    // });
    let filters = [];
    if (consolidated) {
      filters.push(["custrecord_gbs_bol_print_pdf_chkbx", "is", consolidated]);
      filters.push("AND");
    }
    if (combine) {
      filters.push("AND");
      filters.push(["custrecord_gbs_bol_print_pdf_combine_chk", "is", combine]);
    }
    executedTime = executedTime.toString();
    executedTime = executedTime.replace(":00 am", " am");
    executedTime = executedTime.replace(":00 pm", " pm");
    filters.push(["lastmodified", "onorafter", executedTime]);

    // log.debug({
    //   title: "filters",
    //   details: filters
    // });

    var customrecord_gbs_bol_print_pdf_recSearchObj = search.create({
      type: "customrecord_gbs_bol_print_pdf_rec",
      filters: filters,
      columns: [
        // search.createColumn({
        //   name: "custrecord_gbs_bol_print_pdf_chkbx",
        //  // sort: search.Sort.DESC,
        //   label: "Consolidated"
        // }),
        search.createColumn({
          name: "custrecord_gbs_bol_print_pdf_chkbx",
          sort: search.Sort.ASC,
          label: "Consolidated"
       }),
        search.createColumn({
          name: "custrecord_gbs_bol_print_pdf_url",
          label: "URL"
        }),
        search.createColumn({name: "internalid", label: "Internal ID"})
      ]
    });
    var pdfUrlSearch = customrecord_gbs_bol_print_pdf_recSearchObj
      .run()
      .getRange(0, 1000);
    log.debug("pdfUrlSearch result count", pdfUrlSearch);
    return pdfUrlSearch;
  }

  function masterIndvPdfUrlArr(consolidated, pdfUrlSearch, pdfArr) {
  //  log.debug('pdfArr311',pdfArr)
   // pdfArr.push(pdfArr.shift())
   pdfArr.unshift(pdfArr.pop())
   // log.debug('pdfArr322',pdfArr)
    if (consolidated === "") {
      let customRecResult = customRecSearch(consolidated, true);
      let pdfInHundreds = Math.ceil(pdfUrlSearch.length / 100);
      let extraRecToCreate = pdfInHundreds - customRecResult.length;
      let combinedArr = [];
      let finalCombinedArr = [];
      //create new if not already created for combine
      if (_logValidation(extraRecToCreate)) {
        for (let k = 0; k < extraRecToCreate; k++) {
          let combineId = createPdfRecforMasterIdv(pdfArr);
          combinedArr.push(combineId);
        }
      } else {
        //if already created then just do submit fields on the original ones
        //if there is 150 files then it would be divided into two 75 and 75 array
        //and start of would be the id of the record to which the combine pdf will be generated to
        pdfArr = chunkArray(pdfArr, pdfInHundreds);
        // log.debug({
        //   title: "pdfArr chunkArray",
        //   details: pdfArr
        // });
        for (let k = 0; k < pdfInHundreds; k++) {
          combineId = customRecResult[k].id;
          // log.debug("customRecResult[k]", customRecResult[k]);
          // log.debug("pdfArr[k]", pdfArr[k]);
          record.submitFields({
            type: "customrecord_gbs_bol_print_pdf_rec",
            id: combineId,
            values: {
              custrecord_gbs_bol_print_pdf_combine_chk: true,
              custrecord_gbs_bol_print_pdf_item_data: JSON.stringify(pdfArr[k]) //this is used for all whether consolidated or not
            }
          });
          combinedArr.push(combineId);
        }
      }
      if (combinedArr.length === 1) {
        searchLookupforCombined(combinedArr, finalCombinedArr);
        return finalCombinedArr;
      } else {
        searchLookupforCombined(combinedArr, finalCombinedArr);
        //! todo search criteria last modified just now this minute stuck here
        pdfUrlSearch = pdfUrlSearchFunc("", true);
        masterIndvPdfUrlArr("", pdfUrlSearch, finalCombinedArr);
      }
    }
  }

  function createPdfRecforMasterIdv(pdfArr) {
    let detailRecord = record.create({
      type: "customrecord_gbs_bol_print_pdf_rec"
    });

    //setvalue of combine true
    detailRecord.setValue("custrecord_gbs_bol_print_pdf_combine_chk", true);
    detailRecord.setValue(
      "custrecord_gbs_bol_print_pdf_item_data",
      JSON.stringify(pdfArr)
    );

    //usage 20
    let combineId = detailRecord.save();
    return combineId;
  }

  function searchLookupforCombined(combinedArr, finalCombinedArr) {
    for (let u = 0; u < combinedArr.length; u++) {
      var combineUrlforHundred = search.lookupFields({
        type: "customrecord_gbs_bol_print_pdf_rec",
        id: combinedArr[u],
        columns: "custrecord_gbs_bol_print_pdf_url"
      });
      finalCombinedArr.push(
        combineUrlforHundred.custrecord_gbs_bol_print_pdf_url
      );
      //log.debug('finalCombinedArr',finalCombinedArr)
    }
  }

  const chunkArray = (arr = [], chunkCount) => {
    const chunks = [];
    while (arr.length) {
      const chunkSize = Math.ceil(arr.length / chunkCount--);
      const chunk = arr.slice(0, chunkSize);
      chunks.push(chunk);
      arr = arr.slice(chunkSize);
    }
    return chunks;
  };

  function makeSuiteLetUrl(parameters) {
    var suiteletURL = url.resolveScript({
      scriptId: "customscript_gbs_consolidated_bol",
      deploymentId: "customdeploy_gbs_consolidated_bol",
      params: {
        custpage_startdate: parameters.custpage_startdate,
        custpage_enddate: parameters.custpage_enddate,
        custpage_customer: parameters.custpage_customer,
       // custpage_total_cubage: parameters.custpage_cubage,
        //custpage_total_weight: parameters.custpage_total_weight
      },
      returnExternalUrl:false
      
    });

    

    // let output = url.resolveDomain({
    //   hostType: url.HostType.APPLICATION
    // });

    // output = "https://" + output + suiteletURL;
    return suiteletURL;
  }

  function getSublistDataPDF(parameters, context, consolidated) {
    try {
      var totalWeight = 0;
      var ItemFullIdArr = [];
      var masterData = {};
      var arrayOfTabs = JSON.parse(parameters.custpage_array_of_tabs);
      masterData.singlePdfWeight = {};
      masterData.body = {};

      for (var x = 0; x < arrayOfTabs.length; x++) {
        var sublist = arrayOfTabs[x];
        var subLineCount = context.request.getLineCount({
          group: sublist
        });
        for (var y = 0; y < subLineCount; y++) {
          var mark = context.request.getSublistValue({
            group: sublist,
            name: "custpage_subitem_mark",
            line: y
          });
          

          if (mark == "T") {
            
            var ItemFullId = context.request.getSublistValue({
              group: sublist,
              name: "custpage_subitem_itemid",
              line: y
            });
            //log.debug('ItemFullId', ItemFullId)
            //push this in masterdata
            ItemFullIdArr.includes(ItemFullId)
              ? ""
              : ItemFullIdArr.push(ItemFullId);

            var weight = context.request.getSublistValue({
              group: sublist,
              name: "custpage_subitem_weight",
              line: y
            });
            //rewrite total weight to 0 for every new sublist since it is standalone
            if (weight) {
              weight = parseFloat(weight).toFixed(2);
              weight = parseFloat(weight);
              //log.debug('masterData.singlePdfWeight[ItemFullId]', masterData.singlePdfWeight[ItemFullId])
              masterData.singlePdfWeight[ItemFullId] = masterData
                .singlePdfWeight[ItemFullId]
                ? parseFloat(masterData.singlePdfWeight[ItemFullId]) + weight
                : weight;
              totalWeight = parseFloat(totalWeight).toFixed(2) + weight;
              
            }
          }
        }
      }

      //distinguish between single and consolidated
      totalPages= ItemFullIdArr.length
      masterData.selectedIfArr = ItemFullIdArr;
      masterData.totalweight = totalWeight;
      masterData.isconsolidated = consolidated;
      masterData.body.customer = parameters.custpage_customer;
      masterData.body.carrier = parameters.custpage_carrier_ship;
      masterData.body.shipToName = parameters.custpage_shiptoname;
      masterData.body.shipToAddress = parameters.custpage_shiptoaddress;
      masterData.body.shipToCity = parameters.custpage_shiptocity;
      masterData.body.shipToState = parameters.custpage_shiptostate;
      masterData.body.shipToZip = parameters.custpage_shiptozip;
      masterData.body.shiptocid = parameters.custpage_shiptocid;
      masterData.body.proNumber = parameters.custpage_pro_number;
      masterData.body.pdfType = parameters.custpage_radiofield
      masterData.body.loadID=parameters.custpage_loadid
      masterData.body.mblNumber=parameters.custpage_mblnum

      // if(parameters.custpage_radiofield=='masterandinvd'){
      //   masterData.body.mabdDateCommon=getMAdbDate(ItemFullIdArr)
      // }
      masterData.body.scac = parameters.custpage_scac;
      masterData.body.nmfc = parameters.custpage_nmfc;
      masterData.body.frieghtChargeTerms =parameters.custpage_fright_charge_terms;
      masterData.body.shipTofobVal = parameters.custpage_shiptofob;
      masterData.body.shipFromfobVal = parameters.custpage_shipfrom_fob;
      masterData.body.carrierTransMethodCode = parameters.custpage_sps_carriertransmethodcode;
      masterData.body.shipFrom = parameters.custpage_location;
      masterData.body.shipFromText = parameters.custpage_shipfrom;
      //log.debug("masterData", masterData);

      //search count
      let customRecResult = customRecSearch(consolidated); //10
      //log.debug('customRecResult',customRecResult)
      let extraRecToCreate =
        masterData.selectedIfArr.length - customRecResult.length;
//log.debug('extraRecToCreate',extraRecToCreate)
      if (
        (extraRecToCreate > 0 && !consolidated) ||
        (consolidated && customRecResult.length === 0)
      ) {
        let obj = {
          extraRecToCreate: extraRecToCreate,
          consolidated: consolidated
        };
       // log.debug('488');
        callSuitelet(obj); //10
       // log.debug('490');
        customRecResult = customRecSearch(consolidated); //10
       // log.debug('492');
      }
log.debug('masterData 531 ',masterData)
      submitDataonPdfRecFunc(customRecResult, masterData, 0, consolidated);
    } catch (error) {
      log.debug({
        title: "error getSublistDataPDF",
        details: error
      });
    }
  }

  /*function submitDataonPdfRecFunc(
    customRecResult,
    masterData,
    u,
    consolidated
  ) {
    try {
      let length = consolidated ? 1 : masterData.selectedIfArr.length;
      log.debug('masterData566',masterData)
      if(consolidated=='ture'||consolidated==true&&masterData.body.pdfType=="masterandinvd"){
        totalPages=totalPages+1
      }else if(consolidated=='true'||consolidated==true&&masterData.body.pdfType=="consolidated"){
        totalPages=1
      }else if(consolidated=='false'||consolidated==false&&masterData.body.pdfType=="masterandinvd"){
        totalPages=totalPages+1
      }
      for (let k = 0; k < length; k++) {
        if (_logValidation(u)) {
          k = u;
          u = 0;
        }
      //  log.debug('k',k)
        //log.debug('pageNumber before',pageNumber)
       // log.debug('totalPages',totalPages)
        
        let custRecDetailPdfId = customRecResult[k].getValue({
          name: "internalid",
          label: "Internal ID"
        });
        //usage 10
        masterData.body.pageNum=pageNumber
        pageNumber=pageNumber+1
        log.debug('consolidated',consolidated)
        log.debug('masterData.body.pdfType',masterData.body.pdfType)
     
        masterData.body.totalPages=totalPages
        //log.debug('pageNumber after',pageNumber)
      let recId=  record.submitFields({
          type: "customrecord_gbs_bol_print_pdf_rec",
          id: custRecDetailPdfId,
          values: {
            custrecord_gbs_bol_print_pdf_chkbx: masterData.isconsolidated,
            custrecord_gbs_bol_print_pdf_item_data: JSON.stringify({
              ifid: consolidated
                ? masterData.selectedIfArr //if consolidated then whole array
                : [masterData.selectedIfArr[k]], //if single pdf then one by one in array submit fields
              singleIfPdfWeight: consolidated // if consolidated then only one rec nothing
                ? masterData.singlePdfWeight //if consolidated then whole array weight
                : masterData.singlePdfWeight[masterData.selectedIfArr[k]],
              totalWeight: masterData.totalweight // this is used for consolidated only
            }),
            custrecord_gbs_bol_print_pdf_othr_bdy_dt: JSON.stringify(
              masterData.body
            ), //this is used for all whether consolidated or not
            custrecord_gbs_bol_print_detail_pdf_modi: true
          }
        });
        log.debug('recId',recId)
        let usage = runtime.getCurrentScript().getRemainingUsage();
        if (usage < 500) {
          let obj = {
            submitRecToUpdate: k + 1,
            customRecResult: customRecResult,
            masterData: masterData
          };
          callSuitelet(obj);
          break;
        }
      }
    } catch (error) {
      log.debug({
        title: "error submitDataonPdfRecFunc",
        details: error
      });
    }
  }*/
  function submitDataonPdfRecFunc(
    customRecResult,
    masterData,
    u,
    consolidated
  ) {
    try {
      let length = consolidated ? 1 : masterData.selectedIfArr.length;

      for (let k = 0; k < length; k++) {
        if (_logValidation(u)) {
          k = u;
          u = 0;
        }
        let custRecDetailPdfId = customRecResult[k].getValue({
          name: "internalid",
          label: "Internal ID"
        });
        //usage 10
        record.submitFields({
          type: "customrecord_gbs_bol_print_pdf_rec",
          id: custRecDetailPdfId,
          values: {
            custrecord_gbs_bol_print_pdf_chkbx: masterData.isconsolidated,
            custrecord_gbs_bol_print_pdf_item_data: JSON.stringify({
              ifid: consolidated
                ? masterData.selectedIfArr //if consolidated then whole array
                : [masterData.selectedIfArr[k]], //if single pdf then one by one in array submit fields
              singleIfPdfWeight: consolidated // if consolidated then only one rec nothing
                ? masterData.singlePdfWeight //if consolidated then whole array weight
                //: masterData.singlePdfWeight[masterData.selectedIfArr[k]],
                : masterData.singlePdfWeight,
              totalWeight: masterData.totalweight // this is used for consolidated only
            }),
            custrecord_gbs_bol_print_pdf_othr_bdy_dt: JSON.stringify(
              masterData.body
            ), //this is used for all whether consolidated or not
            custrecord_gbs_bol_print_detail_pdf_modi: true
          }
        });
        let usage = runtime.getCurrentScript().getRemainingUsage();
        if (usage < 500) {
          let obj = {
            submitRecToUpdate: k + 1,
            customRecResult: customRecResult,
            masterData: masterData
          };
          callSuitelet(obj);
          break;
        }
      }
    } catch (error) {
      log.debug({
        title: "error submitDataonPdfRecFunc",
        details: error
      });
    }
  }
  function pdfDetailRecCreatefunc(extraRecToCreate, consolidated) {
    try {
     // log.debug("extraRecToCreate 396", extraRecToCreate);
     // log.debug("consolidated 396", consolidated);
      extraRecToCreate = parseInt(extraRecToCreate);
      let z = consolidated ? 1 : extraRecToCreate;
      for (let i = 0; i < extraRecToCreate; i++) {
        if (z != 0) {
          //usage 10
          let detailRecord = record.create({
            type: "customrecord_gbs_bol_print_pdf_rec"
          });

          //setvalue of is consolidated true if consolidated
          consolidated
            ? detailRecord.setValue("custrecord_gbs_bol_print_pdf_chkbx", true)
            : "";

          //usage 20
          detailRecord.save();
          let usage = runtime.getCurrentScript().getRemainingUsage();
          if (usage < 500) {
            let obj = { extraRecToCreate: z };
            callSuitelet(obj);
            break;
          }
          z--;
        }
      }
    } catch (error) {
      log.debug("error pdfDetailRecCreatefunc", error);
    }
  }

  function callSuitelet(obj) {
    try {
      let suiteletURL = url.resolveScript({
        scriptId: "customscript_gbs_consolidated_bol",
        deploymentId: "customdeploy_gbs_consolidated_bol",
        returnExternalUrl: true
      });
      //log.debug('suiteletURL ', suiteletURL);
      obj = JSON.stringify(obj);
      let postArrData = https.post({
        url: suiteletURL,
        body: obj
      });
     // log.debug("postArrData.body", postArrData.body);
      let responesArr = _logValidation(postArrData.body)
        ? JSON.parse(postArrData.body)
        : "";
     // log.debug({ title: "responesArr", details: responesArr });

      return responesArr;
    } catch (error) {
      log.debug({
        title: "error callsuitelet",
        details: error
      });
    }
  }

  function customRecSearch(consolidated, combine) {
    try {
      let filters = [];
      consolidated
        ? filters.push([
            "custrecord_gbs_bol_print_pdf_chkbx",
            "is",
            consolidated
          ])
        : "";

      if (combine) {
        consolidated ? filters.push("AND") : "";
        filters.push([
          "custrecord_gbs_bol_print_pdf_combine_chk",
          "is",
          combine
        ]);
      }

      var customrecord_gbs_bol_print_pdf_recSearchObj = search.create({
        type: "customrecord_gbs_bol_print_pdf_rec",
        filters: filters,
        columns: [
          search.createColumn({ name: "internalid", label: "Internal ID" }),
          
        ]
      });
      //log.debug('customrecord_gbs_bol_print_pdf_recSearchObj',customrecord_gbs_bol_print_pdf_recSearchObj)
      var customRecResult = customrecord_gbs_bol_print_pdf_recSearchObj
        .run()
        .getRange(0, 1000);
      // log.debug(
      //   "customrecord_gbs_bol_print_pdf_recSearchObj result count",
      //   customRecResult
      // );

      return customRecResult;
    } catch (error) {
      log.debug({
        title: "error in customRecSearch",
        details: error
      });
    }
  }

  function shipFromLocation(parameters, shipFrom, location) {
    let getLocation = parameters.custpage_location;

    if (_logValidation(getLocation)) {
      location.defaultValue = getLocation;

      // let getShipFromLocation = record.load({
      //   type: "location",
      //   id: getLocation
      // });

      // let getShipFromLocationText = getShipFromLocation.getText({
      //   fieldId: "mainaddress_text"
      // });

      //shipFrom.defaultValue = getShipFromLocationText;
      shipFrom.defaultValue = parameters.custpage_shipfrom
    }
  }

  function shipToLocation(
    parameters,  
    shipToName,
    shipToAddress,
    shipToCity,
    shipToState,
    shipToZip, 
    shipToCID,
     frieghtChargeTerms,
     shipToCustAddress,
     shipToHiddenField,
     loadIdField,
     masterBillOfNumField
     ) {
    let shipToNameValue = parameters.custpage_shiptoname;
    let shipToAddressValue = parameters.custpage_shiptoaddress;
    let shipToCityValue = parameters.custpage_shiptocity;
    let shipToStateValue = parameters.custpage_shiptostate;
    let shipToZipValue = parameters.custpage_shiptozip;
    let loadIdFieldValue=parameters.custpage_loadid
    let mblNumValue=parameters.custpage_mblnum
    
   
    let shipToCIDValue = parameters.custpage_shiptocid;
    let frieghtVal = parameters.custpage_fright_charge_terms;
    let shipToCustVal=parameters.custpage_custshiptoaddress;
    let shipToHiddenValue=parameters.custpage_custshiptoaddress;
    if(mblNumValue){
      masterBillOfNumField.defaultValue =mblNumValue
    }
    if(loadIdFieldValue){
      loadIdField.defaultValue =loadIdFieldValue
    }
    if(shipToHiddenValue){
      shipToHiddenField.defaultValue =shipToHiddenValue
    }
  if(shipToCustVal){
    shipToCustAddress.defaultValue = shipToCustVal;
  }
    if (frieghtVal) {
      frieghtChargeTerms.defaultValue = frieghtVal;
    }

    if (shipToCIDValue) {
      shipToCID.defaultValue = shipToCIDValue;
    }
    
    if (shipToNameValue) {
      shipToName.defaultValue = shipToNameValue;
    }

    if (shipToAddressValue) {
      shipToAddress.defaultValue = shipToAddressValue;
    }

    if (shipToCityValue) {
      shipToCity.defaultValue = shipToCityValue;
    }

    if (shipToStateValue) {
      shipToState.defaultValue = shipToStateValue;
    }

    if (shipToZipValue) {
      shipToZip.defaultValue = shipToZipValue;
    }
  }

  function addBodyFields(form) {
    form.addFieldGroup({
      id: "custpage_fg_1",
      label: "Filters"
    });
   let masterRadio= form.addField({
      id: "custpage_radiofield",
      type: serverWidget.FieldType.RADIO,
      label: "Print Master and Individual",
      source: "masterandinvd",
      container: "custpage_fg_1"
    });
    let standaloneRadio=form.addField({
      id: "custpage_radiofield",
      type: serverWidget.FieldType.RADIO,
      label: "Print Standalone PDF(s)",
      source: "standalone",
      container: "custpage_fg_1"
    });
    let cosolidatedRadio=form.addField({
      id: "custpage_radiofield",
      type: serverWidget.FieldType.RADIO,
      label: "Print Consolidated PDF",
      source: "consolidated",
      container: "custpage_fg_1"
    });

    form.addField({
      id: "custpage_startdate",
      type: serverWidget.FieldType.DATE,
      label: "Start Date",
      container: "custpage_fg_1"
    }).isMandatory = true;
    form.addField({
      id: "custpage_enddate",
      type: serverWidget.FieldType.DATE,
      label: "End Date",
      container: "custpage_fg_1"
    }).isMandatory = true;
    var customer = form.addField({
      id: "custpage_customer",
      type: serverWidget.FieldType.SELECT,
      label: "Customer",
      source: "customer",
      container: "custpage_fg_1"
    });
    customer.isMandatory = true;

    var totalCubage = form.addField({
      id: "custpage_total_cubage",
      type: serverWidget.FieldType.TEXT,
      label: "Total Cubage",
      container: "custpage_fg_1"
    });
    totalCubage.updateDisplayType({
      displayType: serverWidget.FieldDisplayType.INLINE
    });
    var totalWeight = form.addField({
      id: "custpage_total_weight",
      type: serverWidget.FieldType.TEXT,
      label: "Total Weight",
      container: "custpage_fg_1"
    });
    totalWeight.updateDisplayType({
      displayType: serverWidget.FieldDisplayType.INLINE
    });
    var arrayoftabs = form.addField({
      id: "custpage_array_of_tabs",
      type: serverWidget.FieldType.LONGTEXT,
      label: "tabs array",
      container: "custpage_fg_1"
    });
    arrayoftabs.updateDisplayType({
      displayType: serverWidget.FieldDisplayType.HIDDEN
    });
    var location = form.addField({
      id: "custpage_location",
      type: serverWidget.FieldType.SELECT,
      label: "Location",
      source: "location",
      container: "custpage_fg_1"
    });
    var shipFrom = form.addField({
      id: "custpage_shipfrom",
      type: serverWidget.FieldType.LONGTEXT,
      label: "Ship From",
      container: "custpage_fg_1"
    });

    var shipFromfob = form.addField({
      id: "custpage_shipfrom_fob",
      type: serverWidget.FieldType.CHECKBOX,
      label: "Ship From FOB",
      container: "custpage_fg_1"
    });

    form.addFieldGroup({
      id: "custpage_fg_2",
      label: "Ship To Address"
    });

    var shipToCustAddress = form.addField({
      id: "custpage_custshiptoaddress",
      type: serverWidget.FieldType.SELECT,
      label: "Customer Ship To Address",
      container: "custpage_fg_2"
    });
    var shipToName = form.addField({
      id: "custpage_shiptoname",
      type: serverWidget.FieldType.TEXT,
      label: "Ship To Name",
      container: "custpage_fg_2"
    });

    var shipToAddress = form.addField({
      id: "custpage_shiptoaddress",
      type: serverWidget.FieldType.TEXT,
      label: "Address",
      container: "custpage_fg_2"
    });

    var shipToCity = form.addField({
      id: "custpage_shiptocity",
      type: serverWidget.FieldType.TEXT,
      label: "City",
      container: "custpage_fg_2"
    });

    var shipToState = form.addField({
      id: "custpage_shiptostate",
      type: serverWidget.FieldType.TEXT,
      label: "State",
      container: "custpage_fg_2"
    });

    var shipToZip = form.addField({
      id: "custpage_shiptozip",
      type: serverWidget.FieldType.TEXT,
      label: "Zip",
      container: "custpage_fg_2"
    });

    var shipToCID = form.addField({
      id: "custpage_shiptocid",
      type: serverWidget.FieldType.TEXT,
      label: "CID#",
      container: "custpage_fg_2"
    });

    var carrier = form.addField({
      id: "custpage_carrier_ship",
      type: serverWidget.FieldType.SELECT,
      label: "Carrier",
      container: "custpage_fg_2"
    });

let carrierListOptionResult=getCarrierList()
if(carrierListOptionResult){
for(let i=0;i<carrierListOptionResult.length;i++){
        let carrierList=carrierListOptionResult[i].getValue({ name: "itemid",
        sort: search.Sort.ASC,
        label: "Name"});
        carrier.addSelectOption({
          value : carrierList,
          text : carrierList
        });
}}
var mabdField = form.addField({
  id: "custpage_mabd",
  type: serverWidget.FieldType.DATE,
  label: "MABD",
  container: "custpage_fg_2"
});
    var shipTofob = form.addField({
      id: "custpage_shiptofob",
      type: serverWidget.FieldType.CHECKBOX,
      label: "Ship To FOB",
      container: "custpage_fg_2"
    });
    var loadIdField = form.addField({
      id: "custpage_loadid",
      type: serverWidget.FieldType.TEXT,
      label: "Load ID",
      container: "custpage_fg_2"
    });
    var masterBillOfNumField = form.addField({
      id: "custpage_mblnum",
      type: serverWidget.FieldType.TEXT,
      label: "Master Bill of Lading Number",
      container: "custpage_fg_2"
    });

    form.addFieldGroup({
      id: "custpage_fg_3",
      label: "SPS"
    });

    var proNumber = form.addField({
      id: "custpage_pro_number",
      type: serverWidget.FieldType.TEXT,
      label: "Pro Number",
      container: "custpage_fg_3"
    });

    var scac = form.addField({
      id: "custpage_scac",
      type: serverWidget.FieldType.TEXT,
      label: "SCAC",
      container: "custpage_fg_3"
    });

    var nmfc = form.addField({
      id: "custpage_nmfc",
      type: serverWidget.FieldType.TEXT,
      label: "NMFC",
      container: "custpage_fg_3"
    });

    var frieghtChargeTerms = form.addField({
      id: "custpage_fright_charge_terms",
      type: serverWidget.FieldType.SELECT,
      label: "Freight Charge Terms",
      container: "custpage_fg_3"
    });

    frieghtChargeTerms.addSelectOption({
      value: "",
      text: ""
    });
    frieghtChargeTerms.addSelectOption({
      value: "Collect",
      text: "Collect"
    });
    frieghtChargeTerms.addSelectOption({
      value: "Prepaid selection",
      text: "Prepaid selection"
    });
    frieghtChargeTerms.addSelectOption({
      value: "3rd party selection",
      text: "3rd party selection"
    });

    var carrierTransMethodCode = form.addField({
      id: "custpage_sps_carriertransmethodcode",
      type: serverWidget.FieldType.TEXT,
      label: "CARRIER TRANSPORTATION METHOD CODE",
      container: "custpage_fg_3"
    });
    var shipToHiddenField=form.addField({
      id: "custpage_shiptoaddressselected",
      type: serverWidget.FieldType.INTEGER,
      label: "selected shipaddress",
      container: "custpage_fg_3"
    }).updateDisplayType({
      displayType: serverWidget.FieldDisplayType.HIDDEN
    });
    return {
      masterRadio,
      standaloneRadio,
      cosolidatedRadio,
      arrayoftabs,
      shipFrom,
      location,
      proNumber,
      scac,
      shipToName,
      shipToCustAddress,
      shipToAddress,
      shipToCity,
      shipToState,
      shipToZip,
      shipToCID,
      nmfc,
      shipTofob,
      shipFromfob,
      carrier,
      frieghtChargeTerms,
      carrierTransMethodCode,
      shipToHiddenField,
      loadIdField,
      masterBillOfNumField
    };
  }

  function addSpsFields(
    parameters,
    proNumber,
    scac,
    nmfc,
    //pallets,
    shipTofob,
    shipFromfob,
    carrier,
    carrierTransMethodCode
  ) {
    let proNumberValue = parameters.custpage_pro_number;
    let scacValue = parameters.custpage_scac;
    let nmfcValue = parameters.custpage_nmfc;
    let carrierTransMethodCodeVal = parameters.custpage_sps_carriertransmethodcode;
    //let palletsValue = parameters.custpage_pallets
    let shipTofobVal = parameters.custpage_shiptofob;
    let shipFromfobVal = parameters.custpage_shipfrom_fob;
    let Value = parameters.custpage_master_checkbox;
    let carrierVal = parameters.custpage_carrier_ship;

    if (proNumberValue) {
      proNumber.defaultValue = proNumberValue;
    }
    if (carrierVal) {
      carrier.defaultValue = carrierVal;
    }
    if (carrierTransMethodCodeVal) {
      carrierTransMethodCode.defaultValue = carrierTransMethodCodeVal;
    }
    if (shipTofobVal) {
      shipTofob.defaultValue = shipTofobVal;
    }
    if (shipFromfobVal) {
      shipFromfob.defaultValue = shipFromfobVal;
    }
    if (scacValue) {
      scac.defaultValue = scacValue;
    }

    if (nmfcValue) {
      nmfc.defaultValue = nmfcValue;
    }

    // if (pallets) {
    //   pallets.defaultValue = palletsValue
    // }
  }

  function getTransactions(recType, customer, startDate, endDate) {
    //filters.push(search.createFilter({name: 'mainline', operator: 'IS', values: 'F'}));
    //filters.push(search.createFilter({name: 'taxline', operator: 'IS', values: 'F'}));
    //filters.push(search.createFilter({name: 'shipline', operator: 'IS', values: 'F'}));
    //filters.push(search.createFilter({name: 'cogs', operator: 'IS', values: 'F'}));
    //log.debug('recType',recType)
    var results = search
      .create({
        type: recType,
        filters: [
          ["type", "anyof", "ItemShip"],
          "AND",
          ["status", "anyof", "ItemShip:C", "ItemShip:B", "ItemShip:A"],
          "AND",
          ["name", "anyof", customer],
          "AND",
          ["trandate", "onorafter", startDate],
          "AND",
          ["trandate", "onorbefore", endDate],
          "AND",
          ["shipping", "is", "F"],
          "AND",
          ["formulanumeric: MOD({linesequencenumber},3)", "equalto", "0"]
        ],
        columns: [
          search.createColumn({ name: "internalid", label: "Internal ID" }),
          search.createColumn({ name: "tranid", label: "Document Number" }),
          search.createColumn({ name: "custbody_sps_ponum_from_salesorder",sort: search.Sort.ASC, label: "Document PO Num" }),
          search.createColumn({ name: "item", label: "Item" }),
          search.createColumn({
            name: "salesdescription",
            join: "item",
            label: "Description"
          }),
          search.createColumn({ name: "quantity", label: "Quantity" }),
          search.createColumn({
            name: "formulanumeric",
            formula: "{item.weight} * {quantity}",
            label: "Weight"
          }),
          // search.createColumn({
          //   name: "formulanumeric",
          //   formula: "{item.custitem3} *  {item.custitem1} * {item.custitem2}",
          //   label: "cubage"
          // }),
          // search.createColumn({
          //   name: "formulanumeric",
          //   formula:
          //     "{item.custitem3} *  {item.custitem1} * {item.custitem2} * {quantity}",
          //   label: "totalcubage"
          // })
        ]
      })
      .run()
      .getRange({ start: 0, end: 1000 });

    if (!results || results.length == 0) {
      return false;
    }
    //log.debug("results1185", results);
    return results;
  }

  function addTabbedSublist(form, json) {
    //log.debug({ title: "addTabbedSublist Started..." });
    var arrayOfTabs = [];
   // log.debug('json',json)
    var jsonLen = json.length;
    //log.debug({ title: "jsonLen", details: jsonLen });
    for (var x = 0; x < jsonLen; x++) {
      var jsonRec = json[x];
      //log.debug('jsonRec',jsonRec)
      var tabId = "custpage_tab_" + x;
    //  log.debug({title: 'tabId', details: tabId});
      var tabLabel = jsonRec.documentnumber;
     // log.debug({title: 'tabLabel', details: tabLabel});
      var tabItems = jsonRec.items;
    //  log.debug({ title: "tabItems", details: tabItems });
      var sublistId = "custpage_sub_" + x;
      // log.debug({ title: "sublistId", details: sublistId });
      arrayOfTabs.push(sublistId);
      form.addTab({
        id: tabId,
        label: tabLabel?tabLabel:' '
      });
      addSublistFromJSON(form, sublistId, tabItems, "Items", tabId);
    }

    //log.debug({ title: 'arrayOfTabs', details: arrayOfTabs })
    return arrayOfTabs;
  }

  function addSublistFromJSON(form, sublistId, json, sublistLabel, tab) {
    //log.debug({ title: "addSublistFromJSON Started..." });
    if (!json || json.length == 0) {
      //log.debug({ title: "No items for sublist" });
      return;
    }
    // Create Sublist
    var sublist = form.addSublist({
      id: sublistId,
      type: serverWidget.SublistType.LIST,
      label: sublistLabel,
      tab: tab
    });

    sublist.addMarkAllButtons();
    sublist.addField({
      id: "custpage_subitem_mark",
      label: "mark",
      type: serverWidget.FieldType.CHECKBOX
    });
    var resCount = json.length;
    //log.debug({title: 'resCount', details: resCount});
    //log.debug({title: 'Add Line Items to Sublist'});
    for (var j = 0; j < resCount; j++) {
      var result = json[j];
      var count = 0;
      for (n in result) {
        var id = "custpage_subitem_" + n;
        //log.debug({title: 'id', details: id});
        var label = n;
        //log.debug({title: 'label', details: label});
        var value = result[n];
        //log.debug({title: 'value', details: value});

        // Add Fields first and only once
        if (j == 0) {
          var field = sublist.addField({
            id: id,
            label: label,
            type: serverWidget.FieldType.TEXT
          });

          if (count > 6) {
            field.updateDisplayType({
              displayType: "hidden"
            });
          }
          count++;
        }
        // If the value is blank, set it to null to avoid errors
        if (!value) {
          value = null;
        }
        // Set the Values of the Fields
        sublist.setSublistValue({
          id: id,
          line: j,
          value: value
        });
      }
    }
  }

  function resultsToJSON(results) {
    if (results) {
     // log.debug('results in resultToJaosn',results)
      var records = [];
      var resultlen = results.length;

      for (x = 0; x < resultlen; x++) {
        var result = results[x];
        var col = result.columns;
        var record = {};
        if (result.id) {
          record["id"] = result.id;
        }

        for (n in col) {
          var label = col[n].label;
          var name = col[n].name;
          var join = col[n].join;
          var summary = col[n].summary;
          var value = result.getText({
            name: name,
            join: join,
            summary: summary
          })
            ? result.getText({ name: name, join: join, summary: summary })
            : result.getValue({ name: name, join: join, summary: summary });
          record[label] = value.replace("\r\n", "");
        }
        records.push(record);
      }
   //  log.debug('records in resulttojson', records)
      return records;
    } else {
      return false;
    }
  }

  function formatJSON(json) {
    if (json) {
      var jsonLen = json.length;

      //log.debug({ title: "Length", details: jsonLen });
      var records = [];
      var previous;
      for (x = 0; x < jsonLen; x++) {
        var row = json[x];
        var internalId = row["Internal ID"];
        var documentNumber = row["Document PO Num"];
        var recordObj = {};
        if (x == 0 || internalId != previous) {
          recordObj["internalid"] = internalId;
          recordObj["documentnumber"] = documentNumber;
          records.push(recordObj);
          previous = internalId;
        }
      }
      // log.debug({ title: "Records in formatjson", details: records });

      var recordsLen = records.length;
      for (var a = 0; a < recordsLen; a++) {
        var recordsRow = records[a];
        var recordId = recordsRow.internalid;
        var items = [];
        for (var b = 0; b < jsonLen; b++) {
          var jsonRow = json[b];
          var jsonId = jsonRow["Internal ID"];
          var itemObj = {};
          if (jsonId == recordId) {
            itemObj["itemid"] = jsonRow["Internal ID"];
            itemObj["item"] = jsonRow.Item;
            itemObj["description"] = jsonRow.Description;
            itemObj["quantity"] = jsonRow.Quantity;
            itemObj["weight"] = jsonRow.Weight;
            itemObj["cubage"] = jsonRow.cubage;
            itemObj["totalcubage"] = jsonRow.totalcubage;
            items.push(itemObj);
          }
        }
        recordsRow["items"] = items;
      }
      // log.debug({ title: "Records in formatjson", details: records });
      return records;
    } else {
      return false;
    }
  }

  function getParameters(context) {
    var request = context.request;
    //log.debug("request", request);
    var parameters = context.request.parameters;
    //log.debug("parameters", parameters);
    return {
      request,
      parameters
    };
  }
  function getMAdbDate(ifIdArr){
   // log.debug('ifIdArr',ifIdArr)
    var results = search
    .create({
      type: 'itemfulfillment',
      filters: [
        ["type","anyof","ItemShip"], 
        "AND", 
        ['mainline', 'is', 'T'],
        'AND',
        ['internalid', 'anyof', ifIdArr],
        "AND", 
        ["custbody_gbs_mabd","isnotempty",""]
      ],
      columns: [
        search.createColumn({name: "ordertype", label: "Order Type"}),
        search.createColumn({
           name: "custbody_gbs_mabd",
           sort: search.Sort.DESC,
           label: "Must Arrive By Date"
        }),
        search.createColumn({name: "tranid", label: "Document Number"})
    
      ]
    }).run()
    .getRange({ start: 0, end: 1000 });
  //log.debug('results',results)
  if (!results || results.length == 0) {
    return false
  }
  
   return results[0].getValue({ name: "custbody_gbs_mabd",
   sort: search.Sort.DESC,
   label: "Must Arrive By Date"})
  }
  function getCarrierList(){
    var shipitemSearchObj = search.create({
      type: "shipitem",
      filters:
      [
      ],
      columns:
      [
         search.createColumn({
            name: "itemid",
            sort: search.Sort.ASC,
            label: "Name"
         })
      ]
   });
   let serachResult=shipitemSearchObj.run().getRange(0,999)
   if(serachResult.length>0){
return serachResult
   }else{
    return false
   }
  }
  function _logValidation(value) {
    if (
      value != null &&
      value != "" &&
      value != "null" &&
      value != undefined &&
      value != "undefined" &&
      value != "@NONE@" &&
      value != "NaN"
    ) {
      return true;
    } else {
      return false;
    }
  }

  return {
    onRequest: onRequest
  };
});
