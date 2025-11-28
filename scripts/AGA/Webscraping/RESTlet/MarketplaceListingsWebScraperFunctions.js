/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 */

define(['N/record', 'N/search'], function (record, search) {

    function getListingsByMarketplace(requestParams) {
        log.debug("GET FUNCTION CALLED");
        try {
            log.debug("Searching for all records with customer of: " + requestParams.marketplace);
            var marketplaceListingsSearch = search.create({
                type: 'customrecord_marketplacelisting',
                filters: [
                    ['custrecord_marketplace_marketplace', 'is', requestParams.marketplace]
                ],
                columns: [
                    'internalid',
                    'name',
                    'custrecord_listing_url',
                    'custrecord_retail_price'
                ]
            });

            log.debug("Results:");
            var results = [];
            marketplaceListingsSearch.run().each(function (result) {
                URL = result.getValue({ name: 'custrecord_listing_url' });
                if (URL) {
                    results.push({
                        internalId: result.id,
                        name: result.getValue({ name: 'name' }),
                        url: URL, 
                        retailPrice: result.getValue({ name: 'custrecord_retail_price' })
                    });
                };
                log.debug('Marketplace Listing: ' + 'Internal ID:' + result.id + ', URL: ' + result.getValue({ name: 'custrecord_listing_url' }));
                return true;
            });

            return results;

        } catch (e) {
            log.error(e.toString());
            return { message: "Error in script", errorMsg: e.toString() };
        }
    }


    function updateListingsByID(requestBody) {
        log.debug("PUT REQUEST RECIEVED");
        
        try {
            requestBody.forEach(function (listing) {
              log.debug("Update record: " + listing.ID + " with price of: " + listing.price);
               if(!listing.error){
                  record.submitFields({
                    type: 'customrecord_marketplacelisting',
                    id: listing.ID,
                    values: {
                        "custrecord_listed_price": listing.price,
                        "custrecord_updated_by_scraper": new Date(listing.timestamp),
                        "custrecord_in_stock" : listing.inStock,
                        "custrecord_error_msg": ""
                    }
                });
               } else{
                  record.submitFields({
                    type: 'customrecord_marketplacelisting',
                    id: listing.ID,
                    values: {
                        "custrecord_updated_by_scraper": new Date(listing.timestamp),
                        "custrecord_error_msg": listing.error
                    }
                });
               }

            });

            return { message: "PUT request received", updatedData: requestBody };

        } catch (e) {
            log.error("Error Updating Listings", e.message);
            return { message: "Error updating listings", error: e.message };
        }
    }


    return {
        get: getListingsByMarketplace,   // NetSuite calls this function for GET requests
        put: updateListingsByID,   // NetSuite calls this function for PUT requests
    };
});
