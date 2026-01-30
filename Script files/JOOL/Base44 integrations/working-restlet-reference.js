const OAuth = require("oauth-1.0a");
const crypto = require("crypto"); // No need to install separately
const { CONSUMER_KEY, CONSUMER_SECRET, TOKEN_KEY, TOKEN_SECRET } = require('./config');

const fetchListingsByMarketplaceAndDeploymentID = async (marketplace, deployment) => {
    const oauth = OAuth({
        consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
        signature_method: "HMAC-SHA256",
        hash_function(base_string, key) {
            return crypto.createHmac("sha256", key).update(base_string).digest("base64");
        },
    });

    const request_data = {
        url: `https://6448561.restlets.api.netsuite.com/app/site/hosting/restlet.nl`,
        method: "GET",
        data: { script: "2499", deploy: deployment, marketplace: marketplace },
    };

    const authData = oauth.authorize(request_data, { key: TOKEN_KEY, secret: TOKEN_SECRET });
    const queryParams = new URLSearchParams(request_data.data).toString();
    const finalUrl = `${request_data.url}?${queryParams}`;

    const authHeader = {
        ...oauth.toHeader(authData),
        "Authorization": oauth.toHeader(authData)["Authorization"] + `, realm="6448561"`,
    };

    try {
        const response = await fetch(finalUrl, {
            method: request_data.method,
            headers: {
                ...authHeader,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        });

        console.log("\n\nHTTP Status:", response.status, response.statusText, "\n");

        const text = await response.text();
        //console.log("Raw Response:", text, "\n");

        try {
            const data = JSON.parse(text);
            //console.log("Parsed NetSuite Data:", data);
            return { data };
        } catch (error) {
            console.error("JSON Parse Error:", error);
            throw new Error(`Response is not valid JSON. Status: ${response.status}. Raw response: ${text}`);
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        throw error;
    }
};

const updateMarketplaceListingsByID = async (deployment, listingsData) => {
    const oauth = OAuth({
        consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
        signature_method: "HMAC-SHA256",
        hash_function(base_string, key) {
            return crypto.createHmac("sha256", key).update(base_string).digest("base64");
        },
    });

    const request_data = {
        url: `https://6448561.restlets.api.netsuite.com/app/site/hosting/restlet.nl`,
        method: "PUT",
        data: { script: "2499", deploy: deployment }, // Ensure the correct script ID and deployment ID
    };

    const authData = oauth.authorize(request_data, { key: TOKEN_KEY, secret: TOKEN_SECRET });
    const queryParams = new URLSearchParams(request_data.data).toString();
    const finalUrl = `${request_data.url}?${queryParams}`;

    const authHeader = {
        ...oauth.toHeader(authData),
        "Authorization": oauth.toHeader(authData)["Authorization"] + `, realm="6448561"`,
    };

    try {
        const response = await fetch(finalUrl, {
            method: "PUT",
            headers: {
                ...authHeader,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            body: JSON.stringify(listingsData), // Send listingsData as the payload
        });

        console.log("\n\nHTTP Status:", response.status, response.statusText, "\n");

        const text = await response.text();
        console.log("Raw Response:", text, "\n");

        try {
            const data = JSON.parse(text);
            console.log("Parsed NetSuite Response:", data);
            return { status: response.status, data };
        } catch (error) {
            console.error("JSON Parse Error:", error);
            throw new Error(`Response is not valid JSON. Status: ${response.status}. Raw response: ${text}`);
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        throw error;
    }
};

module.exports = { fetchListingsByMarketplaceAndDeploymentID, updateMarketplaceListingsByID };
