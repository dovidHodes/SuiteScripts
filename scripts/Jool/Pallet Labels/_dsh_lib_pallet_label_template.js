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
'                        .label-container {\n' +
'                border: 0;\n' +
'                padding: 0;\n' +
'                margin: 0;\n' +
'                min-height: 5.5in;\n' +
'                box-sizing: border-box;\n' +
'            }\n' +
'            \n' +
'            .two-row-table {\n' +
'                width: 100%;\n' +
'                border-collapse: collapse;\n' +
'                margin: 0;\n' +
'                table-layout: fixed;\n' +
'            }\n' +
'            \n' +
'            .two-row-table td {\n' +
'                width: 50%;\n' +
'                vertical-align: top;\n' +
'                padding: 1px 2px;\n' +
'                border-right: 2px solid #000000;\n' +
'                border-bottom: 2px solid #000000;\n' +
'                word-wrap: break-word;\n' +
'                overflow-wrap: break-word;\n' +
'            }\n' +
'            \n' +
'            .two-row-table tr:first-child td {\n' +
'                border-top: 0;\n' +
'                min-height: 80px;\n' +
'                padding: 2px 2px 0 5px;\n' +
'            }\n' +
'            \n' +
'            .two-row-table tr:last-child td {\n' +
'                border-bottom: 2px solid #000000;\n' +
'                min-height: 80px;\n' +
'                padding: 1px 2px;\n' +
'            }\n' +
'            \n' +
'            .two-row-table td:first-child {\n' +
'                border-left: 0;\n' +
'            }\n' +
'            \n' +
'            .two-row-table td:last-child {\n' +
'                border-right: 0;\n' +
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
'                font-size: 8pt;\n' +
'                line-height: 1.8;\n' +
'                padding: 0;\n' +
'                margin: 0;\n' +
'                margin-top: 0;\n' +
'                margin-bottom: 0;\n' +
'                padding-top: 0;\n' +
'                padding-bottom: 0;\n' +
'                word-wrap: break-word;\n' +
'                overflow-wrap: break-word;\n' +
'                overflow: visible;\n' +
'                white-space: normal;\n' +
'            }\n' +
'            \n' +
'            .address-line {\n' +
'                display: inline;\n' +
'                margin: 0;\n' +
'                line-height: normal;\n' +
'                font-size: 8pt;\n' +
'            }\n' +
'            \n' +
'            .full-width-box {\n' +
'                width: 100%;\n' +
'                border-top: 0;\n' +
'                border-left: 0;\n' +
'                border-right: 0;\n' +
'                border-bottom: 2px solid #000000;\n' +
'                min-height: 30px;\n' +
'                box-sizing: border-box;\n' +
'            }\n' +
'            \n' +
'            .carrier-info {\n' +
'                font-size: 9pt;\n' +
'                padding: 0;\n' +
'                word-wrap: break-word;\n' +
'                overflow-wrap: break-word;\n' +
'                color: #000000;\n' +
'            }\n' +
  '            \n' +
  '            .carrier-label {\n' +
  '                font-weight: bold;\n' +
  '            }\n' +
  '            \n' +
'            .po-area {\n' +
'                text-align: left;\n' +
'                padding: 3px;\n' +
'                vertical-align: top;\n' +
'                font-size: 9pt;\n' +
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
  '    <body header="nlheader" header-height="0pt" footer="nlfooter" footer-height="0pt" padding="0" size="4in 6in">\n' +
  '        \n' +
  '        <div class="label-container">\n' +
  '            \n' +
