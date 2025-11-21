# NetSuite SuiteScripts

NetSuite automation scripts and utilities for EDI processing, invoice management, POD (Proof of Delivery) document retrieval, BOL generation, label printing, and workflow automation.

## Project Structure

```
├── README.md                           # This file
├── NetSuite_Troubleshooting_Memories.md # Lessons learned and troubleshooting guide
├── .gitignore                          # Git ignore patterns for secrets and temporary files
└── scripts/                            # NetSuite scripts folder
    ├── Jool/                           # Jool customer-specific scripts
    │   ├── Approve AVC orders/         # AVC order approval automation
    │   ├── Auto Pack IFs/              # Automated Item Fulfillment packing
    │   ├── Batch print labels/         # Batch label printing and merging
    │   ├── BOL/                        # Bill of Lading generation
    │   ├── Create IFs/                 # Item Fulfillment creation automation
    │   ├── delete/                     # Package deletion diagnostic tools
    │   ├── Packing_List/               # Packing slip PDF templates
    │   ├── Set routing info AVC library code/  # Routing calculation library
    │   ├── Set routing info AVC UE/    # Routing User Event script
    │   ├── SPS Scripts/                # SPS Commerce integration scripts
    │   │   ├── Autopack/               # SPS autopack functionality
    │   │   ├── Batch print/            # SPS batch label printing
    │   │   └── IF buttons/             # Item Fulfillment button enhancements
    │   └── time tracker/               # Time tracking library and documentation
    └── AGA/                            # AGA customer-specific scripts
        ├── Approve EDI button/         # EDI approval button functionality
        ├── PGA Department Validation/ # PGA department validation User Event
        ├── reconcilePackages/          # Package reconciliation scripts
        ├── deletePackages.js           # Package deletion script
        ├── retrieve_and_attach_PODs.js # FedEx POD document retrieval
        ├── setIFasReadyToSend.js       # Set Item Fulfillments as ready to send
        ├── setInvoiceAsReadyToSend.js  # Auto-approve invoices for EDI transmission
        └── wmSecheduledGetPODs.js      # Scheduled POD retrieval
```

## Scripts

## Jool Scripts

### BOL (Bill of Lading) Generation
Automated BOL generation from Item Fulfillment records with support for both button-triggered and scheduled execution.

**Key Features:**
- Library script pattern for code reusability
- Button-triggered generation via Suitelet
- Map/Reduce automated generation
- PDF attachment to Item Fulfillment records
- Advanced PDF/HTML template support

**Files:**
- `_dsh_lib_bol_generator.js` - Core library with shared BOL generation logic
- `_dsh_sl_single_bol_generate.js` - Suitelet for button-triggered generation
- `_dsh_mr_generate_and_attach_bols.js` - Map/Reduce script for automated generation
- `_dsh_ue_if_bol_button.js` - User Event script that adds BOL button to IF form
- `_dsh_cs_single_bol_button.js` - Client script for button click handling

See `scripts/Jool/BOL/README.md` for detailed documentation.

### Batch Print Labels
Automated batch printing of carton labels with PDF merging capabilities.

**Key Features:**
- SPS Commerce integration for label generation
- Batch processing of multiple labels (75 labels per PDF)
- Automatic PDF merging for Item Fulfillments with multiple label files
- Scheduled and manual trigger options

**Files:**
- `_dsh_sch_batch_print_labels.js` - Scheduled script to find IFs needing labels
- `_dsh_mr_merge_labels.js` - Map/Reduce script to merge multiple label PDFs
- `_dsh_sch_batch_and_attach.js` - Scheduled script to batch merge and attach labels
- `_dsh_ue_if_label_link.js` - User Event to capture label PDF links

**SPS Label Details:**
- SPS script generates **75 carton labels per PDF**
- Multiple PDFs are created when an IF has more than 75 packages
- PDFs are named: `{tranid} Label {X} of {Y}.pdf`
- Merge script combines all PDFs into a single merged file

### Approve AVC Orders
Automated approval of AVC (Amazon Vendor Central) orders with warehouse-specific logic.

