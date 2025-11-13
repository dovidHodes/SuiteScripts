define(["require", "exports", "N/error", "N/log", "N/file", "N/https", "N/xml", "N/search", "N/config"], function (require, exports, error, log, file, https, xmlMod, search, config) {
    function getLabelArchiveFolderId() {
        var folderId;
        var folderSearchObj = search.create({
            type: 'folder',
            filters: [['name', 'is', 'Label Archives'], 'AND', ['formulatext: {parent}', 'is', 'SPS Commerce']],
            columns: ['numfiles'],
        });
        folderSearchObj.run().each(function (result) {
            folderId = result.id;
            return false;
        });
        if (!folderId) {
            log.error('FOLDER_NOT_FOUND', 'SPS Commerce --> Label Archives');
        }
        folderId = Number(folderId);
        return folderId;
    }
    function setWhetherLabelFileIsAvlWithoutLoginCheck() {
        var companyConfigRec = config.load({ type: config.Type.COMPANY_PREFERENCES });
        return companyConfigRec.getValue({ fieldId: 'custscript_sps_label_file_avl_wo_login' });
    }
    function spsLabelApiRequest(xmlBody, apiToken, labelUid, filename, fileDescription) {
        if (fileDescription === void 0) { fileDescription = 'SPS Label File'; }
        // TODO: figure out how to handle array of IFs or if that is even supported
        var fileId;
        if (!apiToken) {
            throw error.create({ name: 'PDF_GENERATION_ERROR', message: 'No Api Token, contact SPS Support', notifyOff: true });
        }
        if (!labelUid) {
            throw error.create({ name: 'PDF_GENERATION_ERROR', message: 'No Label UID', notifyOff: true });
        }
        if (!filename) {
            throw error.create({ name: 'PDF_GENERATION_ERROR', message: 'No FileName provided', notifyOff: true });
        }
        if (!xmlBody) {
            throw error.create({ name: 'PDF_GENERATION_ERROR', message: 'No XML Data present to be sent to API', notifyOff: true });
        }
        var baseURL = 'https://label.spsc.io/';
        var pdfheaders = { Authorization: "Token " + apiToken, 'Content-type': 'Application/XML', 'X-Force-Encoding': 'base64', Accept: 'text/pdf' };
        var pdfURL = baseURL + "labels/" + labelUid + "/pdf/";
        var pdfResponse = https.post({
            url: pdfURL,
            body: xmlBody,
            headers: pdfheaders,
        });
        var pdfCode = pdfResponse.code;
        var pdfBody = pdfResponse.body;
        log.debug('api code', pdfCode);
        log.debug('api body', pdfBody);
        if (pdfCode !== 200) {
            var responseXml = xmlMod.Parser.fromString({
                text: pdfBody,
            });
            // TODO: figure out how to grab required field list and provide useful error handling
            var respMessage = xmlMod.XPath.select({
                node: responseXml,
                xpath: '//root',
            });
            var respText = respMessage[0].textContent;
            log.error('Label API response is:', respText);
            var startPosition = respText.lastIndexOf('/') + 1;
            var endPosition = respText.lastIndexOf(' is');
            var reqField = respText.substr(startPosition, endPosition - startPosition);
            // TODO: attempt to write message to IF label field
            var missingReq = error.create({ name: 'LABEL_REQUIREMENT_MISSING', message: 'Mandatory field ' + reqField + ' is missing data', notifyOff: true });
            log.error(missingReq.name, missingReq.message);
            throw missingReq;
            //}
        }
        else {
            // Create PDF File, Save File, Attach File, Provide response
            var folderId = getLabelArchiveFolderId();
            var fileName = filename + "_" + Date.now();
            var labelFile = file.create({
                fileType: file.Type.PDF,
                name: fileName + ".pdf",
                folder: folderId,
                description: fileDescription,
                contents: "" + pdfBody,
            });
            // @ts-ignore
            labelFile.encoding = file.Encoding.ISO_8859_1;
            // set whether file is availble without login. Should be false by default
            if (setWhetherLabelFileIsAvlWithoutLoginCheck()) {
                log.debug('SPS Batch Label Feature', "Label File " + labelFile.id + " has available without login checked");
                labelFile.isOnline = true;
            }
            fileId = labelFile.save();
            return { fileId: fileId, labelFile: labelFile };
        }
    }
    return { spsLabelApiRequest: spsLabelApiRequest, getLabelArchiveFolderId: getLabelArchiveFolderId };
});
