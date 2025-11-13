/**
 * Module Description
 * 
 * Version    Date            Author           Remarks
 * 1.00       02 Nov 2014     sprintz
 *
 */

/**
 * @param {nlobjRequest} request Request object
 * @param {nlobjResponse} response Response object
 * @returns {Void} Any output is written via response object
 */
function labelDownload(request, response){	
	
	/*
	//var url = 'https://stage.label.spsc.io/labels/';
	var url = 'https://label.spsc.io/labels/';
	var postdata = null;
	var headers = {'Authorization': 'Token aM-hUATN5QHRkV5i-kSFAA9SU9ZskoIV9GyRrC83eop57-crqC2dbMbKrqtvZg6dy2JSopK8v-SKnCZqlHqVy2BZKruKUmcipLyiigxAVnG01m_taIEnFifKL46TuiGG88kp6LT3rQi4C1U28NWjPAWbK49dJPVH',
					'Content-Type': 'application/json',
					'Accept': 'application/json'};
	var httpMethod = 'GET';
	var spsresponse = nlapiRequestURL(url, postdata, headers, httpMethod);
	*/
	
	
	//var baseurl = 'https://stage.label.spsc.io/labels/';
	var baseurl = 'https://label.spsc.io/labels/';
	
	
	
	var token = request.getParameter('custscript_sps_token');
	var labelUID = request.getParameter('custscript_uid');
	var sample = 'T';
	
	//var token = 'aM-hUATN5QGYxY-JS4mfSffFFyNocIw-oDBNRB20tE2GU68bSg-n9D_ahM1pmzUXy2JSopK8v-SKnCZqlHqVy2BZKruKUmci_fiKiYLeWEkyrbiX_DUBoyRv_zCTtdB988kp6LT3rQi4C1U28NWjPEmYjbXgl5dI';
	//var labelUID = '3017';
	var sampleurl = baseurl + labelUID + '/sample/';
			
	var sampleheaders = {'Authorization': 'Token ' + token,
			'Content-Type': 'application/json',
			'Accept': 'application/xml'};
	var samplehttpMethod = 'GET';
	var spsresponse = nlapiRequestURL(sampleurl, null, sampleheaders, samplehttpMethod);
		
	var stCode = spsresponse.getCode();
	var stBody = spsresponse.getBody();
	nlapiLogExecution('ERROR', 'stCode', stCode);
	nlapiLogExecution('ERROR', 'stBody', stBody);
	var headers = spsresponse.getAllHeaders();
	var output = '';
	output += 'Code: ' + stCode + '\n\n';
	for (var i in headers) {
		output += i + ': '+headers[i]+ ': '+spsresponse.getHeader(headers[i])+'\n';
	}
	
	output += '\n\n';
	
	output += 'Body: ' + stBody;
	
	output += '\n\n';
	
	var pdfurl = baseurl + labelUID + '/pdf/';
	var postdata = stBody;
	var pdfheaders = {'Authorization': 'Token ' + token,
			'Content-type': 'application/xml',
			'X-Force-Encoding': 'base64',
			'Accept': 'text/pdf'
			};
	var pdfhttpMethod = 'POST';
	var pdfresponse = nlapiRequestURL(pdfurl, postdata, pdfheaders, pdfhttpMethod);
	
	var pdfCode = pdfresponse.getCode();
	var pdfBody = pdfresponse.getBody();
	nlapiLogExecution('ERROR', 'pdfCode', pdfCode);
	nlapiLogExecution('ERROR', 'pdfBody', pdfBody);
	var pdfheaders = pdfresponse.getAllHeaders();
	output += 'Code: ' + pdfCode + '\n\n';
	for (var i in pdfheaders) {
		output += i + ': '+pdfheaders[i]+ ': '+pdfresponse.getHeader(pdfheaders[i])+'\n';
	}
	
	output += '\n\n';
	
	output += 'Body: ' + pdfBody;
	
	
	var pdfFile = nlapiCreateFile('label.pdf','PDF', ''+pdfBody);
	response.setContentType('PDF', 'label.pdf');
	pdfFile.setEncoding('ISO-8859-1');
	response.setEncoding('ISO-8859-1');
    response.write(pdfFile.getValue());
    //response.write(output);
	
	/*
	var xmlHttp = window.XMLHttpRequest;
	var xmlHttp = new XMLHttpRequest();
	var token = 'aM-hUATN5QHRkV5i-kSFAA9SU9ZskoIV9GyRrC83eop57-crqC2dbMbKrqtvZg6dy2JSopK8v-SKnCZqlHqVy2BZKruKUmcipLyiigxAVnG01m_taIEnFifKL46TuiGG88kp6LT3rQi4C1U28NWjPAWbK49dJPVH';

    //xmlHttp.open( "GET", 'https://stage.label.spsc.io/labels/', false );
    xmlHttp.open( "GET", 'https://label.spsc.io/labels/', false );
    xmlHttp.setRequestHeader('Authorization', 'Token ' + token);
    xmlHttp.send();
    nlapiLogExecution('ERROR', 'xmlHttp.responseText', xmlHttp.responseText);
    
    */
}// END FUNC sampleLabelDownload