**Key Features:**
- Entity-specific processing (entity 1716)
- Warehouse buffer stock management
- Automatic approval based on inventory availability
- Time tracking integration

**Files:**
- `setAndApproveAVCOrders.js` - User Event script for order approval

### Auto Pack IFs
Automated packing of Item Fulfillments using SPS Commerce integration.

**Key Features:**
- Automated discovery of IFs needing packing
- SPS Commerce integration for autopack
- Entity-based processing (only entities with `custentity_auto_create_packages = true`)
- Time tracking integration

**Files:**
- `autopackScheduled.js` - Scheduled script to find IFs and schedule SPS autopack
- `sps_mr_auto_pack_2x_custom.js` - Custom SPS autopack Map/Reduce script

### Create IFs
Automated creation of Item Fulfillments from Sales Orders grouped by location.

**Key Features:**
- Automatic IF creation from Sales Orders
- Location-based grouping
- Entity-based processing (only entities with `custentity_auto_create_ifs = true`)
- Routing integration
- Time tracking integration

**Files:**
- `autoIF.js` - Map/Reduce script for automated IF creation

### Set Routing Info AVC
Automated calculation and application of Amazon Vendor Central routing information to Item Fulfillments.

**Key Features:**
- Centralized routing calculation library
- Automatic routing field updates
- Pickup date calculation
- Entity-specific (entity 1716 only)
- Time tracking integration

**Files:**
- `Set routing info AVC library code/_dsh_lib_routing_calculator.js` - Reusable routing library
- `Set routing info AVC UE/setAVCroutingIF_UE.js` - User Event script for automatic routing

### Packing List
Advanced PDF/HTML templates for generating packing slip documents.

**Key Features:**
- Print-ready PDF templates
- Customizable XML-based templates
- Data binding from Item Fulfillment records

**Files:**
- `packing_slip_template_original.xml` - Original packing slip template
- `packing_slip_template_with_rick_roll.xml` - Modified template with custom content

### Delete Packages
Diagnostic tools for checking package deletion dependencies and issues.

**Key Features:**
- Comprehensive dependency checking
- User Event script detection
- Performance analysis

**Files:**
- `checkPackageDependencies.js` - Diagnostic script for package deletion blockers

### Time Tracker
Centralized time tracking system for measuring automation savings.

**Key Features:**
- Library function for consistent implementation
- Automatic datetime tracking
- Custom transaction-based tracking
- Support for multiple action types

**Files:**
- `_dsh_lib_time_tracker.js` - Reusable library function
- `TIME_TRACKER.md` - Complete implementation and usage guide

**Tracked Actions:**
1. Approve order
2. Create Item fulfillment
3. Request Routing
4. Populate routing
5. Autopack IF
6. Create BOL
7. Print ASN labels
8. Batch & upload labels

### SPS Scripts
SPS Commerce integration scripts for autopack, batch printing, and Item Fulfillment management.

**Key Features:**
- SPS API integration
- Automated packing workflows
- Batch label generation (75 labels per PDF)
- Item Fulfillment creation and management

**Directories:**
- `Autopack/` - Automated packing scripts
- `Batch print/` - Label batch printing scripts
- `IF buttons/` - Item Fulfillment button enhancements

## AGA Scripts

### setInvoiceAsReadyToSend.js
Scheduled script that automatically processes invoices for EDI transmission approval by verifying sibling Item Fulfillment shipping status and applying customer-specific business logic. Failed processing attempts are logged through EDI error records with trading partner identification.

#### Custom Logic
• TP Target (entity 546) invoices have their integration status set to 9 and bypass EDI approval entirely

### setIFasReadyToSend.js
Scheduled script that automatically approves Item Fulfillments for EDI transmission. Processes IFs from a saved search and applies customer-specific logic before setting the EDI approval field.

#### Custom Logic
• Menards (entity 545): Sets ASN status to 16 when PO Type is 'DR'

### retrieve_and_attach_PODs.js
Suitelet for automated FedEx POD (Proof of Delivery) document retrieval and attachment to package records. Processes tracking numbers through the FedEx API to fetch POD documents and automatically attaches them to the corresponding NetSuite package records. Includes comprehensive error handling with EDI error record creation and dynamic account number mapping based on Walmart DC numbers.

