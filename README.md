# NetSuite

NetSuite automation scripts and utilities for EDI processing, invoice management, and POD (Proof of Delivery) document retrieval.

## Project Structure

```
├── README.md                           # This file
├── NetSuite_Troubleshooting_Memories.md # Lessons learned and troubleshooting guide
├── EDI_Error_Record_Reference.md       # EDI error record structure reference
└── scripts/                            # NetSuite scripts folder
    ├── setInvoiceAsReadyToSend.js      # Auto-approve invoices for EDI transmission
    ├── setIFasReadyToSend.js           # Set Item Fulfillments as ready to send
    ├── retrieve_and_attach_PODs.js     # Automated FedEx POD document retrieval and attachment
    └── wmSecheduledGetPODs.js          # Scheduled script to call POD suitelet for packages
```

## Scripts

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

## Documentation

- **NetSuite_Troubleshooting_Memories.md**: Comprehensive troubleshooting guide with lessons learned from NetSuite development
- **EDI_Error_Record_Reference.md**: Reference for EDI error record structure and usage patterns

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