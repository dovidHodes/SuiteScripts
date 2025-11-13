/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       11 Nov 2014     sprintz
 *
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment. 
 * @appliedtorecord recordType
 * 
 * @param {String} type Operation types: create, edit, delete, xedit,
 *                      approve, cancel, reject (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF only)
 *                      dropship, specialorder, orderitems (PO only) 
 *                      paybills (vendor payments)
 * @returns {Void}
 */
function userEventAfterSubmit(type){
  //if label is set as default for a customer set all other lables for the same customer as NOT default
	var labelRec = nlapiGetNewRecord();
	var stDefault = labelRec.getFieldValue('custrecord_sps_label_config_default');
	
	if(stDefault == 'T') {
		labelRec = nlapiLoadRecord('customrecord_sps_customer_label_config', labelRec.getId());
		var stCustomer = labelRec.getFieldValue('custrecord_sps_label_config_customer');		
		
		var arrFilters = new Array();
		arrFilters.push(new nlobjSearchFilter('custrecord_sps_label_config_customer', null, 'anyof', stCustomer));
		arrFilters.push(new nlobjSearchFilter('internalid', null, 'noneof', labelRec.getId()));
		arrFilters.push(new nlobjSearchFilter('custrecord_sps_label_config_default', null, 'is', 'T'));
		
		var arrSearchResults = nlapiSearchRecord('customrecord_sps_customer_label_config', null, arrFilters, null);
		
		for(var i = 0; arrSearchResults != null && i < arrSearchResults.length; i++) {
			nlapiSubmitField('customrecord_sps_customer_label_config', arrSearchResults[i].getId(), 'custrecord_sps_label_config_default', 'F');
		}
		
	}
	 
}
