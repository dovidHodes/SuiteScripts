/**
 * Module Description
 *
 * Version    Date            Author           Remarks
 * 1.00       06 Nov 2014     evan
 * 2.00		  11 Jul 2018	  mbrewer		   resolved discreps. between batch and single print
 * 2.10		  25 Jan 2019	  mbrewer		   logic for custom xml template//custom xml maps added
 * 2.20		  20 May 2019	  mbrewer		   mixed labels "MIXED" text
 */

/**
 * @param {nlobjRequest} request Request object
 * @param {nlobjResponse} response Response object
 * @returns {Void} Any output is written via response object
 */
function suitelet(request, response){
	var id = request.getParameter('id') || false;
	var packid = request.getParameter('packid') || false; // packid is a string
	var accessFields = nlapiLookupField('customrecord_sps_label_access',1,['custrecord_sps_label_login_token','custrecord_uccuid','custrecord_sps_label_login_mfgid']) || false;
	var token = accessFields['custrecord_sps_label_login_token'];
	var labelSearch = nlapiGetContext().getSetting('SCRIPT','custscript_sps_label_api_search');
	nlapiLogExecution('DEBUG', 'token', token);
	if (id && packid && token) {
		var packuccid = nlapiLookupField('customrecord_sps_package', packid, 'custrecord_sps_package_ucc') || false;
		if (!packuccid) {
			//Generate unique UCC serial number, with valid check digit
			var mfgid = accessFields['custrecord_sps_label_login_mfgid'];
			var offsetValue = parseInt(accessFields['custrecord_uccuid']);
			var offset = isFinite(offsetValue) ? offsetValue : 0;
			var uccuid = (Number(packid) + offset) % 10000000;
			var uccbase = '00'+mfgid;
			while (uccbase.length + uccuid.toString().length < 17) {
				uccuid = '0'+uccuid.toString();
			}
			var uccready = uccbase+uccuid.toString();
			var arr = [0,0];
			for (var i=0; i<uccready.length; i++) {
				arr[Math.ceil((i+1)%2)]+=parseInt(uccready.charAt(i));
			}
			var checkdigit = (10-((arr[1]*3+arr[0])-(10*Math.floor((arr[1]*3+arr[0])/10)))).toString();
			var uccchecked = uccready.concat((checkdigit=='10') ? '0' : checkdigit);
			nlapiSubmitField('customrecord_sps_package', packid, 'custrecord_sps_package_ucc', uccchecked);
		}


		var contentsResults = getPackageContent(id,packid);
		var mixedPacks = [];
			for (var packId in contentsResults) {
				var packItems = [];
				for (var packItem in contentsResults[packId]) {
					if (packItems.indexOf(packItem) < 0) {
						packItems.push(packItem);
					}
				}
				if (packItems.length > 1) {
					mixedPacks.push(packid);
				}
			}
		//Find first item packed into package
		var contentFilters = [];
			contentFilters.push(new nlobjSearchFilter('custrecord_sps_content_package',null,'anyof',packid));
		var contentColumns = [];
			contentColumns[0] = new nlobjSearchColumn('custrecord_sps_content_item');
		var contentResults = nlapiSearchRecord('customrecord_sps_content',null,contentFilters,contentColumns);
		var packedItem = contentResults[0].getValue(contentColumns[0]);
		//Gather Package record data from existing saved search
		var filters = [];
		filters.push(new nlobjSearchFilter('internalid', null, 'is', id));
		filters.push(new nlobjSearchFilter('custrecord_sps_content_package', 'custrecord_pack_content_fulfillment', 'anyof', packid));
		filters.push(new nlobjSearchFilter('item',null,'anyof',packedItem));
		//var results = nlapiSearchRecord('transaction', 'customsearch_sps_label_map_template', filters);
		var results = nlapiSearchRecord('transaction', labelSearch, filters);

		nlapiLogExecution('DEBUG','LABEL SEARCH: '+labelSearch);
		for (var i=0; results!=null && i<1; i++) {
			//Map search results onto an object used with Handlebars template
			var columns = results[i].getAllColumns();
			var row = {};
			var fields = {};
			for (ea in columns) {
				if(columns[ea].getLabel()!='PackageID'){
                    var text = results[i].getText(columns[ea]) || false;
                    }
				row[columns[ea].getLabel()] = (!text) ? results[i].getValue(columns[ea]) : text;
				fields[columns[ea].getLabel()] = (columns[ea].getName().match('formula*')) ? columns[ea].getFormula() : columns[ea].getName();
			}

			var labelUID = row['LabelUID'] || false;
			nlapiLogExecution('ERROR', 'labelUID', labelUID);
			var packageID = row['PackageID'] || false;
			nlapiLogExecution('DEBUG', 'Looping results', results.length);
			var label = {
					'ShipmentIdentification': row['ShipmentIdentification'],
					'ShipmentDate': row['ShipmentDate'],
					'Vendor': row['Vendor'],
					'ShipmentLadingQuantity': row['ShipmentLadingQuantity'],
					'CarrierAlphaCode': row['CarrierAlphaCode'],
					'CarrierRouting': row['CarrierRouting'],
					'BillOfLadingNumber': row['BillOfLadingNumber'],
					'CarrierProNumber': row['CarrierProNumber'],
					'AppointmentNumber': row['AppointmentNumber'],
					'CurrentScheduledDeliveryDate': row['CurrentScheduledDeliveryDate'],
					'CartonCount': row['CartonCount'],
					'CartonTotal': row['CartonTotal'],
					'Comment1': row['Comment1'],
					'Comment2': row['Comment2'],
					'Comment3': row['Comment3'],
					'Comment4': row['Comment4'],
					'Comment5': row['Comment5'],
					'FlexField1': row['FlexField1'],
					'FlexField2': row['FlexField2'],
					'FlexField3': row['FlexField3'],
					'ShipFrom': {
						'ShipFromAddressLocationNumber': row['ShipFromAddressLocationNumber'],
						'ShipFromAddressName': row['ShipFromAddressName'],
						'ShipFromAddressAlternateName': row['ShipFromAddressAlternateName'],
						'ShipFromAddress1': row['ShipFromAddress1'],
						'ShipFromAddress2': row['ShipFromAddress2'],
						'ShipFromAddress3': row['ShipFromAddress3'],
						'ShipFromCity': row['ShipFromCity'],
						'ShipFromState': row['ShipFromState'],
						'ShipFromPostalCode': row['ShipFromPostalCode'],
						'ShipFromCountry': row['ShipFromCountry'],
						'ShipFromContactName': row['ShipFromContactName'],
						'ShipFromAddressAlternateName2': row['ShipFromAddressAlternateName2']
					},
					'ShipTo': {
						'ShipToAddressLocationNumber': row['ShipToAddressLocationNumber'],
						'ShipToAddressName': row['ShipToAddressName'],
						'ShipToAddressAlternateName': row['ShipToAddressAlternateName'],
						'ShipToAddress1': row['ShipToAddress1'],
						'ShipToAddress2': row['ShipToAddress2'],
						'ShipToAddress3': row['ShipToAddress3'],
						'ShipToCity': row['ShipToCity'],
						'ShipToState': row['ShipToState'],
						'ShipToPostalCode': row['ShipToPostalCode'],
						'ShipToCountry': row['ShipToCountry'],
						'ShipToContactName': row['ShipToContactName'],
						'ShipToAddressAlternateName2': row['ShipToAddressAlternateName2']
					},
					'Additional':{
						'AdditionalAddressLocationNumber': row['AdditionalAddressLocationNumber'],
						'AdditionalAddressName': row['AdditionalAddressName'],
						'AdditionalAddressAlternateName': row['AdditionalAddressAlternateName'],
						'AdditionalAddress1': row['AdditionalAddress1'],
						'AdditionalAddress2': row['AdditionalAddress2'],
						'AdditionalAddress3': row['AdditionalAddress3'],
						'AdditionalCity': row['AdditionalCity'],
						'AdditionalState': row['AdditionalState'],
						'AdditionalPostalCode': row['AdditionalPostalCode'],
						'AdditionalCountry': row['AdditionalCountry'],
						'AdditionalContactName': row['AdditionalContactName'],
						'AdditionalAddressAlternateName2': row['AdditionalAddressAlternateName2']
					},
					'InvoiceNumber': row['InvoiceNumber'],
					'PurchaseOrderNumber': row['PurchaseOrderNumber'],
					'ReleaseNumber': row['ReleaseNumber'],
					'PurchaseOrderDate': row['PurchaseOrderDate'],
					'Department': row['Department'],
					'Division': row['Division'],
					'BusinessFamily': row['BusinessFamily'],
					'CustomerAccountNumber': row['CustomerAccountNumber'],
					'CustomerOrderNumber': row['CustomerOrderNumber'],
					'PromotionDealNumber': row['PromotionDealNumber'],
					'OrderStatusCode': row['OrderStatusCode'],
					'NumberOfUnitsShipped': row['NumberOfUnitsShipped'],
					'ShipToName': row['ShipToName'],
					'ShipToAddressLocationNumber': row['OrderShipToAddressLocationNumber'],
					'Store': {
						'StoreName': row['StoreName'],
						'StoreNumber': row['StoreNumber'],
						'StoreAddress1': row['StoreAddress1'],
						'StoreAddress2': row['StoreAddress2'],
						'StoreCity': row['StoreCity'],
						'StoreState': row['StoreState'],
						'StorePostalCode': row['StorePostalCode'],
						'StoreCountry': row['StoreCountry']
					},
					'EventCode': row['EventCode'],
					'Packs': [],
					'Items': []
				};

			var item = {
					'BuyerPartNumber': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['BuyerPartNumber'],
					'VendorPartNumber': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['VendorPartNumber'],
					'ConsumerPackageCode': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ConsumerPackageCode'],
					'GTIN': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['GTIN'],
					'UPCCaseCode': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['UPCCaseCode'],
					'ShipQty': row['ShipQty'],
					'ShipQtyUOM': row['ShipQtyUOM'],
					'ProductSizeCode': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ProductSizeCode'],
					'ProductSizeDescription': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ProductSizeDescription'],
					'ProductColorCode': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ProductColorCode'],
					'ProductColorDescription': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ProductColorDescription'],
					'ProductWidthDescription': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ProductWidthDescription'],
					'ProductStyleDescription': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ProductStyleDescription'],
					'ProductDescription': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ProductDescription'],
					'Department': row['Department'],
					'Class': row['Class'],
					'ItemFlexField1': row['ItemFlexField1'],
					'ItemFlexField2': row['ItemFlexField2'],
					'ItemFlexField3': row['ItemFlexField3']
				};
//			label.Items.push(item);

			var pack = {
					'PackSize': row['PackSize'],
					'PackWeight': row['PackWeight'],
					'InnerPack': row['InnerPack'],
					'PackagingCharacteristicCode': row['PackagingCharacteristicCode'],
					'PackComment1': row['PackComment1'],
					'PackComment2': row['PackComment2'],
					'PackFlexField1': row['PackFlexField1'],
					'PackFlexField2': row['PackFlexField2'],
					'PackFlexField3': row['PackFlexField3'],
					'SerialShippingContainerCode': row['SerialShippingContainerCode'],
					'ShippingContainerCode': row['ShippingContainerCode'],
					'ExpirationDate': mixedPacks.indexOf(row['PackageID']) >= 0 ? 'MIXED' : row['ExpirationDate'],
					'LotNumber': row['LotNumber'],
					'PackNumberOfUnitsShipped': row['PackNumberOfUnitsShipped'],
					'ShipToOrDeliverToPostalCode': row['ShipToOrDeliverToPostalCode'],
					'UPC-ACaseCode': row['UPC-ACaseCode']
				};
//			label.Packs.push(pack);

			//Generate XML from Handlebars template
			var templateresults = nlapiSearchRecord(null, 'customsearch_sps_doc_search', new nlobjSearchFilter('name', null, 'contains', 'SPS_XML_Label_Batch_Template.xml'), null);
			//templateresults = nlapiSearchRecord(null, 'customsearch_sps_doc_search', new nlobjSearchFilter('name', null, 'contains', xmlTemplate), null);

			var templateid = templateid = templateresults[i].getId();


			label.Items.push(item);
			label.Packs.push(pack);
			var templatefile = nlapiLoadFile(templateid);
		    var template  = templatefile.getValue();
		    var compilation = Handlebars.compile(template, {compat: true});
		    var postdata = '<ShippingLabels>'+compilation(label) + '</ShippingLabels>';
		    //response.write(postdata);

			var filename = (packageID) ? packageID+' Label.pdf' : 'Label.pdf';
			if (labelUID == false) {
				var message = 'No customer label is defined. Please select one in the Package Contents tab, or setup a new label in the SPS Commerce center.';
				nlapiLogExecution('DEBUG', 'UNDEFINED LABELUID', message);
				nlapiSubmitField('customrecord_sps_package', packid, 'custrecord_sps_package_label_result', message); //2
				try{
					nlapiSubmitField('itemfulfillment', fulfillmentId, 'custbody_sps_lbl_msg', message); //2
				}catch(err){
					nlapiLogExecution('ERROR','Error updating label message on fulfillment '+fulfillmentId,'Message: '+message+' | Error: '+err);
				}
				throw nlapiCreateError('PDF_GENERATION_ERROR', message, true);
			}

			//label xml file
		/*	var search = nlapiSearchRecord('folder', null, ['name', 'is', 'SPSDebug'], null); //10
			if (search === null) {
				return;
			}
			var outFile = nlapiCreateFile(filename+".txt",'PLAINTEXT', typeof postdata === "string" ? postdata : JSON.stringify(postdata));
			outFile.setFolder(search[0].getId());
			var outFileId = nlapiSubmitFile(outFile); //20
			nlapiLogExecution("DEBUG", "Output File Written: " + outFileId);*/

		    //Contstruct and send Label API request
		    //var baseurl = 'https://stage.label.spsc.io/labels/';
		    var baseurl = 'https://label.spsc.io/labels/';
		    //var baseurl = 'http://dev.labelui.spsc.io/base64/labels/'
		    var pdfurl = baseurl + labelUID + '/pdf/';
			var pdfheaders = {'Authorization': 'Token ' + token,
					'Content-type': 'application/xml',
					'X-Force-Encoding': 'base64',
					'Accept': 'text/pdf'
					};
			var pdfhttpMethod = 'POST';
			nlapiLogExecution('DEBUG', 'pdfRequest', postdata);
			var pdfresponse = nlapiRequestURL(pdfurl, postdata, pdfheaders, pdfhttpMethod);
			var pdfCode = pdfresponse.getCode();
			var pdfBody = pdfresponse.getBody();
			nlapiLogExecution('DEBUG', 'pdfCode', pdfCode);
			nlapiLogExecution('DEBUG', 'pdfBody', pdfBody);
			if (pdfCode != 200) {
				var xml = nlapiStringToXML(pdfBody);
				var message = nlapiSelectValue(xml,'root');
				nlapiLogExecution('DEBUG', 'pdfError', message);
				var start = message.lastIndexOf('/')+1;
				var end = message.lastIndexOf(' is');
				var field = message.substr(start, end-start);
				nlapiLogExecution('DEBUG', 'MANDATORY FIELD REQ', field);
				if (typeof fields[field] != 'undefined') {
					message = 'Mandatory field '+field+' ('+fields[field]+') is missing'
				}
				nlapiSubmitField('customrecord_sps_package', packid, 'custrecord_sps_package_label_result', message);
				//nlapiSubmitField('customrecord_sps_package', packid, 'custrecord_sps_package_label_result', pdfBody);
				nlapiSetRedirectURL('RECORD', 'itemfulfillment', id, false, null);
				//response.write('Code '+pdfCode+': '+pdfBody);
				//return;
			}else {
				//Place result into file cabinet, attach to Package record, send PDF to browser
				var folderresults = nlapiSearchRecord(null, 'customsearch_sps_folder_search', new nlobjSearchFilter('name', null, 'contains', 'Label Archives'), null);
				var folderid;
			    for ( var i = 0; folderresults != null && i < 1; i++ ) {
			    	folderid = folderresults[i].getId();
			    }
				var pdfFile = nlapiCreateFile(filename,'PDF', ''+pdfBody);
				pdfFile.setEncoding('ISO-8859-1');
				pdfFile.setFolder(folderid);
				var file = nlapiSubmitFile(pdfFile);
				var savedfile = nlapiLoadFile(file);
				nlapiLogExecution('DEBUG','FILE URL',savedfile.getURL());
				nlapiAttachRecord('file',file,'customrecord_sps_package',packid);
				nlapiSubmitField('customrecord_sps_package', packid, ['custrecord_sps_package_label_result','custrecord_sps_package_label_url'], [null, savedfile.getURL()]);
				response.setContentType('PDF', filename);
				response.setEncoding('ISO-8859-1');
			    response.write(pdfFile.getValue());
			    //response.write('PDF generated');
			    //nlapiSetRedirectURL('RECORD', 'itemfulfillment', id, false, null);

			}
		}
	}else {
		response.write('No token is available to authenticate with SPS Commerce. Please generate a new token');
	}
}

