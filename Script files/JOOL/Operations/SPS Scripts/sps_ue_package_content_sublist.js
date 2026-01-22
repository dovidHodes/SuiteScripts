/**
 * Module Description
 *
 * Version    Date            Author           Remarks
 * 1.00       19 Feb 2015     tcarr
 * 1.1        23 Oct 2015     jcoyle           Change matching items to go off itemid rather than search result line number (which can change)
 * 1.2        08 Dec 2015     rbloom           Added check for Disable Processing flag for third party processing.
 * 2.0		  03 Jul 2019	  mbrewer		   Added packing by Lot Number & sourcing for Lot/Expiration date for Package Contents
 *
 *	Creates a Package Content sublist on the Package form, and populates the list with available items to be included in the package.
 */

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment.
 * @appliedtorecord customrecord_sps_package
 *
 * @param {String} type Operation types: create, edit, view, copy, print, email
 * @param {nlobjForm} form Current form
 * @param {nlobjRequest} request Request object
 * @returns {Void}
 */
function userEventBeforeLoad(type, form, request){
	nlapiLogExecution('DEBUG', 'Checkpoint:', 'BEGIN userEventBeforeLoad type ' + type + ' context ' + nlapiGetContext().getExecutionContext());

	var context = nlapiGetContext();
	var current_package = nlapiGetNewRecord();
	var packageId = current_package.getId();
	var itemFulfillmentId = nlapiGetFieldValue('custrecord_sps_pack_asn');
	if (!itemFulfillmentId || nlapiLookupField('itemfulfillment', itemFulfillmentId, 'custbody_sps_package_validation_bypass') == "T") {
		nlapiLogExecution('DEBUG', 'validation_bypass was enabled; stopping script');
		if(context.getExecutionContext() == 'userinterface') {
			throw new Error("Please create packages using the [Add New Package] button on the Item Fulfillment page")
		}
		return;
	}
	nlapiLogExecution('DEBUG', 'IF Rec ID', itemFulfillmentId);

	if(context.getExecutionContext() == 'userinterface' && (type == 'create' || type == 'edit' || type == 'view'))
	{
		var content_tab = form.addTab('custpage_package_content_tab', 'Contents');
		form.insertTab(content_tab, 'media');
		var package_weight = form.addField('custpage_sps_pk_weight', 'float', 'Package Weight', null, 'custpage_package_content_tab');
		var tracking_number = form.addField('custpage_sps_track_num', 'text', 'Tracking Number', null, 'custpage_package_content_tab');
		var item_fulfillment = form.addField('custpage_sps_pack_asn', 'select', 'Item Fulfillment', 'itemfulfillment', 'custpage_package_content_tab').setDisplayType('inline').setDefaultValue(itemFulfillmentId);
		var total_qty = form.addField('custpage_sps_package_qty', 'integer', 'Total Qty', null, 'custpage_package_content_tab').setMandatory(true);
		var package_definition = form.addField('custpage_sps_package_box_type', 'select', 'Package Definition', 'customrecord_sps_pack_type', 'custpage_package_content_tab').setMandatory(true).setDisplayType(type == 'view' ? 'inline' : 'normal');


		// Used in rendering the Package Content sublist
		var pc_info = {};
		var itemFulfillmentRec = nlapiLoadRecord('itemfulfillment', itemFulfillmentId);
		//adding check for lot funcionality based on customer record
		var custID = itemFulfillmentRec.getFieldValue('entity');
		var custLotFlag = 'F'
		if(custID) {
			custLotFlag = nlapiLookupField('customer', custID, 'custentity_sps_lot_exp_flag');
		}
		//back to original code
		var curr_carton_ct = itemFulfillmentRec.getFieldValue('custbody_sps_trans_carton_ct') || 0;


		if(type != 'create')
		{
			// Set field default values when not creating new record
			package_weight.setDefaultValue(current_package.getFieldValue('custrecord_sps_pk_weight'));
			tracking_number.setDefaultValue(current_package.getFieldValue('custrecord_sps_track_num'));
			total_qty.setDefaultValue(current_package.getFieldValue('custrecord_sps_package_qty'));
			package_definition.setDefaultValue(current_package.getFieldValue('custrecord_sps_package_box_type'));
// Get the Package Content records, if any, that are associated with this Package.
			// This info is required for rendering the Package Content sublist.  But isn't needed on 'create' since there will be none
			var pc_filters = [];
			pc_filters.push(new nlobjSearchFilter('custrecord_sps_content_package', null, 'anyof', packageId));
			var pc_columns = [];
			pc_columns.push(new nlobjSearchColumn('internalid'));
			pc_columns.push(new nlobjSearchColumn('custrecord_sps_content_item'));
			pc_columns.push(new nlobjSearchColumn('custrecord_sps_content_item_line_num'));
			pc_columns.push(new nlobjSearchColumn('custrecord_sps_content_qty'));
			pc_columns.push(new nlobjSearchColumn('custrecord_sps_content_lot')); //added lot number field
			pc_columns.push(new nlobjSearchColumn('custrecord_sps_content_expiration')); //added lot expiration field

			var pc_results = nlapiSearchRecord('customrecord_sps_content', null, pc_filters, pc_columns);
			if(pc_results)
			{
				nlapiLogExecution('DEBUG', '# Package Content records associated:', pc_results.length);
				for(var i = 0; i < pc_results.length; i++)
				{
					var curr_pc_id = pc_results[i].getValue('internalid');
					var curr_item_id = pc_results[i].getValue('custrecord_sps_content_item');
					var curr_item_line_num = pc_results[i].getValue('custrecord_sps_content_item_line_num');
					var curr_item_quantity = pc_results[i].getValue('custrecord_sps_content_qty');
					var curr_item_lot = pc_results[i].getValue('custrecord_sps_content_lot')||''; //lot result; this will compound our result lines quite a bit
					var curr_item_expiration = pc_results[i].getValue('custrecord_sps_content_expiration'||''); //expiration result

//					pc_info[curr_item_id] = {
					pc_info[curr_item_id+curr_item_line_num+curr_item_lot] = { //standard matching by item will no longer suffice, requires more complex matching by item | line | lot for accuracy
						pc_id: curr_pc_id,
						item_id: curr_item_id,
						item_line_num: curr_item_line_num,
						item_quantity: Number(curr_item_quantity),
						item_lot: curr_item_lot,
						item_expiration: curr_item_expiration
					};
					//nlapiLogExecution('DEBUG','PC_INFO',JSON.stringify(pc_info[curr_item_id+curr_item_line_num+curr_item_lot]));
				}
			}
			//nlapiLogExecution('DEBUG','PC_INFO',JSON.stringify(pc_info));

		}else if(curr_carton_ct>0){ //added to properly increment carton index, account for deleted packages
			var pkgIdxs = [];
			var pkgFilters = [];
			pkgFilters.push(new nlobjSearchFilter('custrecord_sps_pack_asn', null, 'anyof', itemFulfillmentId));
			var pkgColumns = [];
			pkgColumns.push(new nlobjSearchColumn('custrecord_sps_package_carton_index').setSort());
			var pkgSearch = nlapiSearchRecord('customrecord_sps_package',null,pkgFilters,pkgColumns);

			var newIdx;
			var fullPkgSearchResult = pkgSearch;
			var pkgIds = [];
			if(pkgSearch){
				do {
					if (pkgIds && pkgIds.length > 0) {
						pkgFilters.push(new nlobjSearchFilter('internalid', null, 'noneof', pkgIds));
						pkgSearch = nlapiSearchRecord('customrecord_sps_package', null, pkgFilters, pkgColumns);
						fullPkgSearchResult = fullPkgSearchResult.concat(pkgSearch);
					}
					for (var i = 0; i < pkgSearch.length; i++) {
						var internalId = pkgSearch[i].getId();
						pkgIds.push(internalId);
					}
				} while (pkgSearch.length === 1000);
				fullPkgSearchResult.forEach(function(pkgResult){
					pkgIdxs.push(pkgResult.getValue('custrecord_sps_package_carton_index'));
				});
				newIdx = getNewCartonIdx(pkgIdxs);
			} else {
				// This should never happen (current carton count > 0 and no current packages for Item Fulfillment
				newIdx = 1;
			}
			nlapiSetFieldValue('custrecord_sps_package_carton_index', newIdx);
		}

		// The Package Content sublist
		var sublist = form.addSubList('custpage_package_content', type == 'view' ? 'inlineeditor' : 'list', 'Package Content', 'custpage_package_content_tab');
		nlapiLogExecution('DEBUG', 'Subtabs', JSON.stringify(form.getTabs()));
		if(type!='view'){
			sublist.addButton('custpage_sps_mark_all', 'Mark All', 'markAllPackageItems(true);');
			sublist.addButton('custpage_sps_unmark_all', 'Unmark All', 'markAllPackageItems(false);');
		}

		sublist.addField('include_in_package', 'checkbox', 'Packed?', null);
		sublist.addField('item', 'select', 'Item', 'item').setDisplayType(type == 'view' ? 'normal' : 'inline');
		sublist.addField('lot', 'text', 'Lot Number', null).setDisplayType(type == 'view' ? 'normal' : 'inline'); //added lot number
		sublist.addField('expiration', 'text', 'Expiration', null).setDisplayType(type == 'view' ? 'normal' : 'inline'); //added expiration date
		sublist.addField('quantity_to_pack', 'integer', 'Quantity to Pack', null).setDisplayType('entry'); //should now source from inventory detail : qty when item is lot numbered
		// For tracking the original quantity_to_pack when user changes it.  Important when they're editing an existing list item because
		// that list item will have contributed to the total packed for the Item Fulfillment.
		sublist.addField('orig_quantity_to_pack', 'integer', 'Quantity to Pack', null).setDisplayType('hidden');
		sublist.addField('quantity_packed', 'integer', 'Quantity Packed', null).setDisplayType(type == 'view' ? 'normal' : 'inline');
		sublist.addField('quantity_picked', 'integer', 'Quantity Picked', null).setDisplayType(type == 'view' ? 'normal' : 'inline');
		sublist.addField('item_weight', 'float', '', null).setDisplayType('hidden');
		sublist.addField('package_content_id', 'integer', '', null).setDisplayType('hidden');
		// Quantity Packed when loading the page will include the current Package.  So keep track of this value will simplify
		// client side logic for validating packing levels / preventing overpacking.
		sublist.addField('qty_in_other_packs', 'integer', '', null).setDisplayType('hidden');
		sublist.addField('fulfillment_line', 'integer', 'Line #', null).setDisplayType('hidden'); //necessary to track the origin of the item
		// Get all the items on the associated Item Fulfillment record
		var itemCount = itemFulfillmentRec.getLineItemCount('item');
		nlapiLogExecution('DEBUG', '# IF items:', itemCount);



		//replacing standard pack logic with packing by lot number
		var i = 1; //counter for pkg sublist lines
		for(var itemFulfillmentLine = 1; itemFulfillmentLine <= itemCount; itemFulfillmentLine++){ //item fulfillment line iterator
			//standard values
			var itemId = itemFulfillmentRec.getLineItemValue('item', 'item', itemFulfillmentLine);
			var sequence = itemFulfillmentRec.getLineItemValue('item','line',itemFulfillmentLine); //line sequence number
			var nsItemConversion = Number(itemFulfillmentRec.getLineItemValue('item', 'unitconversion', i) || 1);
			var nsItemWeight = Number(itemFulfillmentRec.getLineItemValue('item', 'itemweight', i));

			//lot validation
			var isLot = itemFulfillmentRec.getLineItemValue('item','isnumbered',itemFulfillmentLine)||false;
			//nlapiLogExecution('DEBUG','Line '+itemFulfillmentLine+' is lot: '+isLot);

			//when lots exist for current item, parse through current search results for related detail --- AP Added check on customer enabled
			if(isLot=='T'&&custLotFlag=='F'){
				var invDetail = itemFulfillmentRec.viewLineItemSubrecord('item','inventorydetail',itemFulfillmentLine);
				var invDetailLines = invDetail.getLineItemCount('inventoryassignment');
				var invDetailLibrary = {};
				for(var iD=1;iD<=invDetailLines;iD++){ //invt detail record of each line item
					var assignmentDetail = {};
					assignmentDetail.assignmentId = invDetail.getLineItemValue('inventoryassignment','internalid',iD);
					assignmentDetail.lotNumber = invDetail.getLineItemText('inventoryassignment','issueinventorynumber',iD);
					assignmentDetail.quantityPicked = Number(invDetail.getLineItemValue('inventoryassignment','quantity',iD)); //quantity picked will always be based on the lot when a lot number is available
					assignmentDetail.expiration = invDetail.getLineItemValue('inventoryassignment','expirationdate',iD);
					if(invDetailLibrary[assignmentDetail.lotNumber]){
						invDetailLibrary[assignmentDetail.lotNumber].quantityPicked += assignmentDetail.quantityPicked;
					}else{
						invDetailLibrary[assignmentDetail.lotNumber] = assignmentDetail;
					}
				}
				for(var y=0; y<Object.keys(invDetailLibrary).length; y++){
					var rolledUpLotKey = Object.keys(invDetailLibrary)[y];
					var rolledUpLotData = invDetailLibrary[rolledUpLotKey];
					//nlapiLogExecution('DEBUG','PICKED INVENTORY DETAIL '+iD+' of '+invDetailLines,JSON.stringify(rolledUpLotData));

					var quantityPicked = rolledUpLotData.quantityPicked;
					var quantityPacked = findLotPack(itemFulfillmentId,rolledUpLotData.lotNumber,sequence,itemId)||0;
					//nlapiLogExecution('DEBUG',itemFulfillmentId+' '+rolledUpLotData.lotNumber+' '+itemFulfillmentLine+' '+itemId);
					//nlapiLogExecution('DEBUG','INV DETAIL : Quantity Packed',quantityPacked);
					var remainingToPack = rolledUpLotData.quantityPicked-quantityPacked;
					//nlapiLogExecution('DEBUG','INV DETAIL : Quantity Remaining to Pack',remainingToPack);
					nlapiLogExecution('DEBUG','pc_info',JSON.stringify(pc_info[itemId+sequence+rolledUpLotData.lotNumber]));
					if(typeof(pc_info[itemId+sequence+rolledUpLotData.lotNumber]) == 'undefined'){ //item not yet related to the current package by package content record
						sublist.setLineItemValue('include_in_package', i, 'F');
						sublist.setLineItemValue('quantity_to_pack', i, type == 'create' ? remainingToPack.toString() : '0');
						sublist.setLineItemValue('orig_quantity_to_pack', i, type == 'create' ? remainingToPack.toString() : '0');
						sublist.setLineItemValue('qty_in_other_packs', i, quantityPacked.toString());
					}else{ // Else the item is associated with this Package and we'll set the Quantity to Pack to the quantity on the Package Content record
						sublist.setLineItemValue('include_in_package', i, 'T');
						sublist.setLineItemValue('package_content_id', i, pc_info[itemId+sequence+rolledUpLotData.lotNumber].pc_id); //double check this
						sublist.setLineItemValue('qty_in_other_packs', i, (quantityPacked-pc_info[itemId+sequence+rolledUpLotData.lotNumber].item_quantity).toString());
						sublist.setLineItemValue('quantity_to_pack', i, (pc_info[itemId+sequence+rolledUpLotData.lotNumber].item_quantity).toString());
						sublist.setLineItemValue('orig_quantity_to_pack', i,(pc_info[itemId+sequence+rolledUpLotData.lotNumber].item_quantity).toString());
					}
					sublist.setLineItemValue('item', i, itemId);
					sublist.setLineItemValue('quantity_packed', i, quantityPacked.toString());
					sublist.setLineItemValue('quantity_picked', i, (rolledUpLotData.quantityPicked).toString());
					sublist.setLineItemValue('item_weight', i, nsItemConversion*nsItemWeight);
					sublist.setLineItemValue('fulfillment_line', i, sequence.toString());
					sublist.setLineItemValue('lot', i, (rolledUpLotData.lotNumber).toString()); //lot number
					sublist.setLineItemValue('expiration', i, (rolledUpLotData.expiration).toString()); //lot expiration date
					i++;
				}
			}else{ //when item isn't lot, build sublist without lot logic
				var quantityPacked = Number(itemFulfillmentRec.getLineItemValue('item', 'custcol_sps_qtypacked', itemFulfillmentLine));
				var quantityPicked = Number(itemFulfillmentRec.getLineItemValue('item', 'quantity', itemFulfillmentLine));
				var remainingToPack = quantityPicked-quantityPacked;
				// The item is not associated with this Package, so we will prefill the Quantity To Pack to the amount remaining to be packed, which may be 0.  The value for the key will be undefined if there is no Package Content results (above) for this current line number.
				//nlapiLogExecution('debug','pc info',itemId+' '+sequence);
				//nlapiLogExecution('debug','pc info',JSON.stringify(pc_info[itemId+sequence]));
				if(typeof(pc_info[itemId+sequence]) == 'undefined'){
					sublist.setLineItemValue('include_in_package', i, 'F');
					sublist.setLineItemValue('quantity_to_pack', i, type == 'create' ? remainingToPack.toString() : '0'); //entry field
					sublist.setLineItemValue('orig_quantity_to_pack', i, type == 'create' ? remainingToPack.toString() : '0');
					sublist.setLineItemValue('qty_in_other_packs', i, quantityPacked.toString());
				}else{ // Else the item is associated with this Package and we'll set the Quantity to Pack to the quantity on the Package Content record
					sublist.setLineItemValue('include_in_package', i, 'T');
					sublist.setLineItemValue('package_content_id', i, pc_info[itemId+sequence].pc_id);
					sublist.setLineItemValue('quantity_to_pack', i, pc_info[itemId+sequence].item_quantity.toString()); //entry field
					sublist.setLineItemValue('orig_quantity_to_pack', i, pc_info[itemId+sequence].item_quantity.toString());
					sublist.setLineItemValue('qty_in_other_packs', i, (quantityPacked-pc_info[itemId+sequence].item_quantity).toString());
				}
				// Line Items that are the same regardless of whether the current Item was associated to this Package by a Package Content record
				sublist.setLineItemValue('item', i, itemId);
				sublist.setLineItemValue('quantity_packed', i, quantityPacked.toString());
				sublist.setLineItemValue('quantity_picked', i, quantityPicked.toString());
				sublist.setLineItemValue('item_weight', i, nsItemConversion*nsItemWeight);
				sublist.setLineItemValue('fulfillment_line', i, sequence.toString());
				i++;
			}
		}
	}
	nlapiLogExecution('DEBUG', 'Checkpoint:', 'END userEventBeforeLoad');
}

