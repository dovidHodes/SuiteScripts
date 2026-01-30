/**
 * Node.js test script to call NetSuite RESTlet
 * Run with: node test-netsuite-call.js
 * 
 * Requires: npm install oauth-1.0a
 */

const OAuth = require("oauth-1.0a");
const crypto = require("crypto");

// Credentials for NetSuite account 8227984
const CONSUMER_KEY = "323bc4d5bbdd45529cd0ed52d7b54bf25ef92ad1e591ae6706e296afaad537d2";
const CONSUMER_SECRET = "9d800546724aa15ad8531c1bde2ec54d2320b81b76b8a9b9be060c564ff071ac";
const TOKEN_ID = "19f490a2dfdc621cb3543b1597f751a6dac4f29444e169b91549e588e45d1a0e";
const TOKEN_SECRET = "e3e3638639121c0b96c24c0865570280d306e7e199a0701f14f0a02688e41dc0";
const ACCOUNT_ID = "8227984";

// RESTlet URL
const RESTLET_BASE_URL = "https://8227984.restlets.api.netsuite.com/app/site/hosting/restlet.nl";

const callNetSuiteRestlet = async () => {
    console.log("=== NetSuite RESTlet Test ===\n");

    const oauth = OAuth({
        consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
        signature_method: "HMAC-SHA256",
        hash_function(base_string, key) {
            return crypto.createHmac("sha256", key).update(base_string).digest("base64");
        },
    });

    // Request data - query params go in data object
    const request_data = {
        url: RESTLET_BASE_URL,
        method: "GET",
        data: { script: "2092", deploy: "1" },
    };

    // Generate OAuth authorization
    const authData = oauth.authorize(request_data, { key: TOKEN_ID, secret: TOKEN_SECRET });
    
    // Build final URL with query params
    const queryParams = new URLSearchParams(request_data.data).toString();
    const finalUrl = `${request_data.url}?${queryParams}`;

    // Build auth header with realm appended
    const authHeader = {
        ...oauth.toHeader(authData),
        "Authorization": oauth.toHeader(authData)["Authorization"] + `, realm="${ACCOUNT_ID}"`,
    };

    console.log("URL:", finalUrl);
    console.log("\nAuthorization Header:", authHeader["Authorization"]);
    console.log("\n--- Making request... ---\n");

    try {
        const response = await fetch(finalUrl, {
            method: request_data.method,
            headers: {
                ...authHeader,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        });

        console.log("HTTP Status:", response.status, response.statusText);

        const text = await response.text();
        console.log("\nRaw Response:", text);

        try {
            const data = JSON.parse(text);
            console.log("\nParsed JSON:", JSON.stringify(data, null, 2));
            return { success: true, status: response.status, data };
        } catch (parseError) {
            console.error("\nJSON Parse Error - response is not valid JSON");
            return { success: false, status: response.status, raw: text };
        }
    } catch (error) {
        console.error("\nFetch Error:", error.message);
        return { success: false, error: error.message };
    }
};

// Run the test
callNetSuiteRestlet()
    .then(result => {
        console.log("\n=== Test Complete ===");
        console.log("Result:", result.success ? "SUCCESS" : "FAILED");
    })
    .catch(err => {
        console.error("Unexpected error:", err);
    });
