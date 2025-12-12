/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Pallet Label Template Library - Contains the XML template string for pallet label generation
 * 
 * This library contains the FreeMarker/XML template used to generate pallet label PDFs.
 * The template is stored as a string to bypass NetSuite's Advanced PDF/HTML Template validation.
 */

define([], function () {
  
    /**
     * Get the pallet label template XML string
     * @returns {string} The complete XML template string
     */
    function getPalletLabelTemplate() {
      return '<?xml version="1.0"?>\n' +
  '<!DOCTYPE pdf PUBLIC "-//big.faceless.org//report" "report-1.1.dtd">\n' +
  '<pdf>\n' +
  '    <#assign record = JSON.record!{} />\n' +
  '    <head>\n' +
  '        <link name="NotoSans" type="font" subtype="truetype" src="${nsfont.NotoSans_Regular}" src-bold="${nsfont.NotoSans_Bold}" src-italic="${nsfont.NotoSans_Italic}" src-bolditalic="${nsfont.NotoSans_BoldItalic}" bytes="2" />\n' +
  '        <#if .locale=="zh_CN">\n' +
  '            <link name="NotoSansCJKsc" type="font" subtype="opentype" src="${nsfont.NotoSansCJKsc_Regular}" src-bold="${nsfont.NotoSansCJKsc_Bold}" bytes="2" />\n' +
  '        <#elseif .locale=="zh_TW">\n' +
  '            <link name="NotoSansCJKtc" type="font" subtype="opentype" src="${nsfont.NotoSansCJKtc_Regular}" src-bold="${nsfont.NotoSansCJKtc_Bold}" bytes="2" />\n' +
  '        <#elseif .locale=="ja_JP">\n' +
  '            <link name="NotoSansCJKjp" type="font" subtype="opentype" src="${nsfont.NotoSansCJKjp_Regular}" src-bold="${nsfont.NotoSansCJKjp_Bold}" bytes="2" />\n' +
  '        <#elseif .locale=="ko_KR">\n' +
  '            <link name="NotoSansCJKkr" type="font" subtype="opentype" src="${nsfont.NotoSansCJKkr_Regular}" src-bold="${nsfont.NotoSansCJKkr_Bold}" bytes="2" />\n' +
  '        <#elseif .locale=="th_TH">\n' +
  '            <link name="NotoSansThai" type="font" subtype="opentype" src="${nsfont.NotoSansThai_Regular}" src-bold="${nsfont.NotoSansThai_Bold}" bytes="2" />\n' +
  '        </#if>\n' +
  '\n' +
  '        <style type="text/css">\n' +
  '            body {\n' +
  '                font-family: sans-serif;\n' +
  '                font-size: 8pt;\n' +
  '            }\n' +
  '            \n' +
'            .label-container {\n' +
'                border: 2px solid #000000;\n' +
'                border-bottom: 2px solid #000000;\n' +
'                padding: 0;\n' +
'                margin: 0;\n' +
'                min-height: 5.5in;\n' +
'                box-sizing: border-box;\n' +
'            }\n' +
  '            \n' +
'            .four-box-container {\n' +
'                width: 100%;\n' +
'                margin: 0;\n' +
'                padding: 0;\n' +
'            }\n' +
'            \n' +
'            .box-row {\n' +
'                width: 100%;\n' +
'                display: block;\n' +
'                margin: 0;\n' +
'                padding: 0;\n' +
'                overflow: hidden;\n' +
'                clear: both;\n' +
'            }\n' +
'            \n' +
'            .address-box {\n' +
'                width: 50%;\n' +
'                float: left;\n' +
'                padding: 6px;\n' +
'                border-top: 0;\n' +
'                border-left: 0;\n' +
'                border-right: 2px solid #000000;\n' +
'                border-bottom: 2px solid #000000;\n' +
'                box-sizing: border-box;\n' +
'                word-wrap: break-word;\n' +
'                overflow-wrap: break-word;\n' +
'                vertical-align: top;\n' +
'                min-height: 80px;\n' +
'                background-color: #ffffff;\n' +
'            }\n' +
'            \n' +
'            .address-box:first-child {\n' +
'                border-left: 0;\n' +
'            }\n' +
'            \n' +
'            .address-box:last-child {\n' +
'                border-right: 0;\n' +
'            }\n' +
'            \n' +
'            .box-row:last-child .address-box {\n' +
'                border-bottom: 2px solid #000000;\n' +
'            }\n' +
  '            \n' +
'            .section-header {\n' +
'                font-weight: bold;\n' +
'                font-size: 8pt;\n' +
'                background-color: transparent;\n' +
'                color: #000000;\n' +
'                padding: 3px;\n' +
'                text-align: left;\n' +
'            }\n' +
  '            \n' +
'            .address-text {\n' +
'                font-size: 7pt;\n' +
'                line-height: 1.8;\n' +
'                padding: 0;\n' +
'                margin: 0;\n' +
'                word-wrap: break-word;\n' +
'                overflow-wrap: break-word;\n' +
'                overflow: visible;\n' +
'            }\n' +
'            \n' +
'            .address-line {\n' +
'                display: block;\n' +
'                margin: 3px 0;\n' +
'                line-height: 1.3;\n' +
'                font-size: 7pt;\n' +
'            }\n' +
  '            \n' +
'            .carrier-info {\n' +
'                font-size: 7pt;\n' +
'                padding: 3px;\n' +
'                word-wrap: break-word;\n' +
'                overflow-wrap: break-word;\n' +
'            }\n' +
  '            \n' +
  '            .carrier-label {\n' +
  '                font-weight: bold;\n' +
  '            }\n' +
  '            \n' +
'            .po-area {\n' +
'                text-align: center;\n' +
'                padding: 5px;\n' +
'                vertical-align: middle;\n' +
'            }\n' +
'            \n' +
'            .po-text {\n' +
'                font-size: 9pt;\n' +
'                font-weight: bold;\n' +
'                margin-top: 3px;\n' +
'            }\n' +
  '            \n' +
  '            .pallet-info {\n' +
  '                font-size: 9pt;\n' +
  '                padding: 5px;\n' +
  '                text-align: center;\n' +
  '            }\n' +
  '            \n' +
  '            .asin-section {\n' +
  '                text-align: center;\n' +
  '                padding: 8px 0;\n' +
  '                border-top: 1px solid #000000;\n' +
  '                border-bottom: 1px solid #000000;\n' +
  '            }\n' +
  '            \n' +
  '            .asin-text {\n' +
  '                font-size: 14pt;\n' +
  '                font-weight: bold;\n' +
  '                margin: 5px 0;\n' +
  '                letter-spacing: 1px;\n' +
  '            }\n' +
  '            \n' +
  '            .expiration-date {\n' +
  '                font-size: 8pt;\n' +
  '                text-align: center;\n' +
  '                padding: 5px 0;\n' +
  '            }\n' +
  '            \n' +
'            .sscc-section {\n' +
'                text-align: center;\n' +
'                padding: 15px;\n' +
'                border: 2px solid #000000;\n' +
'                border-top: 2px solid #000000;\n' +
'                border-left: 2px solid #000000;\n' +
'                border-right: 2px solid #000000;\n' +
'                border-bottom: 2px solid #000000;\n' +
'                margin-top: 8px;\n' +
'                margin-bottom: 0;\n' +
'                min-height: 100px;\n' +
'                background-color: #ffffff;\n' +
'            }\n' +
'            \n' +
'            .sscc-label {\n' +
'                font-size: 9pt;\n' +
'                font-weight: bold;\n' +
'                margin-bottom: 8px;\n' +
'            }\n' +
'            \n' +
'            .sscc-text {\n' +
'                font-size: 10pt;\n' +
'                margin-top: 5px;\n' +
'                font-family: monospace;\n' +
'                font-weight: bold;\n' +
'            }\n' +
  '        </style>\n' +
  '    </head>\n' +
  '\n' +
  '    <body header="nlheader" header-height="0pt" footer="nlfooter" footer-height="0pt" padding="0.1in" size="4in 6in">\n' +
  '        \n' +
  '        <div class="label-container">\n' +
  '            \n' +
'            <!-- Top Section: 4 boxes in 2 rows - SHIP FROM, SHIP TO, PO, CARRIER (merged with outer border) -->\n' +
'            <div class="four-box-container">\n' +
'                <!-- Row 1 -->\n' +
'                <div class="box-row">\n' +
'                    <div class="address-box">\n' +
'                        <strong style="font-size: 8pt; font-weight: bold; margin-bottom: 2px; margin-top: 0; display: block;">SHIP FROM:</strong>\n' +
'                        <div class="address-text">\n' +
'                            <#if record.custrecord_parent_if.custbody_ship_from_location?has_content>\n' +
'                                <#if record.custrecord_parent_if.custbody_ship_from_location.addressLines?has_content>\n' +
'                                    <#list record.custrecord_parent_if.custbody_ship_from_location.addressLines as addressLine>\n' +
'                                        <#if addressLine?trim?has_content>\n' +
'                                            <#assign lineText = addressLine?trim />\n' +
'                                            <#assign lineText = lineText?replace("\\r\\n", "\n") />\n' +
'                                            <#assign lineText = lineText?replace("\\r", "\n") />\n' +
'                                            <#assign subLines = lineText?split("\n") />\n' +
'                                            <#list subLines as subLine>\n' +
'                                                <#if subLine?trim?has_content><span class="address-line">${subLine?trim}</span><br/></#if>\n' +
'                                            </#list>\n' +
'                                        </#if>\n' +
'                                    </#list>\n' +
'                                <#elseif record.custrecord_parent_if.custbody_ship_from_location.mainaddress_text?has_content>\n' +
'                                    <#assign addressText = record.custrecord_parent_if.custbody_ship_from_location.mainaddress_text!"" />\n' +
'                                    <#assign addressText = addressText?replace("<br/>", "\n") />\n' +
'                                    <#assign addressText = addressText?replace("<br />", "\n") />\n' +
'                                    <#assign addressText = addressText?replace("<br>", "\n") />\n' +
'                                    <#assign addressText = addressText?replace("\\r\\n", "\n") />\n' +
'                                    <#assign addressText = addressText?replace("\\r", "\n") />\n' +
'                                    <#assign addressLines = addressText?split("\n") />\n' +
'                                    <#list addressLines as line>\n' +
'                                        <#if line?trim?has_content><span class="address-line">${line?trim}</span><br/></#if>\n' +
'                                    </#list>\n' +
'                                </#if>\n' +
'                            </#if>\n' +
'                        </div>\n' +
'                    </div>\n' +
'                    <div class="address-box">\n' +
'                        <strong style="font-size: 8pt; margin-bottom: 2px; margin-top: 0; display: block;">SHIP TO:</strong>\n' +
'                        <div class="address-text">\n' +
'                            <!-- Ship To address hardcoded to blank -->\n' +
'                        </div>\n' +
'                    </div>\n' +
'                </div>\n' +
'                <!-- Row 2 -->\n' +
'                <div class="box-row">\n' +
'                    <div class="address-box">\n' +
'                        <div class="section-header">PO:</div>\n' +
'                        <div class="po-area">\n' +
'                            <#if record.custrecord_parent_if.custbody_sps_ponum_from_salesorder?has_content>\n' +
'                                <div class="po-text">${record.custrecord_parent_if.custbody_sps_ponum_from_salesorder!""}</div>\n' +
'                            </#if>\n' +
'                        </div>\n' +
'                    </div>\n' +
'                    <div class="address-box">\n' +
'                        <#if record.custrecord_parent_if.custbody_sps_billofladingnumber?has_content || record.custrecord_parent_if.custbody_sps_carrierpronumber?has_content || record.custrecord_parent_if.custbody_amazon_arn?has_content>\n' +
'                        <div class="section-header">CARRIER:</div>\n' +
'                        <div class="carrier-info">\n' +
'                            <#if record.custrecord_parent_if.custbody_sps_billofladingnumber?has_content>\n' +
'                                <span class="carrier-label">BOL #:</span> ${record.custrecord_parent_if.custbody_sps_billofladingnumber!""}<br/>\n' +
'                            </#if>\n' +
'                            <#if record.custrecord_parent_if.custbody_sps_carrierpronumber?has_content>\n' +
'                                <span class="carrier-label">PRO #:</span> ${record.custrecord_parent_if.custbody_sps_carrierpronumber!""}<br/>\n' +
'                            </#if>\n' +
'                            <#if record.custrecord_parent_if.custbody_amazon_arn?has_content>\n' +
'                                <span class="carrier-label">ARN #:</span> ${record.custrecord_parent_if.custbody_amazon_arn!""}\n' +
'                            </#if>\n' +
'                        </div>\n' +
'                        <#else>\n' +
'                            <div style="padding: 3px;">&nbsp;</div>\n' +
'                        </#if>\n' +
'                    </div>\n' +
'                </div>\n' +
'            </div>\n' +
  '            \n' +
  '            <!-- Third Section: Pallet Count (Centered) -->\n' +
  '            <div class="pallet-info" style="border-top: 1px solid #000000;">\n' +
  '                <#if record.custrecord_total_pallet_count?has_content && record.custrecord_total_pallet_count > 1>\n' +
  '                    <strong>Pallet ${record.custrecord_pallet_index!1} of ${record.custrecord_total_pallet_count!1}</strong>\n' +
  '                <#else>\n' +
  '                    <strong>Pallet ${record.custrecord_pallet_index!1} of ${record.custrecord_total_pallet_count!1}</strong>\n' +
  '                </#if>\n' +
  '            </div>\n' +
  '            \n' +
  '            <!-- Fourth Section: SINGLE ASIN -->\n' +
  '            <div class="asin-section">\n' +
  '                <#if custom?has_content && custom.asin?has_content>\n' +
  '                    <div class="asin-text">SINGLE ASIN - ${custom.asin!""}</div>\n' +
  '                <#elseif record.custrecord_items?has_content>\n' +
  '                    <div class="asin-text">SINGLE ASIN - ${record.custrecord_items!""}</div>\n' +
  '                <#else>\n' +
  '                    <div class="asin-text">SINGLE ASIN</div>\n' +
  '                </#if>\n' +
  '            </div>\n' +
  '            \n' +
  '            <!-- Expiration Date Section -->\n' +
  '            <div class="expiration-date">\n' +
  '                <#if record.custrecord_expiration_date?has_content>\n' +
  '                    Expiration Date: ${record.custrecord_expiration_date!""}\n' +
  '                </#if>\n' +
  '            </div>\n' +
  '            \n' +
'            <!-- Bottom Section: Pallet SSCC -->\n' +
'            <div class="sscc-section">\n' +
'                <div class="sscc-label">Pallet SSCC</div>\n' +
'                <div class="sscc-text">(00) ${record.id!""}</div>\n' +
'            </div>\n' +
  '            \n' +
  '        </div>\n' +
  '        \n' +
  '    </body>\n' +
  '</pdf>';
    }
    
    return {
      getPalletLabelTemplate: getPalletLabelTemplate
    };
  });