#### Key Features
• **FedEx API Integration**: OAuth token authentication and document retrieval
• **Dynamic Date Range**: Based on package creation date (start = creation date, end = creation date + 1 month)
• **Account Number Mapping**: Walmart DC number to FedEx account number lookup via custom transaction record
• **Comprehensive Error Handling**: Centralized error handling with single error record creation
• **File Attachment**: Automatic PDF creation and attachment to package records
• **Status Updates**: Real-time package record status and message updates

#### Custom Logic
• **Walmart DC Validation**: Must be exactly 4 digits (numeric only)
• **Carrier Detection**: Automatic UPS vs FedEx detection based on tracking number format
• **Error Record Creation**: Action ID 9 for "Fetch PODs" with package record reference
• **Safety Net Error Handling**: Main catch block ensures all errors are tracked

#### Required Script Parameters
• `custscript_fedex_api_key`: FedEx API key
• `custscript_fedex_secret_key`: FedEx API secret key
• `custscript_account_mapping_record`: ID of account mapping record

### wmSecheduledGetPODs.js
Scheduled script that processes packages from a saved search and calls the POD retrieval suitelet for each package. Generates suitelet URLs dynamically and handles tracking number validation and error reporting.

#### Key Features
• **Deduplication Logic**: Prevents processing duplicate packages from saved search joins
• **Dynamic URL Generation**: Creates fully qualified HTTPS URLs for suitelet calls
• **Comprehensive Error Handling**: Tracks processing statistics and error reporting
• **Progress Monitoring**: Detailed logging and progress reporting

#### Custom Logic
• **Package Deduplication**: Uses Set to track processed package IDs
• **URL Construction**: Manual HTTPS URL building for NetSuite compatibility
• **Tracking Number Validation**: Skips packages without tracking numbers
• **Processing Statistics**: Tracks total, processed, success, error, and skipped counts

#### Required Script Parameters
• `custscript_saved_search_id`: ID of saved search containing packages to process

### PGA Department Validation
User Event script that validates department information on transactions for PGA (Professional Golfers' Association) compliance.

**Key Features:**
- Department validation on transaction records
- Email notifications for validation issues
- Record link generation for error reporting

**Files:**
- `aga_ue_department_validation.js` - User Event script for department validation

### deletePackages.js
Script for deleting package records (diagnostic/utility script).

**Files:**
- `deletePackages.js` - Package deletion utility

## Documentation

- **NetSuite_Troubleshooting_Memories.md**: Comprehensive troubleshooting guide with lessons learned from NetSuite development
- **scripts/AGA/EDI_Error_Record_Reference.md**: Reference for EDI error record structure and usage patterns
- **scripts/Jool/BOL/README.md**: Detailed BOL generation documentation
- **scripts/Jool/BOL/BOL_PROCESS_OVERVIEW.md**: BOL process overview and integration details
- **scripts/Jool/time tracker/TIME_TRACKER.md**: Complete time tracker implementation and usage guide

## Getting Started

1. Clone this repository
2. Review the troubleshooting memories for common NetSuite development patterns
3. Use the EDI error record reference for consistent error handling
4. Deploy scripts to your NetSuite environment
5. Configure required script parameters
6. Test with sample data before production use

## Error Handling Architecture

### Centralized Error Handling
All scripts use a centralized error handling approach:
- **Errors handled where they occur** - no error bubbling
- **Single error record creation** - prevents duplicates
- **Safety net catch blocks** - ensures all errors are tracked
- **Consistent error categorization** - proper action IDs and field mapping

### EDI Error Records
- **Action ID 8**: General EDI processing (Invoice/Item Fulfillment)
- **Action ID 9**: Fetch PODs (POD retrieval scripts)
- **Package Record Field**: `custrecord236` for POD-related errors
- **Record Field**: `custrecord_edi_error_record` for transaction references

## Contributing

When adding new scripts or discovering new patterns:
1. Add to the troubleshooting memories file
2. Update relevant documentation
3. Follow established patterns for error handling and logging
4. Test thoroughly before deployment
5. Document all custom logic and required parameters 