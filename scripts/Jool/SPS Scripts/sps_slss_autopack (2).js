(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.SPS = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * Created by rbloom on 10/22/15.
 */

"use strict";

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var SuiteLimiter = (function () {
    /**
     * Construct a new SuiteLimiter object
     * @param point_buffer {int?} Set a point buffer; default 0
     * @param clock_override {int?} Set a clock limit; default 0
     */

    function SuiteLimiter(point_buffer, clock_override) {
        _classCallCheck(this, SuiteLimiter);

        this.scriptStart = new Date();
        this.context = nlapiGetContext();
        this.clockBuffer = 5000;
        this.clockTimeMap = {
            "scheduled": 3600000,
            "suitelet": 300000,
            "portlet": 300000
        };
        this.pointBuffer = point_buffer ? point_buffer : 0;
        this.clockLimit = clock_override ? clock_override : this.clockTimeMap[this.context.getExecutionContext()];
    }

    /**
     * Manually set the time buffer
     * @param milliseconds {int} new buffer zone for clock
     */

    _createClass(SuiteLimiter, [{
        key: "setClockBuffer",
        value: function setClockBuffer(milliseconds) {
            this.clockBuffer = milliseconds;
        }

        /**
         * Manually override the time limit.
         * @param milliseconds
         */
    }, {
        key: "setClockLimit",
        value: function setClockLimit(milliseconds) {
            this.clockLimit = milliseconds;
        }

        /**
         * Manually set the point buffer
         * @param points {int}
         */
    }, {
        key: "setPointBuffer",
        value: function setPointBuffer(points) {
            this.pointBuffer = points;
        }

        /**
         * Check if runtime has fallen into an unsafe buffer (e.g. may time out or run out of points)
         * @returns {boolean} True if in unsafe buffer
         */
    }, {
        key: "checkIfAboutToTimeout",
        value: function checkIfAboutToTimeout() {
            var time_limit = this.getTimeElapsed() >= this.clockLimit - this.clockBuffer;
            var point_limit = this.context.getRemainingUsage() <= this.pointBuffer;
            return time_limit || point_limit;
        }

        /**
         * Returns runtime of the current script
         * @returns {number} milliseconds script has been running.
         */
    }, {
        key: "getTimeElapsed",
        value: function getTimeElapsed() {
            var now = new Date();
            return now - this.scriptStart;
        }

        /**
         * Returns the remaining execution points less the described buffer.
         * @returns {number}
         */
    }, {
        key: "getEffectivePointsLeft",
        value: function getEffectivePointsLeft() {
            return this.context.getRemainingUsage() - this.pointBuffer;
        }
    }]);

    return SuiteLimiter;
})();

module.exports = SuiteLimiter;

},{}],2:[function(require,module,exports){
'use strict';

var _slicedToArray = (function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i['return']) _i['return'](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError('Invalid attempt to destructure non-iterable instance'); } }; })();

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Scheduled = (function () {
    function Scheduled(scriptId, deploymentId, logicFunction, params, id) {
        _classCallCheck(this, Scheduled);

        this.scriptId = scriptId;
        this.deploymentId = deploymentId;
        this.logicFunction = logicFunction;
        this.params = params;
        this.id = id;

        this._requestParams = {};
        this._scriptParams = {};
        this._defaultParams = {};
    }

    /**
     * @readonly
     * @enum {string}
     */

    _createClass(Scheduled, [{
        key: 'schedule',
        value: function schedule() {

            var stringParams = JSON.stringify(this.params);

            var record = nlapiCreateRecord('customrecord_sps_scheduled_queue', {});

            record.setFieldValue('custrecord_sps_scheduled_script', this.scriptId);
            record.setFieldValue('custrecord_sps_scheduled_deployment', this.deploymentId);
            record.setFieldValue('custrecord_sps_scheduled_params', stringParams);

            var recordId = nlapiSubmitRecord(record);

            nlapiLogExecution('DEBUG', 'Queued script ' + this.scriptId + ": " + recordId, stringParams);

            var scheduleResult = nlapiScheduleScript(this.scriptId, this.deploymentId, {}); // 20
            switch (scheduleResult) {
                case 'QUEUED':
                case 'INQUEUE':
                case 'SCHEDULED':
                case 'INPROGRESS':
                    nlapiLogExecution('DEBUG', 'Scheduled', 'Scheduled script ' + this.scriptId + ' got result ' + scheduleResult);
                    break;
                default:
                    nlapiLogExecution('ERROR', 'Failed to schedule', 'Attempted to schedule script ' + this.scriptId + ' but got result ' + scheduleResult);
                    break;
            }
        }
    }, {
        key: 'resolve',
        value: function resolve() {
            if (this.id != null) {
                try {
                    nlapiDeleteRecord('customrecord_sps_scheduled_queue', this.id);
                } catch (e) {
                    nlapiLogExecution('DEBUG', 'Delete of scheduled queue record failed ' + this.id);
                    nlapiLogExecution('DEBUG', 'Error Context: ' + e.context);
                }
            }
        }
    }, {
        key: 'suitelet',
        value: function suitelet(request, response) {
            this.params = {};
            for (var param in this._requestParams) {
                if (this._requestParams.hasOwnProperty(param)) {
                    var val = this._requestParams[param];
                    var func = null;
                    if (val instanceof Array) {
                        func = val[1];
                        val = val[0];
                    }
                    val = request.getParameter(val);
                    nlapiLogExecution('DEBUG', 'Request param ' + param, val);
                    if (func instanceof Function) {
                        val = func(val);
                    }
                    nlapiLogExecution('DEBUG', 'Request param processed ' + param, JSON.stringify(val));
                    if (val !== undefined) {
                        this.params[param] = val;
                    }
                }
            }

            for (var param in this._scriptParams) {
                if (this._scriptParams.hasOwnProperty(param)) {
                    var val = this._scriptParams[param];
                    val = nlapiGetContext().getSetting('SCRIPT', val);
                    nlapiLogExecution('DEBUG', 'Request param processed ' + param, JSON.stringify(val));
                    if (val !== undefined) {
                        this.params[param] = val;
                    }
                }
            }
            nlapiLogExecution('DEBUG', 'SUITELET', JSON.stringify({
                scriptId: this.scriptId,
                deploymentId: this.deploymentId,
                params: this.params,
                id: this.id,
                logicFunction: this.logicFunction,
                _requestParams: this._requestParams,
                _scriptParams: this._scriptParams
            }));

            var _logicFunction = this.logicFunction(this.params);

            var scheduledResult = _logicFunction.scheduledResult;
            var message = _logicFunction.message;

            response.write(message);
            if (scheduledResult !== Scheduled.Result.FINISHED) {
                this.schedule();
            }
        }
    }, {
        key: 'scheduledScript',
        value: function scheduledScript() {
            while (true) {
                try {
                    var firstTime = this.id == null;
                    if (!this.getNext()) {
                        return;
                    }
                    if (!firstTime) {
                        nlapiLogExecution('DEBUG', 'Yielding', 'Yielded script ' + this.scriptId + ' Queue id ' + this.id);
                        nlapiYieldScript();
                    }

                    var _logicFunction2 = this.logicFunction(this.params, this);

                    var scheduledResult = _logicFunction2.scheduledResult;
                    var message = _logicFunction2.message;

                    if (scheduledResult == Scheduled.Result.FINISHED) {
                        nlapiLogExecution('DEBUG', 'Finished queue ' + this.id, message);
                    }
                } finally {
                    this.resolve();
                }
            }
        }
    }, {
        key: 'spsapi',
        value: function spsapi(params) {
            this.params = {};

            for (var param in params) {
                if (params.hasOwnProperty(param)) {
                    var val = params[param];
                    nlapiLogExecution('DEBUG', 'Direct param processed ' + param, JSON.stringify(val));
                    if (val !== undefined) {
                        this.params[param] = val;
                    }
                }
            }

            for (var param in this._defaultParams) {
                if (this._defaultParams.hasOwnProperty(param)) {
                    if (this.params.hasOwnProperty(param)) {
                        continue;
                    }
                    var val = this._defaultParams[param];
                    nlapiLogExecution('DEBUG', 'Default param processed ' + param, JSON.stringify(val));
                    if (val !== undefined) {
                        this.params[param] = val;
                    }
                }
            }

            var _logicFunction3 = this.logicFunction(this.params);

            var scheduledResult = _logicFunction3.scheduledResult;
            var message = _logicFunction3.message;

            nlapiLogExecution('DEBUG', 'Library script returned ' + scheduledResult, message);
            if (scheduledResult !== Scheduled.Result.FINISHED) {
                this.schedule();
            }
            return scheduledResult;
        }
    }, {
        key: 'getNext',
        value: function getNext() {
            var filterExp = [new nlobjSearchFilter('custrecord_sps_scheduled_script', null, 'is', this.scriptId, null), new nlobjSearchFilter('custrecord_sps_scheduled_deployment', null, 'is', this.deploymentId, null)];

            var _columnExp = columnExp = [new nlobjSearchColumn('custrecord_sps_scheduled_params'), new nlobjSearchColumn('created').setSort(false)];

            var _columnExp2 = _slicedToArray(_columnExp, 2);

            var paramsColumn = _columnExp2[0];
            var createdColumn = _columnExp2[1];

            var search = nlapiCreateSearch('customrecord_sps_scheduled_queue', filterExp, columnExp);
            var searchResults = search.runSearch();

            var resultList = searchResults.getResults(0, 1);

            if (resultList == null || resultList.length == 0) {
                nlapiLogExecution('DEBUG', 'No work for scheduled script ' + this.scriptId);
                this.id = null;
                return false;
            }
            var scheduled = resultList[0];

            var stringParams = scheduled.getValue(paramsColumn);
            var created = scheduled.getValue(createdColumn);

            this.params = JSON.parse(stringParams);

            this.id = scheduled.getId();

            nlapiLogExecution('DEBUG', 'Starting scheduled script ' + this.scriptId + ' queued ' + this.id + ' on ' + created, stringParams);
            return true;
        }
    }, {
        key: 'requestParams',
        set: function set(params) {
            this._requestParams = {};
            for (var param in params) {
                if (params.hasOwnProperty(param)) {
                    this._requestParams[param] = params[param];
                }
            }
        }
    }, {
        key: 'scriptParams',
        set: function set(params) {
            this._scriptParams = {};
            for (var param in params) {
                if (params.hasOwnProperty(param)) {
                    this._scriptParams[param] = params[param];
                }
            }
        }
    }, {
        key: 'defaultParams',
        set: function set(params) {
            this._defaultParams = {};
            for (var param in params) {
                if (params.hasOwnProperty(param)) {
                    this._defaultParams[param] = params[param];
                }
            }
        }
    }]);

    return Scheduled;
})();