'            <!-- Top Section: 4 boxes in 2 rows - SHIP FROM, SHIP TO, PO, CARRIER (merged with outer border) -->\n' +
'            <table class="two-row-table" style="margin: 0; border-top: 0; border-left: 0; border-right: 0; border-bottom: 0;">\n' +
'                <tr>\n' +
'                    <td>\n' +
'                        <strong style="font-size: 11pt; margin-bottom: 0; margin-top: 0; display: block;">SHIP FROM:</strong>\n' +
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
'                    </td>\n' +
'                    <td>\n' +
'                        <strong style="font-size: 11pt; margin-bottom: 0; margin-top: 0; display: block;">SHIP TO:</strong>\n' +
'                        <div class="address-text">\n' +
'                            <#if record.custrecord_parent_if.shipcompany?has_content><span class="address-line">${record.custrecord_parent_if.shipcompany!""}</span><br/></#if>\n' +
'                            <#if record.custrecord_parent_if.shipaddr1?has_content><span class="address-line">${record.custrecord_parent_if.shipaddr1!""}</span><br/></#if>\n' +
'                            <#if record.custrecord_parent_if.shipaddr2?has_content><span class="address-line">${record.custrecord_parent_if.shipaddr2!""}</span><br/></#if>\n' +
'                            <#if record.custrecord_parent_if.shipcity?has_content || record.custrecord_parent_if.shipstate?has_content || record.custrecord_parent_if.shipzip?has_content><span class="address-line">${record.custrecord_parent_if.shipcity!""}<#if record.custrecord_parent_if.shipstate?has_content>, ${record.custrecord_parent_if.shipstate!""}</#if><#if record.custrecord_parent_if.shipzip?has_content> ${record.custrecord_parent_if.shipzip!""}</#if></span><br/></#if>\n' +
'                            <#if record.custrecord_parent_if.shipcountry?has_content><#assign countryText = record.custrecord_parent_if.shipcountry!"" /><span class="address-line"><#if countryText == "US">United States<#else>${countryText}</#if></span></#if>\n' +
'                        </div>\n' +
'                    </td>\n' +
'                </tr>\n' +
'                <tr>\n' +
'                    <td>\n' +
'                        <#if record.custrecord_parent_if.custbody_sps_billofladingnumber?has_content || record.custrecord_parent_if.custbody_sps_carrierpronumber?has_content || record.custrecord_parent_if.custbody_amazon_arn?has_content>\n' +
'                        <div class="section-header" style="padding-left: 5px;">CARRIER:</div>\n' +
'                        <div class="carrier-info" style="padding-left: 5px;">\n' +
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
'                    </td>\n' +
'                    <td>\n' +
'                        <strong style="font-size: 8pt; font-weight: normal; margin-bottom: 0; margin-top: 0; display: block; color: #000000; padding-left: 5px;">PO:</strong>\n' +
'                        <div class="carrier-info" style="display: flex; align-items: center; justify-content: center; padding: 0;">\n' +
'                            <#if record.custrecord_parent_if.custbody_sps_ponum_from_salesorder?has_content>\n' +
'                                <div style="text-align: center; max-width: 66px; width: 66px; overflow: hidden;">\n' +
'                                    <barcode codetype="code128" showtext="true" height="40" value="${record.custrecord_parent_if.custbody_sps_ponum_from_salesorder!""}"/>\n' +
'                                </div>\n' +
'                            <#else>\n' +
'                                <span style="color: #000000;">&nbsp;</span>\n' +
'                            </#if>\n' +
'                        </div>\n' +
'                    </td>\n' +
'                </tr>\n' +
'                        </table>\n' +
'            \n' +
'            <!-- New Full-Width Box -->\n' +
'            <div class="full-width-box">\n' +
'                <table style="width: 100%; border-collapse: collapse; padding: 5px;">\n' +
'                    <tr>\n' +
'                        <td style="padding: 5px; text-align: left; font-size: 11pt; width: 50%;">Pallet ${record.custrecord_pallet_index!1} of ${record.custrecord_total_pallet_count!1}</td>\n' +
'                        <td style="padding: 5px; text-align: right; font-size: 11pt; width: 50%;">Cartons on pallet: ${record.cartonCount!0}</td>\n' +
'                    </tr>\n' +
'                </table>\n' +
'            </div>\n' +
'            \n' +
'            <!-- New Full-Width Box 2 (Twice as tall) -->\n' +
'            <div class="full-width-box" style="min-height: 80px; padding-left: 60px; padding-right: 60px;">\n' +
'                <table style="width: 100%; border-collapse: collapse; padding: 5px;">\n' +
'                    <tr>\n' +
'                        <td style="padding: 5px; text-align: center; vertical-align: middle; font-size: 24pt; font-weight: normal; color: #000000;">${record.skuDisplayText!""}</td>\n' +
'                    </tr>\n' +
'                </table>\n' +
'            </div>\n' +
'            \n' +
'            <!-- New Full-Width Box 3 (SSCC Barcode) -->\n' +
'            <div class="full-width-box" style="min-height: 80px; border-bottom: 0; padding-left: 30px; padding-right: 30px;">\n' +
'                <table style="width: 100%; border-collapse: collapse; padding: 5px;">\n' +
'                    <tr>\n' +
'                        <td style="padding: 5px; text-align: center; vertical-align: top;">\n' +
'                            <div style="text-align: center; font-size: 9pt; font-weight: bold; color: #000000; margin-bottom: 5px;">PALLET SSCC</div>\n' +
'                            <div class="carrier-info" style="display: flex; align-items: center; justify-content: center; padding: 0;">\n' +
'                                <div style="text-align: center; overflow: hidden;">\n' +
'                                    <barcode codetype="code128" showtext="true" height="60" value="(00) 123456789012345678"/>\n' +
'                                </div>\n' +
'                            </div>\n' +
'                        </td>\n' +
'                    </tr>\n' +
'                </table>\n' +
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