/**
 * The recordType (internal id) corresponds to the "Applied To" record in your script deployment.
 * @appliedtorecord recordType
 *
 * @param {String} type Operation types: create, edit, delete, xedit
 *                      approve, reject, cancel (SO, ER, Time Bill, PO & RMA only)
 *                      pack, ship (IF)
 *                      markcomplete (Call, Task)
 *                      reassign (Case)
 *                      editforecast (Opp, Estimate)
 * @returns {Void}
 */
function userEventBeforeSubmit(type){
	nlapiLogExecution('DEBUG', 'Checkpoint:', 'BEGIN userEventBeforeSubmit type ' + type + ' context ' + nlapiGetContext().getExecutionContext());

	if ((nlapiGetContext().getExecutionContext() == 'userinterface' && (type == 'create' || type == 'edit')) || type == 'delete') {

	} else {
		return;
	}

	var newId = nlapiGetRecordId();
	var record = nlapiGetNewRecord();
	var itemFulfillmentId = record.getFieldValue('custrecord_sps_pack_asn');
	if(itemFulfillmentId == null) {
		itemFulfillmentId = nlapiLookupField('customrecord_sps_package', newId, 'custrecord_sps_pack_asn');
	}
	if(itemFulfillmentId){
		if (nlapiLookupField('itemfulfillment', itemFulfillmentId, 'custbody_sps_package_validation_bypass') == "T") {
			nlapiLogExecution('DEBUG', 'validation_bypass was enabled; stopping script');
			return;
		}
	}else{
		itemFulfillmentId = nlapiGetOldRecord().getFieldValue('custrecord_sps_pack_asn');
	}

	// Package Content sublist Create|Edit logic is handled afterSubmit.  Cannot create a PC record that must have Package set when
	// Package record would not have an ID yet on 'create'.  So we'll handle both create & edit for PC records in afterSubmit when we will have Package.internalid.
	// Will set following fields, however, to avoid needing to load/submit the Package record again.  These fields are custpage fields in the UI so that
	// we can control the scripted tab they are on (Contents) but they must be saved to the Package records corresponding fields.
	if (nlapiGetContext().getExecutionContext() == 'userinterface' && (type == 'create' || type == 'edit'))
	{
		record.setFieldValue('custrecord_sps_pk_weight', record.getFieldValue('custpage_sps_pk_weight'));
		record.setFieldValue('custrecord_sps_track_num', record.getFieldValue('custpage_sps_track_num'));
		record.setFieldValue('custrecord_sps_package_qty', record.getFieldValue('custpage_sps_package_qty'));
		record.setFieldValue('custrecord_sps_package_box_type', record.getFieldValue('custpage_sps_package_box_type'));
	}

	// Delete
	if(type == 'delete')
	{
		for(var i = 1; i <= record.getLineItemCount('custpage_package_content'); i++)
		{
			try{
				var package_content_id = record.getLineItemValue('custpage_package_content', 'package_content_id', i);

				// Package record is being deleted, need to remove child PC records to allow this or else there will be a dependent records error for the user.
				if(package_content_id != null && package_content_id != '')
				{
					nlapiLogExecution('AUDIT', 'beforeSubmit "delete" of Package record', 'Child PC record deleted with ID: ' + package_content_id);
					nlapiDeleteRecord('customrecord_sps_content', package_content_id);
				}
			}catch(err){
				nlapiLogExecution('ERROR','BRS PC deletion',err);
			}
		}

		// Give deleted package's carton index to the Item Fulfillment's package with the current highest index
		var packageFilters = [];
		packageFilters.push(new nlobjSearchFilter('custrecord_sps_pack_asn', null, 'anyof', itemFulfillmentId));
		var packageColumn = [];
		packageColumn.push(new nlobjSearchColumn('custrecord_sps_package_carton_index').setSort(true));
		var packagesSearchResults = nlapiSearchRecord("customrecord_sps_package",null, packageFilters, packageColumn);
		var fullPackageSearchResults = packagesSearchResults;
		var packageIds = [];
		if(packagesSearchResults.length>1){//only execute following if there are actual package results, otherwise there are no packages
			do {
				if (packageIds && packageIds.length > 0) {
					packageFilters.push(new nlobjSearchFilter('internalid', null, 'noneof', packageIds));
					packagesSearchResults = nlapiSearchRecord("customrecord_sps_package",null, packageFilters, packageColumn);
					fullPackageSearchResults = fullPackageSearchResults.concat(packagesSearchResults);
				}
				for (var i = 0; i < packagesSearchResults.length; i++) {
					var packageId = packagesSearchResults[i].getId();
					packageIds.push(packageId);
				}
			} while (packagesSearchResults.length === 1000);
			var lastIndexResult = fullPackageSearchResults[0];
			var lastIndexPackageId = lastIndexResult.getId();
			//nlapiLogExecution('AUDIT', 'Test Check for Package Carton Index Reset'+ packagesSearchResults.length);
			if (lastIndexPackageId != record.getId()) {
				var deletedPackageCartonIndex = record.getFieldValue('custrecord_sps_package_carton_index');
				nlapiSubmitField('customrecord_sps_package', lastIndexPackageId, 'custrecord_sps_package_carton_index', deletedPackageCartonIndex);
			}
		}

		// Record has been deleted, update the Item Fulfillment
		updateItemFulfillmentPackedQuantities(itemFulfillmentId);
	}
}

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
	nlapiLogExecution('DEBUG', 'Checkpoint:', 'BEGIN userEventAfterSubmit type ' + type + ' context ' + nlapiGetContext().getExecutionContext());

	if (nlapiGetContext().getExecutionContext() == 'userinterface' && (type == 'create' || type == 'edit')) {

	} else {
		return;
	}

	var newId = nlapiGetRecordId();
	var record = nlapiGetNewRecord();

	var itemFulfillmentId = record.getFieldValue('custrecord_sps_pack_asn');
	var packLevelType = record.getFieldValue('custrecord_sps_package_level_type');
	var outerPack = record.getFieldValue('custrecord_sps_package_outer');
	var innerPack = record.getFieldValue('custrecord_sps_package_inner');
	var packDefinition = record.getFieldValue('custrecord_sps_package_box_type');
	var trackNumber = record.getFieldValue('custrecord_sps_track_num');
	var packWeight = record.getFieldValue('custrecord_sps_pk_weight');
	var totalPkgQty = 0; //added to facilitate totals for lot structure
	if(itemFulfillmentId == null) {
		itemFulfillmentId = nlapiLookupField('customrecord_sps_package', newId, 'custrecord_sps_pack_asn');
	}
	if (nlapiLookupField('itemfulfillment', itemFulfillmentId, 'custbody_sps_package_validation_bypass') == "T") {
		nlapiLogExecution('DEBUG', 'validation_bypass was enabled; stopping script');
		return;
	}

	// Create -- create the Package Content records that were checked on save, with the given item & quantity
	if (nlapiGetContext().getExecutionContext() == 'userinterface' && type == 'create')
	{
		for(var i = 1; i <= record.getLineItemCount('custpage_package_content'); i++)
		{
			if(nlapiGetContext().getRemainingUsage()<100){
				break;
			}
			var include_in_package = record.getLineItemValue('custpage_package_content', 'include_in_package', i);
			if(include_in_package == 'T'){ //moved outside item,quantity_to_pack since pack logic is now lot based and not strictly item based
				var item = record.getLineItemValue('custpage_package_content', 'item', i);
				var quantity_to_pack = record.getLineItemValue('custpage_package_content', 'quantity_to_pack', i);

				//custom lot columns
				var lot = record.getLineItemValue('custpage_package_content', 'lot', i);
				var expiration = record.getLineItemValue('custpage_package_content', 'expiration', i);
				var sequence = record.getLineItemValue('custpage_package_content','fulfillment_line',i); //line sequence number
//			if(include_in_package == 'T'){ //shifted up to properly get lots when getting item
				var package_content_record = nlapiCreateRecord('customrecord_sps_content');
				package_content_record.setFieldValue('custrecord_sps_content_item', item);
//				package_content_record.setFieldValue('custrecord_sps_content_item_line_num', i);
				package_content_record.setFieldValue('custrecord_sps_content_item_line_num', sequence); //i != line number. i is solely the package UI iterator
				package_content_record.setFieldValue('custrecord_sps_content_qty', quantity_to_pack);
				package_content_record.setFieldValue('custrecord_sps_content_package', record.getId());
				//additional values added for sourcing to the pack content part of v3
				/*
				package_content_record.setFieldValue('custrecord_pack_content_fulfillment', itemFulfillmentId);
				package_content_record.setFieldValue('custrecord_parent_pack_level_type', packLevelType);
				package_content_record.setFieldValue('custrecord_parent_pack_inner_pk', innerPack);
				package_content_record.setFieldValue('custrecord_parent_pack_outer_pk', outerPack);
				package_content_record.setFieldValue('custrecord_parent_pack_type', packDefinition);
				package_content_record.setFieldValue('custrecord_parent_pack_type', packWeight);
					*/

				//lot data
				package_content_record.setFieldValue('custrecord_sps_content_lot', lot);
				package_content_record.setFieldValue('custrecord_sps_content_expiration', expiration);
				totalPkgQty+=quantity_to_pack;
				var new_rec_id = nlapiSubmitRecord(package_content_record);
				nlapiLogExecution('AUDIT', 'afterSubmit "create" PC Record submitted', 'New PC record ID: ' + new_rec_id);
			}

		}
		nlapiSetFieldValue('custpage_sps_package_qty', totalPkgQty, false, false);
		// Record has been created, update the Item Fulfillment
		updateItemFulfillmentPackedQuantities(itemFulfillmentId);
	}
	// Edit -- when edited the item will correspond to a particular Package Content record, so all we need to do is submit update
	else if(nlapiGetContext().getExecutionContext() == 'userinterface' && type == 'edit')
	{

		for(var i = 1; i <= record.getLineItemCount('custpage_package_content'); i++)
		{
			var include_in_package = record.getLineItemValue('custpage_package_content', 'include_in_package', i);
			var item = record.getLineItemValue('custpage_package_content', 'item', i);
			var quantity_to_pack = record.getLineItemValue('custpage_package_content', 'quantity_to_pack', i);
			var package_content_id = record.getLineItemValue('custpage_package_content', 'package_content_id', i);
			var sequence = record.getLineItemValue('custpage_package_content','fulfillment_line',i); //line sequence number

			// Package Content line is to be included.  We will create/update the PC record as necessary.
			// This is within the 'edit' operation logic, so it's possible an update to the quantity of an existing PC record is being made, only need to
			// update the quantity associated to make sure it's accurate.  If the Pacakge was edited and a new item line was selected, however, then we
			// will still need to create a new PC record in full.
//			if(include_in_package == 'T'){
			if(include_in_package == 'T'&&quantity_to_pack>0){
				// PC record already exists, submitField to make sure quantity is accurate.
				// In theory someone could be updating the quantity to 0, in which case we'd want to delete the PC record, not just update
				// the quantity field.  But we are preventing that case on the client side by disallowing selection of lines with 0 Quantity to Pack.
				var item = record.getLineItemValue('custpage_package_content', 'item', i);
				var lot = record.getLineItemValue('custpage_package_content', 'lot', i);
				var expiration = record.getLineItemValue('custpage_package_content', 'expiration', i);
				if(package_content_id != null && package_content_id != '')
				{
					nlapiSubmitField('customrecord_sps_content', package_content_id, 'custrecord_sps_content_qty', quantity_to_pack);
					nlapiLogExecution('AUDIT', 'afterSubmit "edit" PC quantity updated', 'Quantity updated to: ' + quantity_to_pack);
				}
				// No PC record associated with this item line.  Create a new one.
				else
				{
					if(quantity_to_pack>0){
						var package_content_record = nlapiCreateRecord('customrecord_sps_content');
						package_content_record.setFieldValue('custrecord_sps_content_item', item);
						package_content_record.setFieldValue('custrecord_sps_content_item_line_num', sequence);
						package_content_record.setFieldValue('custrecord_sps_content_qty', quantity_to_pack);
						package_content_record.setFieldValue('custrecord_sps_content_package', record.getId());
						//additional values added for sourcing to the pack content part of v3
						/*
                        package_content_record.setFieldValue('custrecord_sps_content_lot', lot);
                        package_content_record.setFieldValue('custrecord_sps_content_expiration', expiration);
                        package_content_record.setFieldValue('custrecord_parent_pack_level_type', packLevelType);
                        package_content_record.setFieldValue('custrecord_parent_pack_inner_pk', innerPack);
                        package_content_record.setFieldValue('custrecord_parent_pack_outer_pk', outerPack);
                        package_content_record.setFieldValue('custrecord_parent_pack_type', packDefinition);
                        package_content_record.setFieldValue('custrecord_parent_pack_type', packWeight);
                        */
						var new_rec_id = nlapiSubmitRecord(package_content_record);
					}
					nlapiLogExecution('AUDIT', 'afterSubmit "edit" PC Record submitted', 'New PC record ID: ' + new_rec_id);
				}
			}
			// include_in_pacakge == 'F', need to check if line has a Package Content ID, if it does that PC is no longer selected and needs to be deleted
			else
			{
				// Not selected afterSubit of 'edit' op, but package_content_id is present.  Remove PC record.
				if(package_content_id != null && package_content_id != '')
				{
					nlapiLogExecution('AUDIT', 'afterSubmit "edit" Package "edit" op', 'PC record deleted with ID: ' + package_content_id);
					nlapiDeleteRecord('customrecord_sps_content', package_content_id);
				}
			}
		}
		// Record has been updated, update the Item Fulfillment
		updateItemFulfillmentPackedQuantities(itemFulfillmentId);
	}
	// Delete -- not needed because that needs to be handled beforeSubmit.  Would get dependent record error if design was to delete PC record after deleting Package record

	// Check if manual pack has completed the Item Shipment/Item Fulfillment
	nlapiLogExecution("AUDIT", "Item Shipment Internal ID To Check: ", itemFulfillmentId);
	var spsScriptStatusRecInternalID = checkPartiallyPackedScriptStatusRec(itemFulfillmentId)

	// If manual pack completed the IS/IF, use SPS Record Exception with partial flag check, return for the item fulfillment record
	// and if so remove the partially packed flag.
	if (spsScriptStatusRecInternalID) {
		nlapiLogExecution("AUDIT", "SPS Record Internal ID: ", spsScriptStatusRecInternalID);
		var unPackedItemsArr = getArrayOfNotFullyPackedItems(itemFulfillmentId)
		if(unPackedItemsArr.length===0) {
			nlapiLogExecution("AUDIT", "Item Shipment UnPacked Keys", JSON.stringify(unPackedItemsArr));
			nlapiSubmitField('customrecord_sps_script_status', spsScriptStatusRecInternalID, 'custrecord_sps_script_status_pp_check', 'F');
		}
	}
}