Scheduled.Result = {
    FINISHED: "FINISHED",
    YIELDED: "YIELDED",
    SCHEDULED: "SCHEDULED"
};

var LogicResult = function LogicResult(scheduledResult, message) {
    _classCallCheck(this, LogicResult);

    this.scheduledResult = scheduledResult;
    this.message = message;
};

Scheduled.LogicResult = LogicResult;

module.exports = Scheduled;

/**
 * @callback LogicFunction
 * @param {Object} params
 * @param {Scheduled} [scheduled]
 * @return {LogicResult}
 */

},{}],3:[function(require,module,exports){
/**
 * Module Description
 *
 * Version    Date            Author           Remarks
 * 1.00       09 Oct 2014     sprintz
 *
 */

'use strict';

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Scheduled = require('../../Common/scripts/scheduled.js');
var SuiteLimiter = require('../../Common/scripts/SuiteLimiter.js');

/**
 * @param {Object} params
 * @param {int} params.stId item fulfillment id
 *
 * @param {Scheduled} scheduled
 * @return {Scheduled.LogicResult}
 */
function autoPack(params, scheduled) {
	var limiter = new SuiteLimiter();

	var stID = params.stID;
	//adding logic create and gather Lot Qty Packed for Objects
	var ifLotQtyPacked = nlapiSearchRecord("customrecord_sps_content",null,
[
   ["custrecord_pack_content_fulfillment","anyof",stID],
   "AND",
   ["custrecord_sps_content_lot","isnotempty",""]
],
[
   new nlobjSearchColumn("custrecord_sps_content_lot",null,"GROUP"),
   new nlobjSearchColumn("custrecord_sps_content_item",null,"GROUP"),
   new nlobjSearchColumn("custrecord_sps_content_qty",null,"SUM")
]
);
	var packLotQtyDir = {};
	if(ifLotQtyPacked){
		for(i=0;i<ifLotQtyPacked.length;i++){

			var lotItemPackId = ifLotQtyPacked[i].getValue('custrecord_sps_content_lot',null,'GROUP')+ifLotQtyPacked[i].getValue('custrecord_sps_content_item',null,'GROUP');
			var lotItemPackQty = ifLotQtyPacked[i].getValue('custrecord_sps_content_qty',null,'SUM');
			packLotQtyDir[lotItemPackId] = lotItemPackQty;  //create the array object for use later
		}
    }

    nlapiLogExecution('DEBUG','Lot Qtys Packed  Object',JSON.stringify(packLotQtyDir));
    //grab Customer Lot Flag to ensure whether customer wants to pack Lot values

var custLotFlag = nlapiLookupField('itemfulfillment',stID,'customer.custentity_sps_lot_exp_flag') || 'F' ;

	nlapiLogExecution('DEBUG', 'Autopack', stID);

	var state = new PackingState(stID); // 10

	for (var i = 1; i <= state.count; i++) {
		nlapiLogExecution('DEBUG','PROCESSING LINE '+i+' of '+state.count);

		if (i % 10 == 0) {
			nlapiLogExecution('DEBUG', 'Autopack', stID + ": " + i);
		}

		var lineItem = new LineItem(state, i,packLotQtyDir);
		//nlapiLogExecution('ERROR', 'quantityPacked', quantityPacked);
		//nlapiLogExecution('ERROR', 'itemQty', itemQty);
		//nlapiLogExecution('ERROR', 'itemType', itemType);

		if (lineItem.needsPacking()) {
			if(nlapiGetContext().getExecutionContext()!='scheduled'){

				limiter.setPointBuffer(44 + 12 * lineItem.quantityRemaining);
			}
			if (limiter.checkIfAboutToTimeout()) {
				nlapiLogExecution('DEBUG', 'Script timing out');
				var _packageNotes = '';
				if (i > 1) {
					_packageNotes = state.saveState(false) + "\r\n"; // 20
				}
				if (scheduled) {
					state = null;
					lineItem = null;
					nlapiLogExecution('DEBUG', 'Yielding at line ' + i);
					nlapiYieldScript();
					state = new PackingState(stID); // 10
					i = 0; // reset to the beginning in case things have changed
					continue;
				} else {
					return new Scheduled.LogicResult(Scheduled.Result.SCHEDULED, _packageNotes + 'Autopacking the item fulfillment has been sent to a scheduled script');
				}
			}

			var arrRuleFilters = new Array();
			arrRuleFilters.push(new nlobjSearchFilter('custrecord_sps_pack_item', null, 'anyof', lineItem.stItem, null));
            arrRuleFilters.push(new nlobjSearchFilter('isinactive', null, 'is', 'F'));
            arrRuleFilters.push(new nlobjSearchFilter('isinactive', 'custrecord_sps_package_type', 'is', 'F'));

			var arrRuleColumns = new Array();
			arrRuleColumns.push(new nlobjSearchColumn('custrecordsps_pack_config_qty'));
			arrRuleColumns.push(new nlobjSearchColumn('custrecord_sps_package_type'));
			arrRuleColumns.push(new nlobjSearchColumn('custrecord_sps_box_weight', 'custrecord_sps_package_type'));
			// Sorting by custrecordsps_pack_config_qty is assumed in choosing the best Package Definition.  Do not modify without verifying impact.
			arrRuleColumns.push(arrRuleColumns[0].setSort());

            var arrRuleSearchResults = nlapiSearchRecord('customrecord_sps_pack_qty', null, arrRuleFilters, arrRuleColumns); // 10
             /* adding logic to throw error message on autopacking Lot Items after they were packed without Lot features being enabled
             if(this.lineItem.quantityPacked>0&lotQtyPacked==0){//if qty packed is greater than zero and the lot qty packed from search returns zero, then Lot item was backed without Lot features enabled
                //logic here
                nlapiLogExecution('DEBUG','Checking logic ran as expected', 'Line Qty Packed Already: '+this.lineItem.quantityPacked+' Lot Qty Determined via Search: '+lotQtyPacked);
            }
            */

            if(lineItem.isLot=='T'&&(lineItem.quantityPacked!=lineItem.lotPackTotalQty)&&custLotFlag=='F'){
            var itemId = state.itemFulfillmentRec.getLineItemValue('item', 'itemname', i);
            if (state.arrLotItemAlreadyPacked.indexOf(itemId) < 0){
                state.arrLotItemAlreadyPacked.push(itemId);
            }
            }else if (arrRuleSearchResults != null) {
				lineItem.loadRec();

//				nlapiLogExecution('ERROR', 'quantityRemaining', quantityRemaining);

				var bestPackageDetails = getBestPackageForRemainingQuantity(arrRuleSearchResults, lineItem, stID,custLotFlag);
				bestPackageDetails.packAsManyAsPossible(stID,custLotFlag);

				if (lineItem.quantityRemaining > 0) {
					bestPackageDetails = getBestPackageForRemainingQuantity(arrRuleSearchResults, lineItem, stID,custLotFlag);
					bestPackageDetails.pack(stID,custLotFlag);
				}

				state.arrItemsPacked.push(i);
            }else {
                var itemId = state.itemFulfillmentRec.getLineItemValue('item', 'itemname', i);
				if (state.arrItemsNotPacked.indexOf(itemId) < 0) state.arrItemsNotPacked.push(itemId);
			}
		} else {
			//arrItemsNotPacked.push(stItem);
		}
	}

	var packageNotes = state.saveState(true); // 20

	return new Scheduled.LogicResult(Scheduled.Result.FINISHED, packageNotes);
}


var BestPackage = (function () {
	function BestPackage(lineItem, qty, type, weight, stID,custLotFlag) {
		_classCallCheck(this, BestPackage);


		this.lineItem = lineItem;
		this.qty = qty;
		this.type = type;
		this.weight = weight;
        this.stID = stID;
        this.custLotFlag = custLotFlag;
	}

	_createClass(BestPackage, [{
		key: 'packAsManyAsPossible',
		value: function packAsManyAsPossible(stID,custLotFlag) {
			while (this.lineItem.quantityRemaining > this.qty) {
				this.pack(stID,custLotFlag);
			}
		}
	}, {
		key: 'pack',
		value: function pack(stID,custLotFlag,state) {

			var quantity = Math.min(this.lineItem.quantityRemaining, this.qty);

			nlapiLogExecution('DEBUG', 'Packing line ' + this.lineItem.itemLineNum + ' of item ' + this.lineItem.stItem + ' from remaining total ' + this.lineItem.quantityRemaining, 'Item is lot: '+this.lineItem.isLot+' Quantity in package: ' + quantity + ' Package size: ' + this.qty + ' Package Type: ' + this.type + ' Package Weight: ' + this.weight);
			if(this.lineItem.isLot!='T' || custLotFlag=='T'){ //not a lot numbered item, standard pack logic, Cust Lot Flag signals whether customer wants to DISABLE lot features
				this.lineItem.pack(quantity, this.type, this.weight);
				this.lineItem.quantityPacked += quantity;
				this.lineItem.quantityRemaining -= quantity;
	//			if(nlapiGetContext().getExecutionContext()!='scheduled'){
					if(nlapiGetContext().getRemainingUsage() < 100){ //check governance & create 'checkpoint' for script to continue from
						if(nlapiGetContext().getExecutionContext()!='scheduled'){
							return new Scheduled.LogicResult(Scheduled.Result.SCHEDULED, 'Autopacking the item fulfillment has been sent to a scheduled script');
						}else{
							nlapiLogExecution('DEBUG', 'Script timing out');
							state = null;
							lineItem = null;
							nlapiLogExecution('DEBUG', 'Yielding at item ' + this.lineItem.stItem);
							nlapiYieldScript();
							state = new PackingState(stID); // 10
						}
					}
	//			}
			}else{ //item is lot numbered, requires packing by lot
				for(var lotResult=0;lotResult<this.lineItem.detail.length;lotResult++){
					var lotId = this.lineItem.detail[lotResult].assignmentId;
					var lotNumber = this.lineItem.detail[lotResult].lotNumber;
					var lotQty = this.lineItem.detail[lotResult].quantityPicked;
					var lotExpiration = this.lineItem.detail[lotResult].expiration;
					var lotItemName = this.lineItem.stItem;
                    var lotQtyPacked = this.lineItem.detail[lotResult].lotQtyPacked || 0;
                    var lotQtyRemaining = lotQty - lotQtyPacked;
					//nlapiLogExecution('DEBUG','Confirming Lot Number: ',lotNumber+' Lot Item Name or ID: '+lotItemName+' Lot Qty Packed : '+lotQtyPacked);
//					nlapiLogExecution('DEBUG','Factoring lotQtyRemaining',lotQtyRemaining+' = math.min('+lotQty+' , '+this.qty+')');
					while (lotQtyRemaining > 0){
						var lotQtyToPack = Math.min(quantity,lotQtyRemaining);
						nlapiLogExecution('DEBUG','Packing lot '+(lotResult+1)+' of '+this.lineItem.detail.length+ ' Qty '+lotQtyToPack+' from remaining total '+lotQtyRemaining,JSON.stringify(this.lineItem.detail[lotResult]));
						this.lineItem.packLots(lotQtyToPack, this.type, this.weight, lotNumber, lotQty, lotExpiration);
						lotQtyPacked+=quantity;
						lotQtyRemaining-=lotQtyToPack;

						this.lineItem.quantityPacked += quantity;
						this.lineItem.quantityRemaining -= lotQtyToPack;
						//			if(nlapiGetContext().getExecutionContext()!='scheduled'){
						if(nlapiGetContext().getRemainingUsage() < 200){ //check governance & create 'checkpoint' for script to continue from
							if(nlapiGetContext().getExecutionContext()!='scheduled'){
								return new Scheduled.LogicResult(Scheduled.Result.SCHEDULED, 'Autopacking the item fulfillment has been sent to a scheduled script');
							}else{
								nlapiLogExecution('DEBUG', 'Script timing out');
								state = null;
								lineItem = null;
								nlapiLogExecution('DEBUG', 'Yielding at item ' + this.lineItem.stItem);
								nlapiYieldScript();
								state = new PackingState(stID); // 10
							}
						}
		//			}
					}
//					this.lineItem.quantityPacked += lotQty;
//					this.lineItem.quantityRemaining -= lotQty;
				}
			}
		}
	}]);

	return BestPackage;
})();

var LineItem = (function () {
	function LineItem(state, i,packLotQtyDir) {
		_classCallCheck(this, LineItem);


		this.state = state;
		this.stItem = state.itemFulfillmentRec.getLineItemValue('item', 'item', i);
		this.itemType = state.itemFulfillmentRec.getLineItemValue('item', 'itemtype', i);
		this.quantityPacked = Number(state.itemFulfillmentRec.getLineItemValue('item', 'custcol_sps_qtypacked', i)) || 0;
		this.itemQty = Number(state.itemFulfillmentRec.getLineItemValue('item', 'quantity', i));
		this.quantityRemaining = this.itemQty - this.quantityPacked;
		this.itemLineNum = i;
		this.sequence = state.itemFulfillmentRec.getLineItemValue('item','line',i);
		//lot validation
		this.isLot = state.itemFulfillmentRec.getLineItemValue('item','isnumbered',i)||false;
        this.detail = [];
        this.lotPackTotalQty = 0;
//		nlapiLogExecution('DEBUG','LineItem','IS LOT: '+this.isLot);
      //  nlapiLogExecution('DEBUG','lot flag test',this.state.custLotFlag);
		if(this.isLot=='T'){
			var invDetail = state.itemFulfillmentRec.viewLineItemSubrecord('item','inventorydetail',this.itemLineNum);
            var invDetailLines = invDetail.getLineItemCount('inventoryassignment');
			//loop inventory detail's inventory assignment lines
			for(var iD=1;iD<=invDetailLines;iD++){
				var assignmentDetail = {};
				assignmentDetail.assignmentId = invDetail.getLineItemValue('inventoryassignment','internalid',iD);
				assignmentDetail.lotNumber = invDetail.getLineItemText('inventoryassignment','issueinventorynumber',iD);
				assignmentDetail.quantityPicked = Number(invDetail.getLineItemValue('inventoryassignment','quantity',iD));
                assignmentDetail.expiration = invDetail.getLineItemValue('inventoryassignment','expirationdate',iD);
                var assignLotQty = Number(packLotQtyDir[assignmentDetail.lotNumber+this.stItem]) || 0;
                assignmentDetail.lotQtyPacked = assignLotQty
                this.lotPackTotalQty += assignLotQty
//				nlapiLogExecution('DEBUG','INVENTORY DETAIL '+iD+' of '+invDetailLines,JSON.stringify(assignmentDetail));
				this.detail.push(assignmentDetail);
            }
            nlapiLogExecution('DEBUG','Line Item: '+this.stItem,'Lot Total Qty Packed: '+this.lotPackTotalQty);
        }
	}

	_createClass(LineItem, [{
		key: 'needsPacking',
		value: function needsPacking() {
			return (this.itemType == 'InvtPart' || this.itemType == 'Assembly' || this.itemType == 'Kit' || this.itemType == 'NonInvtPart') && this.quantityRemaining > 0;
		}
	}, {
		key: 'pack',
		value: function pack(itemQty, packageType, packageWeight) {
			var packageRec = nlapiCreateRecord('customrecord_sps_package', {}); // 2
			packageRec.setFieldValue('custrecord_sps_pk_weight', this.itemRec.getFieldValue('weight') * itemQty + packageWeight);
			packageRec.setFieldValue('custrecord_sps_pack_asn', this.state.stID);
			packageRec.setFieldValue('custrecord_sps_package_qty', itemQty);
            packageRec.setFieldValue('custrecord_sps_package_box_type', packageType);
            if(this.state.missingCartonIndexes.length>0){//if missing carton index array has any values, use these first then move on to next carton count
                packageRec.setFieldValue('custrecord_sps_package_carton_index', this.state.missingCartonIndexes[0]);
                this.state.missingCartonIndexes.splice(0,1);//remove index from missing carton index array once it has been used
                ++this.state.currCartonCount;
            }else{
            packageRec.setFieldValue('custrecord_sps_package_carton_index', ++this.state.currCartonCount);
            }
			var packageId = nlapiSubmitRecord(packageRec); // 4
			this.state.newPackCount++;

			var packageContentsRec = nlapiCreateRecord('customrecord_sps_content'); // 2
			packageContentsRec.setFieldValue('custrecord_sps_content_package', packageId);
			packageContentsRec.setFieldValue('custrecord_sps_content_qty', itemQty);
			packageContentsRec.setFieldValue('custrecord_sps_content_item', this.stItem);
			packageContentsRec.setFieldValue('custrecord_sps_content_item_line_num', this.sequence);
			nlapiSubmitRecord(packageContentsRec); // 4

			var qty = this.state.itemFulfillmentRec.getLineItemValue('item', 'quantity', this.itemLineNum);
			this.state.itemFulfillmentRec.setLineItemValue('item', 'custcol_sps_qtypacked', this.itemLineNum, qty);
			this.state.itemFulfillmentRec.setFieldValue('custbody_sps_trans_carton_ct', this.state.currCartonCount);
		}
	},{
		key: 'packLots',
		value: function packLots(itemQty, packageType, packageWeight, lotNumber, lotQty, lotExpiration) {
			var packageRec = nlapiCreateRecord('customrecord_sps_package', {}); // 2
			packageRec.setFieldValue('custrecord_sps_pk_weight', this.itemRec.getFieldValue('weight') * itemQty + packageWeight);
			packageRec.setFieldValue('custrecord_sps_pack_asn', this.state.stID);
			packageRec.setFieldValue('custrecord_sps_package_qty', itemQty);
			packageRec.setFieldValue('custrecord_sps_package_box_type', packageType);
            if(this.state.missingCartonIndexes.length>0){//if missing carton index array has any values, use these first then move on to next carton count
                packageRec.setFieldValue('custrecord_sps_package_carton_index', this.state.missingCartonIndexes[0]);
                this.state.missingCartonIndexes.splice(0,1);//remove index from missing carton index array once it has been used
                ++this.state.currCartonCount;
            }else{
            packageRec.setFieldValue('custrecord_sps_package_carton_index', ++this.state.currCartonCount);
            }
			var packageId = nlapiSubmitRecord(packageRec); // 4
			this.state.newPackCount++;

			var packageContentsRec = nlapiCreateRecord('customrecord_sps_content'); // 2
			packageContentsRec.setFieldValue('custrecord_sps_content_package', packageId);
			packageContentsRec.setFieldValue('custrecord_sps_content_qty', itemQty);
			packageContentsRec.setFieldValue('custrecord_sps_content_item', this.stItem);
			packageContentsRec.setFieldValue('custrecord_sps_content_item_line_num', this.sequence);
			//lot fields
			if(lotNumber!='undefined'){
				packageContentsRec.setFieldValue('custrecord_sps_content_lot', lotNumber);
			}
			if(lotExpiration!='undefined'){
				packageContentsRec.setFieldValue('custrecord_sps_content_expiration', lotExpiration);
			}
			nlapiSubmitRecord(packageContentsRec); // 4

			var qty = this.state.itemFulfillmentRec.getLineItemValue('item', 'quantity', this.itemLineNum);
			this.state.itemFulfillmentRec.setLineItemValue('item', 'custcol_sps_qtypacked', this.itemLineNum, qty);
			this.state.itemFulfillmentRec.setFieldValue('custbody_sps_trans_carton_ct', this.state.currCartonCount);
		}
	}, {
		key: 'loadRec',
		value: function loadRec() {
			this.itemRec = null;
			if (this.itemType == 'InvtPart') {
				this.itemRec = nlapiLoadRecord('inventoryitem', this.stItem); // 4
			} else if (this.itemType == 'Assembly') {
					this.itemRec = nlapiLoadRecord('assemblyitem', this.stItem); // 4
				} else if (this.itemType == 'Kit') {
						this.itemRec = nlapiLoadRecord('kititem', this.stItem); // 4
					} else if (this.itemType == 'NonInvtPart') {
							this.itemRec = nlapiLoadRecord('noninventoryitem', this.stItem); // 4
						}
		}
	}]);

	return LineItem;
})();

var PackingState = (function () {
	function PackingState(stID) {
		_classCallCheck(this, PackingState);

		this.stID = stID;
		this.itemFulfillmentRec = nlapiLoadRecord('itemfulfillment', stID); // 10
		this.count = this.itemFulfillmentRec.getLineItemCount('item');
		this.currCartonCount = this.itemFulfillmentRec.getFieldValue('custbody_sps_trans_carton_ct') || 0;
		this.arrItemsNotPacked = new Array();
		this.arrItemsPacked = new Array();
        this.newPackCount = 0;
        this.arrLotItemAlreadyPacked = new Array();
        var pkgIdxs = new Array ();
        this.missingCartonIndexes = new Array();
        if(this.currCartonCount>0){
			var pkgFilters = [];
				pkgFilters.push(new nlobjSearchFilter('custrecord_sps_pack_asn', null, 'anyof', stID));
			var pkgColumns = [];
				pkgColumns.push(new nlobjSearchColumn('custrecord_sps_package_carton_index').setSort());
			var pkgSearch = nlapiSearchRecord('customrecord_sps_package',null,pkgFilters,pkgColumns);
			if(pkgSearch){
				pkgSearch.forEach(function(pkgResult){
					pkgIdxs.push(pkgResult.getValue('custrecord_sps_package_carton_index'));
				});
				for(var i = 0; i < Number(pkgIdxs[pkgIdxs.length-1]); i++) {
                    var currentCartonIdx = i + 1;
                    // Return missing carton index in middle of list (i.e. return 3 if current indices are 1, 2, 4)
                    if (pkgIdxs.indexOf(currentCartonIdx.toString())<0) {
                        this.missingCartonIndexes.push(currentCartonIdx);
                    }
                }
            }
            this.currCartonCount = pkgIdxs.length;;
            nlapiLogExecution('DEBUG', 'Missing Carton Check', 'Carton Count: '+this.currCartonCount+', missing carton index list: '+JSON.stringify(this.missingCartonIndexes));
            }
	}

	// Should be used to get the best Package Definition to be used with a Package based on the package rules associated with a given
	// item and the quantityRemaining to be packed.  The packageRules should always be at least one result in length.  This function
	// at present will never be called when that is not the case, but would fail with no pacakge rules provided.
	//
	// @packageRules: an array of search results with the three columns used below being required as search columns
	// @lineItem: used for the quantity used in determining the best Package Definition to use based on the rules
	// @return BestPackage

	_createClass(PackingState, [{
		key: 'saveState',
		value: function saveState(finished) {
			this.itemFulfillmentRec = nlapiLoadRecord('itemfulfillment', this.stID);
			for (var i = 0; i < this.arrItemsPacked.length; i++) {
				var line = this.arrItemsPacked[i];
				var qty = this.itemFulfillmentRec.getLineItemValue('item', 'quantity', line);
				this.itemFulfillmentRec.setLineItemValue('item', 'custcol_sps_qtypacked', line, qty);
				this.itemFulfillmentRec.setFieldValue('custbody_sps_trans_carton_ct', this.currCartonCount);
			}

			var newPackageNotes = '';
			if (this.arrItemsNotPacked.length > 0) {
				newPackageNotes += "The following item(s) were not auto packed because there are no auto pack rules defined. " + this.arrItemsNotPacked.toString() + "\r\n";
            }
            if (this.arrLotItemAlreadyPacked.length > 0) {
				newPackageNotes += "Lot item(s) " + this.arrLotItemAlreadyPacked.toString() + " not auto packed. The Lot Item(s) were packed in SPS Packages for this Item Fulfillment while the Lot Feature for SPS Packages was disabled." + "\r\n"+"The Lot Feature is currently enabled on the Customer Record. Therefore, autopack is probably packing the Lot Item(s) incorrectly based on the current SPS package configuration."+"\r\n"+"Please either disable the Lot Feature on the Customer Record or delete current SPS Packages with this Lot Item and repack them with the Lot Feature on.";
			}

			var packageNotes = this.newPackCount + ' packages created. ' + newPackageNotes;

			if (finished) {
				packageNotes += "\r\n" + "Finished auto packing";
			}
			/*
    if(packageNotes == null || packageNotes.length == 0) {
    packageNotes =  newPackageNotes;
    } else {
    packageNotes +=  "\r\n" + newPackageNotes;
    }
    */
            try{
                this.itemFulfillmentRec.setFieldValue('custbody_sps_package_notes', packageNotes);
            } catch (err) {
                this.itemFulfillmentRec.setFieldValue('custbody_sps_package_notes', 'Field cannot be set because packing notes exceeds 4,000 characters. Please see logs for complete notes.');
                nlapiLogExecution('ERROR', 'Package Notes Display Error', 'Package notes could not be displayed due to the following error: ' + err);
            } finally {
                nlapiLogExecution('DEBUG', 'Save item fulfillment', packageNotes);
                nlapiLogExecution('DEBUG', 'Lot Items Not Packed', JSON.stringify(this.arrLotItemAlreadyPacked));
            }

			nlapiSubmitRecord(this.itemFulfillmentRec, false, true); // 20

            return packageNotes;
		}
	}]);

	return PackingState;
})();

function getBestPackageForRemainingQuantity(packageRules, lineItem, stID) {
	// Initialize values to smallest Package Definition associated with the current item
	var bestPackageDetails = new BestPackage(lineItem, Number(packageRules[0].getValue('custrecordsps_pack_config_qty')), packageRules[0].getValue('custrecord_sps_package_type'), Number(packageRules[0].getValue('custrecord_sps_box_weight', 'custrecord_sps_package_type')),stID);

	// For each additional Package Definition associated check if it is a better choice than the last
	for (var j = 1; j < packageRules.length; j++) {
		var currPackageDetails = new BestPackage(lineItem, Number(packageRules[j].getValue('custrecordsps_pack_config_qty')), packageRules[j].getValue('custrecord_sps_package_type'), Number(packageRules[j].getValue('custrecord_sps_box_weight', 'custrecord_sps_package_type')));

		// If the currPackageQty is smaller than the remaining quantity, we know the currPackageType is better than what is currently set as the best
		// since the results are ordered by qty, and the curr selection is larger than the previous options
		if (currPackageDetails.qty < lineItem.quantityRemaining) {
			bestPackageDetails = currPackageDetails;
		}
		// Else the currPackageQty is larger than or equal to the remaining quantity this will be our last evaluation and we need to determine if the previous
		// "best" or current definition are better.  The previous best will be generally be smaller than the remaining quantity, and the Package Definition whose quantity
		// is closer to the remaining quantity is selected, with the larger definition being selected in a tie (NC114).  Some situations could occur where the smallest
		// definition is still larger than the quantityRemaining, in which case we would obviously go with this smallest definition.
		else {
				var bestPackageDifference = lineItem.quantityRemaining - bestPackageDetails.qty;
				var currPackageDifference = currPackageDetails.qty - lineItem.quantityRemaining;

				if (currPackageDifference <= bestPackageDifference) {
					bestPackageDetails = currPackageDetails;
				}
				// Else the bestPackageDifference is less.  No need to update the various "best" values.
				// We'll stop evaluating for the best Package Definition now even if there are more, because they cannot be a better match.
				j = packageRules.length;
			}
	}
	return bestPackageDetails;
}
//added additional logic to handle carton index issues when carton is deleted that was not the last carton in the list
var scheduledScriptId = 'customscript_sps_autopack_ss';
var scheduledDeploymentId = 'customdeploy_sps_autopack_ss';

var scheduled = new Scheduled(scheduledScriptId, scheduledDeploymentId, autoPack);

scheduled.requestParams = {
	stID: 'param1'
};

module.exports.suitelet = function (request, response) {
	scheduled.suitelet(request, response);
};
module.exports.scheduledScript = function () {
	scheduled.scheduledScript();
};
module.exports.spsapiAutoPack = function (params) {
	return scheduled.spsapi(params);
};

module.exports.autoPack = module.exports.suitelet;

},{"../../Common/scripts/SuiteLimiter.js":1,"../../Common/scripts/scheduled.js":2}]},{},[3])(3)
});(function(){for(var attr in window.SPS) if(window.SPS.hasOwnProperty(attr)) this[attr] = window.SPS[attr] })()
