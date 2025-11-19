/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(['N/record', 'N/file', 'N/log', 'N/format', 'N/search'], (record, file, log, format, search) => {

    const execute = () => {
        try {
            const fileId = getLatestFileInFolder(4504); // Replace with actual folder ID
            if (!fileId) throw 'No file found in folder';

            const jsonFile = file.load({ id: fileId });
            const orders = JSON.parse(jsonFile.getContents());

            orders.forEach(order => {
                const externalId = getCleanExternalId(order.orderNumber);
                const existingId = findExistingOrder(externalId);

                log.debug("Order number: " + order.orderNumber);

                if (existingId) {
                    // ====== UPDATE MODE ======
                    log.debug("Order existed already");
                    log.debug("Existing ID: " + existingId);

                    const rec = record.load({
                        type: 'customtransaction_amazon_order',
                        id: existingId,
                        isDynamic: true
                    });

                    let hasMeaningfulStatusChange = false;

                    // Update HEADER tracking numbers
                    rec.setValue({ fieldId: 'custbody_2623', value: getUniqueTrackingNumbersAsString(order) });

                    rec.setValue({
                        fieldId: 'custbody_2624',
                        value: format.parse({
                            value: formatIsoToMDYYYYHHMM(order.lastUpdated),
                            type: format.Type.DATETIME
                        })
                    });

                    // Update LINE tracking details
                    var i = 0;
                    (order.shipments || []).forEach(shipmentItemsArray => {
                        (shipmentItemsArray || []).forEach(item => {
                            rec.selectLine({ sublistId: 'line', line: i });

                            const currentStatus = rec.getCurrentSublistValue({
                                sublistId: 'line',
                                fieldId: 'custcol18'
                            });
                            const newStatus = getItemStatus(item);

                            if ([1, 2, 3].includes(newStatus) && currentStatus !== String(newStatus)) {
                                rec.setCurrentSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'custcol18',
                                    value: newStatus
                                });
                                hasMeaningfulStatusChange = true;
                            }

                            rec.setCurrentSublistValue({
                                sublistId: 'line',
                                fieldId: 'custcol_12',
                                value: item.trackingNumber || ''
                            });

                            if (isValidUrl(item.trackingLink)) {
                                rec.setCurrentSublistValue({
                                    sublistId: 'line',
                                    fieldId: 'custcol_14',
                                    value: item.trackingLink
                                });
                            }

                            rec.setCurrentSublistValue({
                                sublistId: 'line',
                                fieldId: 'custcol_15',
                                value: item.shipmentStatus || ''
                            });

                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: 1083 });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'amount', value: parseFloat(item.price || 0) });

                            rec.commitLine({ sublistId: 'line' });
                            i++;
                        });
                    });

                    if (hasMeaningfulStatusChange) {
                        rec.setValue({ fieldId: 'custbody_is_new', value: true });
                    }

                    rec.save();
                    log.audit('Updated Existing Record', `External ID: ${externalId} (internal ID: ${existingId})`);

                } else {
                    // ====== CREATE MODE ======
                    log.debug("Order did not exist");

                    const rec = record.create({
                        type: 'customtransaction_amazon_order',
                        isDynamic: true
                    });

                    rec.setValue({ fieldId: 'subsidiary', value: 2 });
                    rec.setValue({ fieldId: 'externalid', value: externalId });
                    rec.setValue({ fieldId: 'tranid', value: order.orderNumber });
                    rec.setValue({ fieldId: 'custbody_is_new', value: true }); // Always true on creation

                    rec.setValue({ fieldId: 'custbody_bg', value: getBuyingGroupId(order.BG) });
                    rec.setValue({ fieldId: 'custbody_2618', value: getPaymentMethodId(order.paymentMethod) });
                    rec.setValue({ fieldId: 'custbody_2621', value: getAmazonAccountId(order.orderedByAccount) });

                    if (order.orderDate) {
                        rec.setValue({
                            fieldId: 'custbody_2620',
                            value: format.parse({ value: formatDateToMDYYYY(order.orderDate), type: format.Type.DATE })
                        });
                    }

                    rec.setValue({
                        fieldId: 'custbody_2624',
                        value: format.parse({
                            value: formatIsoToMDYYYYHHMM(order.lastUpdated),
                            type: format.Type.DATETIME
                        })
                    });

                    rec.setValue({ fieldId: 'custbody_2622', value: `<a href="${order.orderUrl}" target="_blank">${order.orderNumber}</a>` });
                    rec.setValue({ fieldId: 'custbody_order_total', value: parseFloat(order.orderTotal || 0) });
                    rec.setValue({ fieldId: 'custbody_2619', value: order.bgAddress || '' });
                    rec.setValue({ fieldId: 'custbody_2623', value: getUniqueTrackingNumbersAsString(order) });

                    (order.shipments || []).forEach(shipmentItemsArray => {
                        (shipmentItemsArray || []).forEach(item => {
                            rec.selectNewLine({ sublistId: 'line' });

                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_bg_paying', value: parseFloat(item.bgPaying || 0) });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'amount', value: parseFloat(item.price || 0) });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol10', value: getShortItemName(item.itemName) || '' });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_12', value: item.trackingNumber || '' });

                            if (isValidUrl(item.trackingLink)) {
                                rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_14', value: item.trackingLink });
                            }

                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_15', value: item.shipmentStatus || '' });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol16', value: item.wasPaid ? true : false });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_qty', value: parseInt(item.quantityOrdered || 1) });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol_recieved', value: item.isDelivered ? true : false });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'custcol18', value: getItemStatus(item) });
                            rec.setCurrentSublistValue({ sublistId: 'line', fieldId: 'account', value: 1083 });

                            rec.commitLine({ sublistId: 'line' });
                        });
                    });

                    const id = rec.save();
                    log.audit('Created New Record', `Amazon Order External ID: ${externalId} (internal ID: ${id})`);
                }
            });

        } catch (e) {
            log.error('Error Processing JSON Orders', e);
        }
    };

    // ===== Helper Functions =====
    const getCleanExternalId = (orderNum) => {
        const clean = (orderNum || '').replace(/[^a-zA-Z0-9]/g, '');
        return clean || 'fallbackExtId' + Date.now();
    };

    const findExistingOrder = (externalId) => {
        const results = search.create({
            type: 'customtransaction_amazon_order',
            filters: [['externalid', 'is', externalId]],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });

        return results.length > 0 ? results[0].getValue('internalid') : null;
    };

    const getBuyingGroupId = (name) => {
        switch (name) {
            case 'B': return 1;
            case 'EMB': return 2;
            case 'BG': return 3;
            case 'Deal & Runner': return 4;
            default: return 5;
        }
    };

    const getPaymentMethodId = (name) => {
        switch (name) {
            case 'Chase Amazon Prime': return 1;
            case 'Chase Business Ink': return 2;
            case 'RobinHood Gold Card': return 3;
            case 'Amex Business Cash': return 4;
            default: return 5;
        }
    };

    const getAmazonAccountId = (email) => {
        switch (email) {
            case 'DOVID': return 1;
            case 'DEVORAH': return 2;
            default: return 3;
        }
    };

    const getLatestFileInFolder = (folderId) => {
        const results = search.create({
            type: 'file',
            filters: [['folder', 'is', folderId]],
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });

        return results.length ? results[0].getValue('internalid') : null;
    };

    const getShortItemName = (fullName) => {
        if (!fullName) return '';
        const words = fullName.trim().split(/\s+/);
        const firstFive = words.slice(0, 5);
        const lastTwo = words.slice(-2);
        return [...firstFive, ' - ', ...lastTwo].join(' ');
    };

    function getItemStatus(item) {
        if (item.shipmentStatus && item.shipmentStatus.toLowerCase().includes('delivered')) {
            return 3;
        }
        if (item.trackingNumber) {
            return 2;
        }
        return 1;
    }

    function getUniqueTrackingNumbersAsString(order) {
        const uniqueTrackingNumbers = new Set();
        (order.shipments || []).forEach(shipment => {
            (shipment || []).forEach(item => {
                if (item.trackingNumber) {
                    uniqueTrackingNumbers.add(item.trackingNumber);
                }
            });
        });
        return Array.from(uniqueTrackingNumbers).join(', ');
    }

    function isValidUrl(string) {
        return string && typeof string === 'string' && string.startsWith('https://');
    }

    const formatIsoToMDYYYYHHMM = (isoDateStr) => {
        const date = new Date(isoDateStr);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const year = date.getFullYear();

        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12 || 12;
        const strMinutes = minutes < 10 ? '0' + minutes : minutes;

        return `${month}/${day}/${year} ${hours}:${strMinutes} ${ampm}`;
    };

    const formatDateToMDYYYY = (dateStr) => {
        const date = new Date(dateStr);
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };

    return { execute };
});