function checkPartiallyPackedScriptStatusRec(ifId) {
	var filters = [];
	filters.push(new nlobjSearchFilter('custrecord_sps_script_status_pp_check',null, 'is', 'T'));
	filters.push(new nlobjSearchFilter('custrecord_sps_transaction',null, 'anyof', ifId));
	filters.push(new nlobjSearchFilter('custrecord_sps_script_title',null, 'is', 'SPS Auto Pack'));
	filters.push(new nlobjSearchFilter('custrecord_sps_script_status',null, 'contains', 'Completed'));
	var columns = [];
	columns.push(new nlobjSearchColumn('internalid'));
	columns.push(new nlobjSearchColumn('custrecord_sps_script_status_json'));
	columns.push(new nlobjSearchColumn('custrecord_sps_script_status_pp_check'));
	var scriptStatusId;
	var customrecord_sps_script_statusSearch = nlapiSearchRecord('customrecord_sps_script_status', null, filters, columns);
	if (customrecord_sps_script_statusSearch) {
		scriptStatusId = customrecord_sps_script_statusSearch[0].getValue('internalid');
	}
	return scriptStatusId;
}

function getArrayOfNotFullyPackedItems(ifId) {
	var formulaText = nlapiGetContext().getFeature('unitsofmeasure')?'{quantityuom} - {custcol_sps_qtypacked}':'{quantity} - {custcol_sps_qtypacked}'
	var filters = [];
	filters.push(new nlobjSearchFilter('type',null, 'anyof', 'ItemShip'));
	filters.push(new nlobjSearchFilter('custcol_sps_qtypacked',null, 'isnotempty', ''));
	filters.push(new nlobjSearchFilter('formulanumeric',null, 'notequalto', '0'));
	filters[2].setFormula(formulaText)
	filters.push(new nlobjSearchFilter('internalid',null, 'anyof', ifId));
	var columns = [];
	columns.push(new nlobjSearchColumn('internalid'));
	columns.push(new nlobjSearchColumn('item'));
	columns.push(new nlobjSearchColumn('line'));
	var itemFulfillmentItemsNotPacked = nlapiSearchRecord('itemfulfillment', null, filters, columns);
	var notFullyPackedItemsKeyArr = [];
	if(itemFulfillmentItemsNotPacked){
		if (itemFulfillmentItemsNotPacked.length > 0) {
			for (var i = 0; i < itemFulfillmentItemsNotPacked.length; i++) {
				var notFullyPackeditemId = itemFulfillmentItemsNotPacked[i].getValue('item');
				var notFullyPackedItemLineId = itemFulfillmentItemsNotPacked[i].getValue('line');
				var itemKeyValue = notFullyPackeditemId + '^' + notFullyPackedItemLineId;
				notFullyPackedItemsKeyArr.push(itemKeyValue);
			}
		}
	}
	return notFullyPackedItemsKeyArr;
}

