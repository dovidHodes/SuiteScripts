import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { createHmac } from "node:crypto";

const NETSUITE_RESTLET_URL = Deno.env.get('NETSUITE_RESTLET_URL');
const NETSUITE_ACCOUNT_ID = Deno.env.get('NETSUITE_ACCOUNT_ID');
const CONSUMER_KEY = Deno.env.get('NETSUITE_CONSUMER_KEY');
const CONSUMER_SECRET = Deno.env.get('NETSUITE_CONSUMER_SECRET');
const TOKEN_ID = Deno.env.get('NETSUITE_TOKEN_ID');
const TOKEN_SECRET = Deno.env.get('NETSUITE_TOKEN_SECRET');

function generateOAuthHeader(url, method) {
    if (!url || !CONSUMER_KEY || !TOKEN_ID || !CONSUMER_SECRET || !TOKEN_SECRET || !NETSUITE_ACCOUNT_ID) {
        throw new Error('Missing required OAuth parameters');
    }
    
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    
    // Parse URL to separate base URL and query parameters
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
    
    // Collect all OAuth parameters
    const oauthParams = {
        oauth_consumer_key: CONSUMER_KEY,
        oauth_token: TOKEN_ID,
        oauth_signature_method: 'HMAC-SHA256',
        oauth_timestamp: timestamp,
        oauth_nonce: nonce,
        oauth_version: '1.0'
    };

    // Combine OAuth params with query params for signature
    const allParams = { ...oauthParams };
    urlObj.searchParams.forEach((value, key) => {
        allParams[key] = value;
    });

    // Create signature base string (realm is NOT included in signature)
    const paramString = Object.keys(allParams)
        .sort()
        .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(allParams[key])}`)
        .join('&');

    const baseString = `${method}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;
    const signingKey = `${encodeURIComponent(CONSUMER_SECRET)}&${encodeURIComponent(TOKEN_SECRET)}`;
    const signature = createHmac('sha256', signingKey).update(baseString).digest('base64');

    // Build header WITHOUT realm first, then add realm at the end (like working code)
    const authHeader = Object.keys(oauthParams)
        .map(key => `${key}="${encodeURIComponent(oauthParams[key])}"`)
        .join(', ') +
        `, oauth_signature="${encodeURIComponent(signature)}"`;
    
    // Add realm at the END (matching working RESTlet.js pattern)
    return `OAuth ${authHeader}, realm="${NETSUITE_ACCOUNT_ID}"`;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Validate environment variables
        if (!NETSUITE_RESTLET_URL || !NETSUITE_ACCOUNT_ID || !CONSUMER_KEY || 
            !CONSUMER_SECRET || !TOKEN_ID || !TOKEN_SECRET) {
            return Response.json({ 
                error: 'Missing required environment variables',
                missing: {
                    NETSUITE_RESTLET_URL: !NETSUITE_RESTLET_URL,
                    NETSUITE_ACCOUNT_ID: !NETSUITE_ACCOUNT_ID,
                    CONSUMER_KEY: !CONSUMER_KEY,
                    CONSUMER_SECRET: !CONSUMER_SECRET,
                    TOKEN_ID: !TOKEN_ID,
                    TOKEN_SECRET: !TOKEN_SECRET,
                }
            }, { status: 500 });
        }

        // Fetch data from NetSuite restlet with OAuth
        let authHeader;
        try {
            authHeader = generateOAuthHeader(NETSUITE_RESTLET_URL, 'GET');
        } catch (oauthError) {
            return Response.json({ 
                error: 'Failed to generate OAuth header',
                details: oauthError.message,
                stack: oauthError.stack
            }, { status: 500 });
        }
        
        console.log('Auth Header:', authHeader);
        console.log('URL:', NETSUITE_RESTLET_URL);
        
        let response;
        try {
            response = await fetch(NETSUITE_RESTLET_URL, {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json'
                }
            });
        } catch (fetchError) {
            return Response.json({ 
                error: 'Failed to fetch from NetSuite',
                details: fetchError.message,
                stack: fetchError.stack
            }, { status: 500 });
        }
        
        const responseText = await response.text();
        console.log('Response status:', response.status);
        console.log('Response body:', responseText);
        
        let netsuiteData;
        try {
            netsuiteData = JSON.parse(responseText);
        } catch (e) {
            return Response.json({ 
                error: 'Failed to parse NetSuite response',
                details: responseText
            }, { status: 500 });
        }

        // Check if response is an error (matching webscraping RESTlet error handling pattern)
        if (!response.ok) {
            return Response.json({ 
                error: 'NetSuite API error',
                details: netsuiteData,
                status: response.status
            }, { status: 500 });
        }

        // Check if NetSuite RESTlet returned an error (like webscraping RESTlet does)
        if (netsuiteData.success === false || netsuiteData.error) {
            return Response.json({ 
                error: 'NetSuite RESTlet error',
                details: netsuiteData.error || netsuiteData,
            }, { status: 500 });
        }

        // Extract line items from NetSuite response structure
        // The RESTlet returns: { success: true, count: number, lineItems: [...] }
        const lineItems = netsuiteData.lineItems || [];
        
        if (!Array.isArray(lineItems)) {
            return Response.json({ 
                error: 'Invalid NetSuite response format',
                details: 'Expected lineItems array',
                received: netsuiteData
            }, { status: 500 });
        }

        // Process and group data by date and SKU
        const groupedData = {};

        // Process each line item directly (they already have all fields we need)
        lineItems.forEach((item) => {
            const trandate = item.trandate;
            const poNumber = item.otherrefnum;
            const sku = item.custcol_sps_vendorpartnumber;
            const confirmedQty = parseFloat(item.quantity || 0);
            const originalQty = parseFloat(item.custcol_orig_qty || 0);

            if (!sku || !trandate) return;

            // Create date group if it doesn't exist
            if (!groupedData[trandate]) {
                groupedData[trandate] = {};
            }

            // Create SKU entry if it doesn't exist
            if (!groupedData[trandate][sku]) {
                groupedData[trandate][sku] = {
                    sku,
                    poNumbers: new Set(),
                    totalOrderQty: 0,
                    confirmedQty: 0,
                };
            }

            // Aggregate data
            groupedData[trandate][sku].poNumbers.add(poNumber);
            groupedData[trandate][sku].totalOrderQty += originalQty;
            groupedData[trandate][sku].confirmedQty += confirmedQty;
        });

        // Convert to array format with comma-separated PO numbers
        const result = [];
        
        for (const [date, skus] of Object.entries(groupedData)) {
            for (const skuData of Object.values(skus)) {
                result.push({
                    week_date: date,
                    sku: skuData.sku,
                    po_numbers: Array.from(skuData.poNumbers).join(', '),
                    actual_ordered_qty: skuData.totalOrderQty,
                    confirmed_qty: skuData.confirmedQty,
                });
            }
        }

        // Save to po_actuals entity
        if (result.length > 0) {
            await base44.asServiceRole.entities.po_actuals.bulkCreate(
                result.map(r => ({
                    week_date: r.week_date,
                    sku: r.sku,
                    actual_ordered_qty: r.actual_ordered_qty,
                    notes: `POs: ${r.po_numbers} | Confirmed: ${r.confirmed_qty}`,
                }))
            );
        }

        return Response.json({ 
            success: true,
            processed: result.length,
            data: result,
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return Response.json({ 
            error: error instanceof Error ? error.message : String(error),
            details: error instanceof Error ? error.stack : JSON.stringify(error),
        }, { status: 500 });
    }
});