function getPackageContent(fulfillmentId,packIds) {
    // Note, in the future this should be the source of truth for the results
    // one result here is one row in the final result
    // for now this is used to build a lookup table so that the primary search
    // can remain unaltered
	nlapiLogExecution('DEBUG','passed ids',packIds);
	var filters = new Array();
		filters[0] = new nlobjSearchFilter('custrecord_sps_pack_asn', 'custrecord_sps_content_package', 'anyof', fulfillmentId);
    var qty_searchCol = new nlobjSearchColumn('custrecord_sps_content_qty');
    var item_searchCol = new nlobjSearchColumn('custrecord_sps_content_item');
    var packName_searchCol = new nlobjSearchColumn('name', 'custrecord_sps_content_package');
	var intId_searchCol = new nlobjSearchColumn('internalid', 'custrecord_sps_content_package').setSort();
    var columnExp = [qty_searchCol, item_searchCol, packName_searchCol,intId_searchCol];
    var search = nlapiCreateSearch('customrecord_sps_content', filters, columnExp);
    var searchResults = search.runSearch();
    var lastIndex = 0;
    var packageItemQty = {};
    for (var startIndex = 0; startIndex == lastIndex; startIndex += 1000) {
        var nextPage = searchResults.getResults(startIndex, startIndex + 1000); // 10
        lastIndex = lastIndex + nextPage.length;
        for (var pageIndex = 0; pageIndex < nextPage.length; pageIndex++) {
            var packId = nextPage[pageIndex].getValue(packName_searchCol);
            var itemId = nextPage[pageIndex].getValue(item_searchCol);
            var qty = nextPage[pageIndex].getValue(qty_searchCol);
            if (!(packId in packageItemQty)) {
                packageItemQty[packId] = {};
            }
            packageItemQty[packId][itemId] = qty;
        }
    }
    nlapiLogExecution('DEBUG', 'SEARCH RESULTS custrecord_sps_content_qty[' + lastIndex + ']', JSON.stringify(packageItemQty));
    return packageItemQty;
}
