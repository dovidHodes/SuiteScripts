# Batch Print Labels

Automated batch printing of carton labels with PDF merging capabilities.

## Overview

System for generating and merging carton label PDFs from SPS Commerce, with support for batch processing and automatic PDF merging when multiple label files are generated.

## Scripts

### `_dsh_sch_batch_print_labels.js`
- **Type**: Scheduled Script
- **Purpose**: Finds Item Fulfillments needing labels and triggers label generation

### Batch Merge and Attach (`batch the batch and attach/`)

#### `_dsh_mr_merge_labels.js`
- **Type**: Map/Reduce Script
- **Purpose**: Merges multiple label PDFs into a single file

#### `_dsh_sch_batch_and_attach.js`
- **Type**: Scheduled Script
- **Purpose**: Batches label merging and attachment operations

#### `_dsh_ue_if_merge_labels.js`
- **Type**: User Event Script
- **Purpose**: Captures label PDF links and triggers merge process

## Features

- **SPS Integration**: Uses SPS Commerce API for label generation
- **Batch Processing**: Processes 75 labels per PDF
- **PDF Merging**: Automatically merges multiple PDFs when IF has >75 packages
- **Automatic Attachment**: Attaches merged PDFs to Item Fulfillment records
- **PDF Naming**: Files named `{tranid} Label {X} of {Y}.pdf`

## SPS Label Details

- SPS script generates **75 carton labels per PDF**
- Multiple PDFs created when IF has more than 75 packages
- PDFs are automatically merged into a single file
- Merged file is attached to the Item Fulfillment record

## Merge Library

The `Merge library/` folder contains PDF merging utilities:
- `PDFlib.js` - Core PDF library
- `PDFlib_WRAPPED.js` - Wrapped version for NetSuite
- `PDFLIB_USAGE_GUIDE.md` - Usage documentation

## Related Scripts

- SPS Label Scripts: `../SPS Scripts/Batch print/`
- Time Tracker: `../time tracker/_dsh_lib_time_tracker.js`

