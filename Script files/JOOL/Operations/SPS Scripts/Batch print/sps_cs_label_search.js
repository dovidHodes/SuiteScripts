/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       03 Nov 2014     sprintz
 *
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment. 
 * @appliedtorecord recordType
 *   
 * @returns {Boolean} True to continue save, false to abort save
 */
function saveLabelConfig(){
	var count = nlapiGetLineItemCount('custpageresults');
	for (var i = 1; i <= count; i++) {
		var selected = nlapiGetLineItemValue('custpageresults', 'custpageresults_select', i);
		if(selected == 'T') {
			if(nlapiGetLineItemValue('custpageresults', 'custpageresults_cust', i) == '') {
				alert('All selected lines must have a customer associated with them.');
				return false;
			}
		}
	}

    return true;
}// END FUNC saveLabelConfig

function search() {	
	var keyWord1 = nlapiGetFieldValue('custpage_keyword1');
	var keyWord2 = nlapiGetFieldValue('custpage_keyword2');	
	var token = nlapiGetFieldValue('custpage_token');
	
	//var url = 'https://stage.label.spsc.io/labels';
	var url = 'https://label.spsc.io/labels';
	if((keyWord1 != null && keyWord1 != '') || (keyWord2 != null && keyWord2 != '')) { 
		url += 	'?search=(or ';	
		url += "labelname: '" + keyWord2 + "' ";
		url += "companyname: '" + keyWord1 + "')";
	}
	
	nlapiLogExecution('ERROR', 'url', url);
	
	url = encodeURI(url);
	
	nlapiLogExecution('ERROR', 'url', url);
	
	var postdata = null;
	var headers = {'Authorization': 'Token ' + token,
					'Content-Type': 'application/json',
					'Accept': 'application/json'};
	var httpMethod = 'GET';
	var spsresponse = nlapiRequestURL(url, postdata, headers, httpMethod);
	var headers = spsresponse.getAllHeaders();
	var output = 'Code: '+spsresponse.getCode()+'\n';
	output += 'Headers:\n';
	for (var i in headers) {
		output += i + ': '+headers[i]+ ': '+spsresponse.getHeader(headers[i])+'\n';
	}
	output += '\n\nBody:\n\n';

	// console.log(output);
		
	var count = nlapiGetLineItemCount('custpageresults');
	for (var i = 1; i <= count; i++) {
		nlapiRemoveLineItem('custpageresults', i);
	}

	if(spsresponse.getCode() == 200) {
		var json = JSON.parse(spsresponse.getBody());
		// console.log(spsresponse.getBody());
		var labels = json.records;
		for(var i = 0; i < labels.length; i++) {
			var j = i + 1;
			var stUID = labels[i].labelUid;
			nlapiSelectNewLineItem('custpageresults');
			nlapiSetCurrentLineItemValue('custpageresults', 'custpageresults_uid', stUID.toString(), true);
			nlapiSetCurrentLineItemValue('custpageresults', 'custpageresults_name', labels[i].labelName, true);
			nlapiSetCurrentLineItemValue('custpageresults', 'custpageresults_company_name', labels[i].companyName, true);
			nlapiCommitLineItem('custpageresults');
		}
		
		var html = '<br /><br /><big><strong style="color: red;">' + json.count + ' search results returned. ';
		if(json.hasNext == true) {
			html += 'Press search again to display the next page of results.';				
		} else if(json.count > 10) {
			html += 'Press search again to display the next page of results.';
		}
		html += '</strong></big>';
		
		nlapiSetFieldValue('custpage_html', html);
	}	
}// END FUNC search

function save() {
	var count = nlapiGetLineItemCount('custpageresults');

	var allGood = true;
	var selectionMade = false;
	for (var i = 1; i <= count; i++) {
		var selected = nlapiGetLineItemValue('custpageresults', 'custpageresults_select', i);
		if(selected == 'T') {
			selectionMade = true;
			if(nlapiGetLineItemValue('custpageresults', 'custpageresults_cust', i) == '') {
				alert('All selected lines must have a customer associated with them.');
				allGood = false;
				break;
			}
		}
	}
	
	if(!selectionMade) {
		alert('You must make at least one selection to save.');
		allGood = false;
	}
	
	if(allGood) {
		for (i = 1; i <= count; i++) 
		{		
			selected = nlapiGetLineItemValue('custpageresults', 'custpageresults_select', i);
			if(selected == 'T') {
				var labelRec = nlapiCreateRecord('customrecord_sps_customer_label_config');
				labelRec.setFieldValue('custrecord_sps_label_config_customer', nlapiGetLineItemValue('custpageresults', 'custpageresults_cust', i));
				labelRec.setFieldValue('custrecord_sps_label_config_default', nlapiGetLineItemValue('custpageresults', 'custpageresults_default', i));
				labelRec.setFieldValue('custrecord_sps_label_uid', nlapiGetLineItemValue('custpageresults', 'custpageresults_uid', i));
				labelRec.setFieldValue('name', nlapiGetLineItemValue('custpageresults', 'custpageresults_company_name', i) +' '+ nlapiGetLineItemValue('custpageresults', 'custpageresults_name', i));
				labelRec.setFieldValue('custrecord_sps_label_company', nlapiGetLineItemValue('custpageresults', 'custpageresults_company_name', i));
				nlapiSubmitRecord(labelRec);			
			}
		}
		nlapiSubmitField('customrecord_sps_label_access', 1, 'custrecord_refresh_label_list', 'T', false);
		setWindowChanged(window, false);
		window.close();
		//nlapiSetRedirectURL('SUITELET', 'customscript_sps_customer_label_setup', 'customdeploy_sps_customer_label_setup');
	}
};
