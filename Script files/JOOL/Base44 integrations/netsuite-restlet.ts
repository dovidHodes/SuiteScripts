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
    const requestId = crypto.randomUUID().slice(0, 8);
    // Collect debug logs in array so we can return them in the response
    const debugLog: { step: string; data?: unknown; ts: string }[] = [];
    const debug = (step: string, data?: unknown) => {
        const entry = { step, data, ts: new Date().toISOString() };
        debugLog.push(entry);
        console.log(`[${requestId}] [DEBUG] ${step}`, data !== undefined ? JSON.stringify(data, null, 2) : '');
    };

    // Helper to return error with debug log included
    const errorResponse = (error: string, extra: Record<string, unknown> = {}, status = 500) => {
        debug(`RETURNING ERROR: ${error}`);
        return Response.json({ error, ...extra, debugLog, requestId }, { status });
    };

    try {
        debug('syncNetSuitePOs invoked');

        const base44 = createClientFromRequest(req);
        debug('Base44 client created');

        const user = await base44.auth.me();
        debug('auth.me() done', { user: user ? { id: user.id, email: (user as { email?: string }).email } : null });

        if (!user) {
            return errorResponse('Unauthorized', {}, 401);
        }

        // Validate environment variables
        const envStatus = {
            NETSUITE_RESTLET_URL: NETSUITE_RESTLET_URL ? `set (length ${NETSUITE_RESTLET_URL.length})` : 'MISSING',
            NETSUITE_ACCOUNT_ID: NETSUITE_ACCOUNT_ID ? 'set' : 'MISSING',
            CONSUMER_KEY: CONSUMER_KEY ? 'set' : 'MISSING',
            CONSUMER_SECRET: CONSUMER_SECRET ? 'set' : 'MISSING',
            TOKEN_ID: TOKEN_ID ? 'set' : 'MISSING',
            TOKEN_SECRET: TOKEN_SECRET ? 'set' : 'MISSING',
        };
        debug('env check', envStatus);

        if (!NETSUITE_RESTLET_URL || !NETSUITE_ACCOUNT_ID || !CONSUMER_KEY ||
            !CONSUMER_SECRET || !TOKEN_ID || !TOKEN_SECRET) {
            return errorResponse('Missing required environment variables', {
                envStatus,
                missing: {
                    NETSUITE_RESTLET_URL: !NETSUITE_RESTLET_URL,
                    NETSUITE_ACCOUNT_ID: !NETSUITE_ACCOUNT_ID,
                    CONSUMER_KEY: !CONSUMER_KEY,
                    CONSUMER_SECRET: !CONSUMER_SECRET,
                    TOKEN_ID: !TOKEN_ID,
                    TOKEN_SECRET: !TOKEN_SECRET,
                }
            });
        }

        // Fetch data from NetSuite restlet with OAuth
        let authHeader: string;
        try {
            debug('Generating OAuth header...');
            authHeader = generateOAuthHeader(NETSUITE_RESTLET_URL, 'GET');
            debug('OAuth header generated');
        } catch (oauthError) {
            return errorResponse('Failed to generate OAuth header', {
                details: (oauthError as Error).message,
                stack: (oauthError as Error).stack,
                envStatus,
            });
        }

        // Full payload we send to NetSuite (GET = URL + headers only)
        const payloadToNetSuite = {
            method: 'GET',
            url: NETSUITE_RESTLET_URL,
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json',
            },
        };
        debug('PAYLOAD TO NETSUITE', payloadToNetSuite);

        debug('About to fetch NetSuite (request should hit NS now)...');
        let response: Response;
        try {
            response = await fetch(NETSUITE_RESTLET_URL, {
                method: 'GET',
                headers: {
                    'Authorization': authHeader,
                    'Accept': 'application/json'
                }
            });
            debug('NetSuite fetch completed', { status: response.status, ok: response.ok });
        } catch (fetchError) {
            return errorResponse('Failed to fetch from NetSuite', {
                details: (fetchError as Error).message,
                stack: (fetchError as Error).stack,
                payloadToNetSuite,
            });
        }

        const responseText = await response.text();
        debug('NetSuite response received', { 
            status: response.status, 
            bodyPreview: responseText.slice(0, 1000),
            bodyLength: responseText.length 
        });

        let netsuiteData: { success?: boolean; error?: unknown; lineItems?: unknown };
        try {
            netsuiteData = JSON.parse(responseText);
            debug('Parsed NetSuite JSON');
        } catch (e) {
            return errorResponse('Failed to parse NetSuite response', {
                rawPreview: responseText.slice(0, 500),
                payloadToNetSuite,
            });
        }

        // Check if response is an error (matching webscraping RESTlet error handling pattern)
        if (!response.ok) {
            return errorResponse('NetSuite API error', {
                nsStatus: response.status,
                nsResponse: netsuiteData,
                payloadToNetSuite,
            });
        }

        // Check if NetSuite RESTlet returned an error (like webscraping RESTlet does)
        if (netsuiteData.success === false || netsuiteData.error) {
            return errorResponse('NetSuite RESTlet error', {
                nsResponse: netsuiteData,
                payloadToNetSuite,
            });
        }

        // Extract line items from NetSuite response structure
        // The RESTlet returns: { success: true, count: number, lineItems: [...] }
        const lineItems = netsuiteData.lineItems || [];
        debug('lineItems from NS', { count: Array.isArray(lineItems) ? lineItems.length : 0, isArray: Array.isArray(lineItems) });

        if (!Array.isArray(lineItems)) {
            return errorResponse('Invalid NetSuite response format', {
                details: 'Expected lineItems array',
                received: netsuiteData,
            });
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

        debug('Aggregated result', { resultCount: result.length, sample: result[0] });

        // Save to po_actuals entity
        if (result.length > 0) {
            const bulkCreatePayload = result.map(r => ({
                week_date: r.week_date,
                sku: r.sku,
                actual_ordered_qty: r.actual_ordered_qty,
                notes: `POs: ${r.po_numbers} | Confirmed: ${r.confirmed_qty}`,
            }));
            debug('Payload to Base44 po_actuals.bulkCreate', { recordCount: bulkCreatePayload.length, sample: bulkCreatePayload[0] });
            await base44.asServiceRole.entities.po_actuals.bulkCreate(bulkCreatePayload);
            debug('bulkCreate completed');
        } else {
            debug('No records to bulkCreate (result.length === 0)');
        }

        debug('SUCCESS - returning result');
        return Response.json({ 
            success: true,
            processed: result.length,
            data: result,
            debugLog,
            requestId,
        });
    } catch (error) {
        debug('Unexpected error (top-level catch)', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : undefined,
        });
        console.error(`[${requestId}] [DEBUG] Unexpected error:`, error);
        return errorResponse(
            error instanceof Error ? error.message : String(error),
            { stack: error instanceof Error ? error.stack : JSON.stringify(error) }
        );
    }
});
