/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       28 Oct 2014     evan
 *
 */

/**
 * @param {nlobjRequest} request Request object
 * @param {nlobjResponse} response Response object
 * @returns {Void} Any output is written via response object
 */
function suitelet(request, response){
	try {
		var form = nlapiCreateForm('SPS Customer Label Setup');
		var fieldgroup = form.addFieldGroup('fields', ' ');
		fieldgroup.setSingleColumn(true);
		fieldgroup.setShowBorder(true);
		//form.addSubmitButton('Submit');
		
		form.addButton('addnew', 'Search and Add Label', "launchLabelSearch()");
		//var tab = form.addSubTab('labels', 'Labels', null);
		
		var newtoken = request.getParameter('custpage_token') || false;
		var newmfgid = request.getParameter('custpage_mfgid') || false;
		
		var token = form.addField('custpage_token', 'textarea', 'SPS Label Service Token', null, 'fields');
		//token.setMandatory(true);
		//token.setDefaultValue('Checking Token...');
		//.setDefaultValue('tHATdWMBUh-amS2uLBuMHyIpyyvWKFicc9IGDV3BoULCXLaoSJeX18q58YzKTkHLy2JSopK8v-SKnCZqlHqVy8NKShgcsfslmefnq2xY7luUuvaU1sSQqrpafSNBCPlH88kp6LT3rQi4C1U28NWjPFEil7LWKlZo');
		
		//var verify = form.addField('custpage_verify', 'url', ' ', null, 'fields')
		//.setDisplayType('inline')
		//.setLinkText('Click to verify token')
		
		
		var mfgid = form.addField('custpage_mfgid', 'text', 'Manufacturers ID', null, 'fields');
		//mfgid.setMandatory(true);
		//.setDefaultValue('789065430987');
		
		
		var tokenValid = form.addField('custpage_token_valid', 'text', 'Token Valid', null, 'fields');
		tokenValid.setDisplayType('disabled');
		
		var tokenExpires = form.addField('custpage_token_expires', 'text', 'Token Expires', null, 'fields');
		tokenExpires.setDisplayType('disabled');
		
		var sublist = form.addSubList('custpage_sublist', 'list', 'Labels', null);
				
		sublist.addField('customer', 'select', 'Customer', 'customer')
		.setDisplayType('inline');
		
		sublist.addField('companyname', 'text', 'Company Name', null)
		.setDisplayType('inline');
		
		sublist.addField('labelname', 'text', 'Label Name', null)
		.setDisplayType('inline');
		
		sublist.addField('preview', 'url', 'Preview Label', null)
		//.setDisplayType('inline')
		.setLinkText('Download Sample PDF')
		
		
		sublist.addField('default', 'checkbox', 'Customer Default Label', null)
		//.setDisplayType('inline');
		
		sublist.addField('uid', 'text', ' ', null)
		.setDisplayType('hidden');
		
		sublist.addField('internalid', 'text', ' ', null)
		.setDisplayType('hidden');
		
		sublist.addField('remove', 'text', 'Remove', null)
		.setDisplayType('disabled');
		
		//customer, label, uid, default, preview
		//load label recs
		//write rows
		
		var authresults = nlapiSearchRecord('customrecord_sps_label_access', 'customsearch_sps_label_login_list', null, null);
    	
    	if (authresults != null && authresults.length == 1) {
    		var authresult = JSON.parse(JSON.stringify(authresults[0]));
    		var authid = authresults[0].getId();
    		if (newmfgid || newtoken) {
    			nlapiSubmitField('customrecord_sps_label_access', authid, 'custrecord_sps_label_login_token', newtoken, false);
    			nlapiSubmitField('customrecord_sps_label_access', authid, 'custrecord_sps_label_login_mfgid', newmfgid, false);
    		}else {
    			newtoken = authresult.columns.custrecord_sps_label_login_token || '';
    			newmfgid = authresult.columns.custrecord_sps_label_login_mfgid || '';
    		}
    		token.setDefaultValue(newtoken);
    		mfgid.setDefaultValue(newmfgid);
    		//verify.setDefaultValue(nlapiResolveURL('suitelet', 'customscript_sps_verify_label_token', 'customdeploy_sps_verify_label_token')+'&custscript_sps_token='+newtoken);
            
    	}
		
		var results = nlapiSearchRecord('customrecord_sps_customer_label_config', 'customsearch_sps_label_default_list', null, null);
    	
    	for (var i = 1; results != null && i <= results.length; i++) {
    		var result = JSON.parse(JSON.stringify(results[i-1]));
    		//var recid = result.getId();
			if (result.columns.custrecord_sps_label_config_customer > "") {
				if (i == 1) {
					var columns = results[i - 1].getAllColumns();
					for (ea in columns) {
						nlapiLogExecution('DEBUG', 'doc columns', ea + ', ' + columns[ea]);
					}
					nlapiLogExecution('DEBUG', 'doc results', JSON.stringify(result));
					nlapiLogExecution('DEBUG', 'results length', results.length);
				}
				var customerid = (typeof result.columns.custrecord_sps_label_config_customer != 'undefined') ? result.columns.custrecord_sps_label_config_customer.internalid : '';
				sublist.setLineItemValue('customer', i, customerid);
				sublist.setLineItemValue('companyname', i, result.columns.custrecord_sps_label_company);
				sublist.setLineItemValue('labelname', i, result.columns.name);

				var res = results[i - 1];
				sublist.setLineItemValue('internalid', i, res.getId());

				var url = nlapiResolveURL('SUITELET', 'customscript_sps_sl_label_download', 'customdeploy_sps_sl_label_download');
				url += '&custscript_sample=T';
				url += '&custscript_sps_token=' + newtoken;
				url += '&custscript_uid=' + result.columns.custrecord_sps_label_uid;
				sublist.setLineItemValue('preview', i, url);
				sublist.setLineItemValue('default', i, (result.columns.custrecord_sps_label_config_default) ? 'T' : 'F');
				sublist.setLineItemValue('uid', i, result.columns.custrecord_sps_label_uid);

				sublist.setLineItemValue('remove', i, '<a href="javascript:removeLineItem(' + i + ', ' + res.getId() + ', ' + result.columns.custrecord_sps_label_config_customer.internalid + ');">Remove</a>');
			} else {
				nlapiLogExecution('DEBUG', 'Customer Null', 'label config record ' + result.id + ' skipped due to missing customer');
			}
    	}
    	
		form.setScript('customscript_sps_cs_customer_label_setup');
		
		if(nlapiGetUser() == 19) {
			form.addButton('custpage_download_label', 'Download Label', "downloadLabel();");
		}
    	//form.addButton('custpage_verify_button', 'Verify Token', "verifyToken();");
		
    	response.writePage(form);
    	
	}catch (err) {
		nlapiLogExecution('DEBUG','Main Try/Catch',err);
	}
}