// Update the Item Fulfillment.  Will search & update IF
function updateItemFulfillmentPackedQuantities(itemFulfillmentId)
{
	// Search for any Package Content that is a child of a Package for the Item Fulfillment given.  We'll grab all Package
	// Content records associated with matching Packages, and find the sum of quantity packed for each line on the Item Fulfillment.
	// These values will be used to make sure the Item Fulfillment's Packed custom column value is accurate for each item.
	var filters = [];
	filters.push(new nlobjSearchFilter('custrecord_sps_pack_asn', 'custrecord_sps_content_package', 'is', itemFulfillmentId));
	var columns = [];
	columns.push(new nlobjSearchColumn('custrecord_sps_content_item_line_num', null, 'group'));
	columns.push(new nlobjSearchColumn('custrecord_sps_content_qty', null, 'sum'));
	columns.push(new nlobjSearchColumn('custrecord_sps_content_package', null, 'group'));

//	var line_quantities = {};
	var line_quantities = [];
	var cartons = {};
	var pc_results = nlapiSearchRecord('customrecord_sps_content', null, filters, columns);
	var allPackContentResults = pc_results;
	var packages = [];
	nlapiLogExecution("debug", "execution governance", nlapiGetContext().getRemainingUsage())
	if(pc_results){
		do {
			if (packages && packages.length > 0) {
				filters.push(new nlobjSearchFilter('custrecord_sps_content_package', null, 'noneof', packages));
				pc_results = nlapiSearchRecord('customrecord_sps_content', null, filters, columns);
				allPackContentResults = allPackContentResults.concat(pc_results);
				nlapiLogExecution("debug", "execution  do while governance", nlapiGetContext().getRemainingUsage())
			}
			for (var i = 0; i < pc_results.length; i++) {
				var packageId = pc_results[i].getValue(columns[2]);
				packages.push(packageId);
			}
		} while (pc_results.length === 1000);
		for(var i = 0; i < allPackContentResults.length; i++){
			var line_num = allPackContentResults[i].getValue('custrecord_sps_content_item_line_num', null, 'group');
			var total_quantity = parseFloat(allPackContentResults[i].getValue('custrecord_sps_content_qty', null, 'sum'));
			if (typeof line_quantities[i] == 'undefined') {
				line_quantities[i] = {};
			}
			line_quantities[i].line_num = line_num;
			line_quantities[i].line_qty = total_quantity;
			cartons[allPackContentResults[i].getValue('custrecord_sps_content_package', null, 'group')] = true;
		}
	}

	var carton_count = 0;
	for (ea in cartons) {
		carton_count++;
	}
	// Update the given Item Fulfillment with the values from the search
	var if_record = nlapiLoadRecord('itemfulfillment', itemFulfillmentId);

	if_record.setFieldValue('custbody_sps_trans_carton_ct', carton_count);

	for(var i = 1; i <= if_record.getLineItemCount('item'); i++)
	{
		var sequence = if_record.getLineItemValue('item','line',i);
		var lq_len=line_quantities.length;
//		var curr_total_quantity = line_quantities[i];
		var curr_total_quantity = 0;

		//lot logic
		// nlapiLogExecution('DEBUG','Line Qtys',JSON.stringify(line_quantities));
		for(var j=0;j<lq_len;j++){
			var lq_sequence = line_quantities[j]["line_num"];
			// nlapiLogExecution('DEBUG','COMPARING VALUES','Sequence: '+sequence+' | Line Qtys: '+lq_sequence);
			if(sequence==lq_sequence){
				var lq_qty = line_quantities[j]["line_qty"];
				curr_total_quantity += lq_qty;
				var lot = if_record.getLineItemValue('item','isnumbered',i)||false;

			}



		}
		//nlapiLogExecution('AUDIT', 'line quantity: '+curr_total_quantity);
		if_record.setLineItemValue('item', 'custcol_sps_qtypacked', i, curr_total_quantity)
	}
	nlapiLogExecution('debug','Saving fulfillment for update logic');
	nlapiLogExecution("debug", "Final Save IF governance", nlapiGetContext().getRemainingUsage())
	return nlapiSubmitRecord(if_record);
}
//correcting sequencing for carton index
function getNewCartonIdx(pkgIdxs) {
	nlapiLogExecution('DEBUG', 'Subtabs', JSON.stringify(pkgIdxs));
	for(var i = 0; i < pkgIdxs.length; i++) {
		var currentCartonIdx = i + 1;
		// Return missing carton index in middle of list (i.e. return 3 if current indices are 1, 2, 4)
		if (pkgIdxs[i] != currentCartonIdx) {
			return currentCartonIdx;
		}
	}
	// Return new carton index at the end of current list
	return pkgIdxs.length + 1;
}
//determine how many of the current lot is packed
function findLotPack(itemFulfillmentId,lotNumber,itemFulfillmentLine,itemId){
	var pc_filters = [
		["custrecord_pack_content_fulfillment","anyof",itemFulfillmentId],
		"AND",
		["custrecord_sps_content_lot","is",lotNumber],
		"AND",
		["custrecord_sps_content_item_line_num","equalto",itemFulfillmentLine],
		"AND",
		["custrecord_sps_content_item","anyof",itemId]
	];
	var pc_columns = [];
	pc_columns.push(new nlobjSearchColumn('custrecord_sps_content_qty',null,'sum'));
	var pc_results = nlapiSearchRecord('customrecord_sps_content', null, pc_filters, pc_columns);
	var totalQtyPacked = 0;
	if(pc_results){
		totalQtyPacked = pc_results[0].getValue('custrecord_sps_content_qty',null,'sum');
	}
	return totalQtyPacked;
}
