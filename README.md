# NetSuite SuiteScripts

A comprehensive collection of NetSuite SuiteScript automation scripts and utilities for EDI processing, invoice management, POD (Proof of Delivery) document retrieval, BOL generation, label printing, pallet management, routing automation, and workflow optimization. This repository contains customer-specific automation solutions organized by client (AGA, BG, JOOL) with a focus on reusable library patterns, comprehensive error handling, and scalable automation architecture.

**Key Features:**
- **Standardized Architecture**: Follows SCH → MR → Library pattern for consistent, reusable automation
- **Customer-Specific Solutions**: Organized by client with Finance and Operations separation
- **Comprehensive Error Handling**: Centralized error tracking with EDI error records
- **Time Tracking Integration**: Built-in automation savings measurement
- **SPS Commerce Integration**: Seamless integration with SPS Commerce for packing and labeling
- **Documentation**: Extensive README files and troubleshooting guides for each module

## Project Structure

```
├── README.md                           # This file
├── AUTOMATION_ARCHITECTURE.md          # Automation architecture patterns and best practices
├── NetSuite_Troubleshooting_Memories.md # Lessons learned and troubleshooting guide
├── .gitignore                          # Git ignore patterns for secrets and temporary files
└── Script files/                       # NetSuite scripts folder
    ├── AGA/                            # AGA customer-specific scripts
    │   ├── Approve EDI button/         # EDI approval button functionality
    │   ├── Check SO rates vs marktlpllac listings/ # Marketplace rate validation
    │   ├── EDI Approval/               # EDI approval automation scripts
    │   │   ├── setIFasReadyToSend.js   # Set Item Fulfillments as ready to send
    │   │   └── setInvoiceAsReadyToSend.js # Auto-approve invoices for EDI transmission
    │   ├── EDI_Error_Record_Reference.md # EDI error record documentation
    │   ├── Package Management/         # Package management utilities
    │   │   └── deletePackages.js       # Package deletion script
    │   ├── PGA Department Validation/  # PGA department validation User Event
    │   ├── POD Retrieval/              # Proof of Delivery document retrieval
    │   │   ├── retrieve_and_attach_PODs.js # FedEx POD document retrieval Suitelet
    │   │   └── wmSecheduledGetPODs.js  # Scheduled POD retrieval script
    │   ├── Process replacements/       # Replacement processing scripts
    │   ├── reconcilePackages/           # Package reconciliation scripts
    │   ├── Set ASN Status/             # ASN status automation
    │   ├── Set Shipped Datetime/       # Set shipped datetime automation
    │   ├── Sync IF Dates/              # Item Fulfillment date synchronization
    │   └── Webscraping/                # Web scraping utilities
    │       └── RESTlet/                # RESTlet scripts for web scraping
    ├── BG/                             # BG customer-specific scripts
    │   ├── amazonOrderUserEvent.js     # Amazon order processing User Event
    │   └── createOrders.js             # Order creation automation
    └── JOOL/                           # JOOL customer-specific scripts
        ├── AUTOMATION_ARCHITECTURE.md  # JOOL-specific architecture documentation
        ├── NS_TROUBLESHOOTING_GUIDE.md # JOOL troubleshooting guide
        ├── setAVCroutingIF_UE.js       # AVC routing User Event script
        ├── Finance/                    # Finance-related automation
        │   └── Landed costs/           # Landed cost automation
        │       └── Aviva/             # Aviva-specific landed cost scripts
        ├── Operations/                 # Operations automation scripts
        │   ├── Add Packages to IF/    # Add packages to Item Fulfillment sublist
        │   ├── Approve AVC orders/     # AVC order approval automation
        │   ├── Auto Pack IFs/          # Automated Item Fulfillment packing
        │   ├── Barcode Generation/     # Barcode generation utilities
        │   ├── Batch print labels/    # Batch label printing and merging
        │   ├── BOL/                    # Bill of Lading generation
        │   ├── Calculate and set routing/ # Routing calculation and automation
        │   ├── Create IFs/             # Item Fulfillment creation automation
        │   ├── Integrated Shipping Labels/ # Integrated shipping labels from SPS packages
        │   ├── notifications/          # Routing and error notifications
        │   ├── Package Deletion Diagnostics/ # Package deletion diagnostic tools
        │   ├── Packing_List/           # Packing slip PDF templates
        │   ├── Pallet Assignment/      # Pallet assignment and calculation automation
        │   ├── Pallet Labels/          # Pallet label generation and printing
        │   ├── Pallet SSCC Generation/ # Pallet SSCC barcode generation
        │   ├── Pallet Volume Display/  # Pallet volume display User Event
        │   ├── Purchase order change/   # Purchase order status and SO linking
        │   ├── SPS Scripts/            # SPS Commerce integration scripts
        │   │   ├── Autopack/           # SPS autopack functionality
        │   │   ├── Batch print/       # SPS batch label printing
        │   │   └── IF buttons/        # Item Fulfillment button enhancements
        │   └── Calculate and set routing/UE/ # Routing User Event scripts
        └── time tracker/               # Time tracking library and documentation
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

See `Script files/JOOL/Operations/BOL/README.md` for detailed documentation.

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

### Calculate and Set Routing
Automated calculation and application of Amazon Vendor Central routing information to Item Fulfillments.

**Key Features:**
- Centralized routing calculation library
- Automatic routing field updates
- Pickup date calculation
- Entity-specific (entity 1716 only)
- Time tracking integration
- Suitelet for manual calculation
- User Event for automatic routing

**Files:**
- `Script files/JOOL/Operations/Calculate and set routing/_dsh_lib_routing_calculator.js` - Reusable routing library
- `Script files/JOOL/Operations/Calculate and set routing/_dsh_sl_calculate_routing.js` - Suitelet for manual routing calculation
- `Script files/JOOL/Operations/Calculate and set routing/UE/setAVCroutingIF_UE.js` - User Event script for automatic routing

See `Script files/JOOL/Operations/Calculate and set routing/README.md` for detailed documentation.

### Packing List
Advanced PDF/HTML templates for generating packing slip documents.

**Key Features:**
- Print-ready PDF templates
- Customizable XML-based templates
- Data binding from Item Fulfillment records

**Files:**
- `packing_slip_template_original.xml` - Original packing slip template
- `packing_slip_template_with_rick_roll.xml` - Modified template with custom content

### Integrated Shipping Labels
Automated creation of integrated shipping labels from SPS packages for Item Fulfillments.

**Key Features:**
- SCH → MR → Library pattern for flexible triggering
- Entity-based processing with routing support
- SCAC validation against small parcel list
- Automatic package line creation from SPS packages
- Carton number auto-increment
- Amazon ARN reference setting
- Ship method and carrier configuration

**Files:**
- `_dsh_sch_integrated_shipping_labels.js` - Scheduled script for finding IFs
- `_dsh_mr_integrated_shipping_labels.js` - Map/Reduce script for bulk processing
- `_dsh_lib_integrated_shipping_labels.js` - Library with core business logic

See `Script files/JOOL/Operations/Integrated Shipping Labels/README.md` for detailed documentation.

### Package Deletion Diagnostics
Diagnostic tools for checking package deletion dependencies and issues.

**Key Features:**
- Comprehensive dependency checking
- User Event script detection
- Performance analysis
- Field relationship inspection

**Files:**
- `Package Deletion Diagnostics/checkPackageDependencies.js` - Diagnostic script for package deletion blockers

See `Script files/JOOL/Operations/Package Deletion Diagnostics/README.md` for detailed documentation.

### Pallet Assignment
Automated pallet assignment and calculation system for optimal pallet distribution across Item Fulfillments.

**Key Features:**
- Optimal pallet assignment algorithm (minimizes pallets, items can share)
- Location-based UPP (units per pallet) calculation
- Automatic pallet record creation
- Map/Reduce processing for bulk operations
- VPN (Vendor Part Number) mapping from Item Fulfillment item lines
- JSON data storage on pallet records for label generation

**Files:**
- `_dsh_lib_calculate_and_assign_pallets.js` - Core library with pallet calculation and assignment logic
- `_dsh_mr_assign_pallets.js` - Map/Reduce script for bulk pallet assignment
- `_dsh_sl_assign_pallets.js` - Suitelet for manual pallet assignment

**Key Features:**
- Calculates optimal pallet assignments based on item UPP values
- Creates pallet records with index and total count
- Stores item and carton data in JSON format on pallet records
- Maps item IDs to VPNs from Item Fulfillment item lines
- Updates packages and package content with pallet assignments

See `Script files/JOOL/Operations/Pallet Assignment/README.md` and `Script files/JOOL/Operations/Pallet Assignment/TROUBLESHOOTING.md` for detailed documentation.

### Pallet Labels
Automated pallet label generation with SKU/VPN display and SSCC barcode support.

**Key Features:**
- Advanced PDF/HTML template generation
- SKU/VPN display logic (MIXED SKU for multiple items, VPN for single item)
- SSCC (Serial Shipping Container Code) barcode generation
- Carton count display
- Ship from/to address formatting
- PO barcode display
- Carrier information (BOL, PRO, ARN)

**Files:**
- `_dsh_lib_pallet_label_generator.js` - Core library with label generation logic
- `_dsh_lib_pallet_label_template.js` - FreeMarker template for label layout
- `_dsh_sl_pallet_label_generate.js` - Suitelet for manual label generation

**Key Features:**
- Reads pallet data from pallet records and Item Fulfillments
- Parses JSON data from pallet records for item and carton information
- Displays "MIXED SKU" when multiple items on pallet, or VPN when single item
- Generates SSCC barcode for pallet identification
- Supports both button-triggered and automated generation

### Purchase Order Change
Automated Purchase Order status management and Sales Order linking functionality.

**Key Features:**
- Automatic status field mapping based on custom status field
- Sales Order linking on Purchase Order creation
- Entity and PO number-based SO search
- Comprehensive error handling and logging

**Files:**
- `Purchase order change/_dsh_ue_po_status_so_link.js` - User Event script for PO status and SO linking
- `Purchase order change/README.md` - Complete documentation and usage guide

**Status Mapping:**
- `custbody_status` = 1 → `transtatus` = 'A'
- `custbody_status` = 2 → `transtatus` = 'B'
- `custbody_status` = 3 → `transtatus` = 'C'

See `Script files/JOOL/Operations/Purchase order change/README.md` for detailed documentation.

### Time Tracker
Centralized time tracking system for measuring automation savings.

**Key Features:**
- Library function for consistent implementation
- Automatic datetime tracking
- Custom transaction-based tracking
- Support for multiple action types

**Files:**
- `time tracker/_dsh_lib_time_tracker.js` - Reusable library function
- `time tracker/TIME_TRACKER.md` - Complete implementation and usage guide

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

### Approve EDI Button
Button-triggered EDI approval functionality for Item Fulfillments.

**Key Features:**
- Client-side button rendering
- Server-side approval processing
- EDI toggle functionality

**Files:**
- `approveRecordForEdiFromButtonClick.js` - Server-side approval handler
- `ediToggleClient.js` - Client script for EDI toggle
- `renderCustomerApproveEDIButton.js` - Button rendering script

### EDI Approval
Automated EDI approval scripts for Item Fulfillments and Invoices.

#### setInvoiceAsReadyToSend.js
Scheduled script that automatically processes invoices for EDI transmission approval by verifying sibling Item Fulfillment shipping status and applying customer-specific business logic. Failed processing attempts are logged through EDI error records with trading partner identification.

**Custom Logic:**
- TP Target (entity 546) invoices have their integration status set to 9 and bypass EDI approval entirely

**Files:**
- `EDI Approval/setInvoiceAsReadyToSend.js` - Invoice EDI approval automation

#### setIFasReadyToSend.js
Scheduled script that automatically approves Item Fulfillments for EDI transmission. Processes IFs from a saved search and applies customer-specific logic before setting the EDI approval field.

**Custom Logic:**
- Menards (entity 545): Sets ASN status to 16 when PO Type is 'DR'

**Files:**
- `EDI Approval/setIFasReadyToSend.js` - Item Fulfillment EDI approval automation

### Package Management
Package management utilities and diagnostic tools.

**Files:**
- `Package Management/deletePackages.js` - Package deletion utility script

### PGA Department Validation
User Event script that validates department information on transactions for PGA (Professional Golfers' Association) compliance.

**Key Features:**
- Department validation on transaction records
- Email notifications for validation issues
- Record link generation for error reporting

**Files:**
- `PGA Department Validation/aga_ue_department_validation.js` - User Event script for department validation

### POD Retrieval
Proof of Delivery document retrieval and attachment automation.

#### retrieve_and_attach_PODs.js
Suitelet for automated FedEx POD (Proof of Delivery) document retrieval and attachment to package records. Processes tracking numbers through the FedEx API to fetch POD documents and automatically attaches them to the corresponding NetSuite package records. Includes comprehensive error handling with EDI error record creation and dynamic account number mapping based on Walmart DC numbers.

**Key Features:**
- **FedEx API Integration**: OAuth token authentication and document retrieval
- **Dynamic Date Range**: Based on package creation date (start = creation date, end = creation date + 1 month)
- **Account Number Mapping**: Walmart DC number to FedEx account number lookup via custom transaction record
- **Comprehensive Error Handling**: Centralized error handling with single error record creation
- **File Attachment**: Automatic PDF creation and attachment to package records
- **Status Updates**: Real-time package record status and message updates

**Custom Logic:**
- **Walmart DC Validation**: Must be exactly 4 digits (numeric only)
- **Carrier Detection**: Automatic UPS vs FedEx detection based on tracking number format
- **Error Record Creation**: Action ID 9 for "Fetch PODs" with package record reference
- **Safety Net Error Handling**: Main catch block ensures all errors are tracked

**Required Script Parameters:**
- `custscript_fedex_api_key`: FedEx API key
- `custscript_fedex_secret_key`: FedEx API secret key
- `custscript_account_mapping_record`: ID of account mapping record

**Files:**
- `POD Retrieval/retrieve_and_attach_PODs.js` - POD retrieval Suitelet

#### wmSecheduledGetPODs.js
Scheduled script that processes packages from a saved search and calls the POD retrieval suitelet for each package. Generates suitelet URLs dynamically and handles tracking number validation and error reporting.

**Key Features:**
- **Deduplication Logic**: Prevents processing duplicate packages from saved search joins
- **Dynamic URL Generation**: Creates fully qualified HTTPS URLs for suitelet calls
- **Comprehensive Error Handling**: Tracks processing statistics and error reporting
- **Progress Monitoring**: Detailed logging and progress reporting

**Custom Logic:**
- **Package Deduplication**: Uses Set to track processed package IDs
- **URL Construction**: Manual HTTPS URL building for NetSuite compatibility
- **Tracking Number Validation**: Skips packages without tracking numbers
- **Processing Statistics**: Tracks total, processed, success, error, and skipped counts

**Required Script Parameters:**
- `custscript_saved_search_id`: ID of saved search containing packages to process

**Files:**
- `POD Retrieval/wmSecheduledGetPODs.js` - Scheduled POD retrieval script

### reconcilePackages
Package reconciliation scripts for syncing SPS packages with Item Fulfillment package sublists.

**Key Features:**
- Button-triggered package reconciliation
- Client-side button rendering
- Server-side reconciliation processing

**Files:**
- `reconcilePackages/reconcilePackagesClient.js` - Client script for button handling
- `reconcilePackages/reconcilePackagesSuitelet (1).js` - Suitelet for package reconciliation
- `reconcilePackages/renderReconcileButton.js` - Button rendering script

### Set Shipped Datetime
Automated setting of shipped datetime on Item Fulfillments.

**Files:**
- `Set Shipped Datetime/aga_ue_set_shipped_datetime.js` - User Event script for setting shipped datetime

### Sync IF Dates
Item Fulfillment date synchronization automation.

**Files:**
- `Sync IF Dates/aga_ue_sync_if_dates.js` - User Event script for date synchronization

### Webscraping
Web scraping utilities and RESTlet scripts.

**Files:**
- `Webscraping/RESTlet/MarketplaceListingsWebScraperFunctions.js` - RESTlet functions for marketplace listings web scraping

## Documentation

### Architecture & Patterns
- **AUTOMATION_ARCHITECTURE.md**: Comprehensive guide to automation patterns (SCH→MR→Library standard pattern)
- **Script files/JOOL/AUTOMATION_ARCHITECTURE.md**: JOOL-specific automation architecture documentation
- **Script files/JOOL/NS_TROUBLESHOOTING_GUIDE.md**: JOOL-specific NetSuite troubleshooting guide with common issues and solutions

### Customer-Specific Documentation
- **Script files/AGA/EDI_Error_Record_Reference.md**: Reference for EDI error record structure and usage patterns
- **Script files/JOOL/Operations/BOL/README.md**: Detailed BOL generation documentation
- **Script files/JOOL/Operations/BOL/BOL_PROCESS_OVERVIEW.md**: BOL process overview and integration details
- **Script files/JOOL/Operations/Integrated Shipping Labels/README.md**: Integrated shipping labels automation documentation
- **Script files/JOOL/Operations/Calculate and set routing/README.md**: Routing calculation and automation documentation
- **Script files/JOOL/time tracker/TIME_TRACKER.md**: Complete time tracker implementation and usage guide
- **Script files/JOOL/Operations/Purchase order change/README.md**: Purchase order status and SO linking documentation

### General Documentation
- **NetSuite_Troubleshooting_Memories.md**: Comprehensive troubleshooting guide with lessons learned from NetSuite development

## Getting Started

1. Clone this repository
2. Review **AUTOMATION_ARCHITECTURE.md** and **Script files/JOOL/AUTOMATION_ARCHITECTURE.md** to understand automation patterns
3. Review the troubleshooting guides for common NetSuite development patterns
4. Use the EDI error record reference for consistent error handling
5. Navigate to the appropriate customer folder (AGA, BG, or JOOL) and operation type (Finance or Operations)
6. Deploy scripts to your NetSuite environment
7. Configure required script parameters
8. Test with sample data before production use

## Automation Patterns

This codebase follows the **SCH → MR → Library** pattern documented in `AUTOMATION_ARCHITECTURE.md` and `Script files/JOOL/AUTOMATION_ARCHITECTURE.md`:

- **Scheduled Script** finds records, validates, batches, and schedules MR
- **Map/Reduce Script** orchestrates bulk processing and calls library
- **Library Script** contains core business logic (reusable from MR, Suitelet, User Event)

**Benefits**: Effective batching, button support via Suitelet, deployment management, code reusability.

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