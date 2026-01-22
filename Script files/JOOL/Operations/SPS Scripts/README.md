# SPS Scripts

SPS Commerce integration scripts for autopack, batch printing, and Item Fulfillment management.

## Overview

Collection of scripts that integrate with SPS Commerce API for automated warehouse operations including packing, label generation, and Item Fulfillment management.

## Directory Structure

### `Autopack/`
Automated packing scripts that integrate with SPS Commerce for creating packages.

**Key Scripts:**
- `sps_mr_auto_pack_2x.js` - Map/Reduce script for bulk autopack
- `sps_sl_auto_pack_2x.js` - Suitelet for manual autopack
- `sps_rest_manual_pack.js` - RESTlet for manual packing operations

### `Batch print/`
Batch label printing scripts for generating carton labels via SPS Commerce.

**Key Scripts:**
- `sps_mr_batch_labels.js` - Map/Reduce for batch label generation
- `sps_sl_batch_label_2x.js` - Suitelet for batch label requests
- `sps_lib_label_api.js` - Library for SPS label API integration
- `sps_ue_customer_label.js` - User Event for customer-specific label handling

**Label Details:**
- Generates 75 carton labels per PDF
- Multiple PDFs created for IFs with >75 packages
- PDFs named: `{tranid} Label {X} of {Y}.pdf`

### `IF buttons/`
Item Fulfillment button enhancements and creation scripts.

**Key Scripts:**
- `sps_ue_item_fulfillment_refactor.js` - User Event for IF enhancements
- `sps_sl_create_if_obj.js` - Suitelet for creating IF objects
- `sps_cs_item_fulfillment.js` - Client Script for IF form enhancements

### Root Level Scripts
- `sps_sl_check_mr_status.js` - Suitelet to check Map/Reduce script status
- `sps_ue_package_content_sublist.js` - User Event for package content management

## Features

- **SPS API Integration**: Full integration with SPS Commerce API
- **Automated Workflows**: End-to-end automation for packing and labeling
- **Batch Processing**: Efficient bulk operations via Map/Reduce scripts
- **Error Handling**: Comprehensive error handling and logging
- **Status Tracking**: Real-time status checking and monitoring

## Related Scripts

- Auto Pack IFs: `../Auto Pack IFs/`
- Batch Print Labels: `../Batch print labels/`
- Create IFs: `../Create IFs/`

