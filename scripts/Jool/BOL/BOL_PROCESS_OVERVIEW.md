# BOL (Bill of Lading) Process Overview

## Process Overview

The BOL generation system automatically creates Bill of Lading PDF documents from Item Fulfillment records and attaches them directly to the IF. The system supports both **manual (button-triggered)** and **automated (scheduled)** BOL generation.

### High-Level Process Flow

1. **Trigger**: User clicks button OR scheduled script runs
2. **Data Collection**: Script collects data from Item Fulfillment record (addresses, packages, carrier info, etc.)
3. **PDF Generation**: Data is passed to Advanced PDF/HTML Template to generate BOL PDF
4. **Attachment**: PDF is saved to File Cabinet and attached to the IF record
5. **Field Updates**: IF record fields are updated (BOL number, PDF link, etc.)
6. **Time Tracking**: Time tracker entries are added for billing purposes

---

## System Components

### 1. **Library Script** (Core Logic)
- **Purpose**: Centralized BOL generation logic shared by all entry points
- **Location**: `_dsh_lib_bol_generator.js`
- **Type**: Module/Utility Script (not deployed, just imported)

### 2. **User Interface** (Button Trigger)
- **User Event Script**: Adds "Generate BOL" button to IF form
- **Client Script**: Handles button click and calls Suitelet

### 3. **HTTP Endpoint** (Manual Generation)
- **Suitelet**: Receives HTTP requests and calls library function

### 4. **Automated Processing** (Scheduled Generation)
- **Map/Reduce Script**: Processes multiple IFs automatically based on criteria

### 5. **PDF Template**
- **Advanced PDF/HTML Template**: Defines BOL layout and formatting

---

## Script Descriptions

### `_dsh_ue_if_bol_button.js` - **User Event Script**
Adds "Generate BOL" button to Item Fulfillment form (View mode only). Deployed on Item Fulfillment, beforeLoad event.

### `_dsh_cs_single_bol_button.js` - **Client Script**
Handles button click, calls Suitelet via HTTP, shows success/error message. Referenced by User Event script.

### `_dsh_sl_single_bol_generate.js` - **Suitelet**
HTTP endpoint for manual BOL generation. Script ID `customscript_dsh_sl_single_bol`.

### `_dsh_mr_generate_and_attach_bols.js` - **Map/Reduce Script**
Automated bulk BOL generation - searches IFs where `custentity_generate_and_attach_bols = true` and `custbody_requested_bol = false`, filters by SCAC exclusion list, generates BOLs.

### `_dsh_bol_template_new.xml` - **Advanced PDF/HTML Template**
Defines BOL PDF layout. Template ID `CUSTTMPL_DSH_SVC_BOL`.

---

## Process Flows

### Manual Generation Flow (Button Click)
```
User views IF record
    ↓
User Event adds "Generate BOL" button
    ↓
User clicks button
    ↓
Client Script calls Suitelet via HTTP
    ↓
Suitelet calls Library Script
    ↓
Library Script:
  - Collects IF data
  - Generates PDF
  - Attaches to IF
  - Updates fields
    ↓
Suitelet returns JSON response
    ↓
Client Script shows message & reloads page
    ↓
User sees attached PDF
```

### Automated Generation Flow (Scheduled)
```
Scheduled Map/Reduce runs
    ↓
getInputData: Searches for eligible IFs
    ↓
map: Filters IFs (checks exclusion list)
    ↓
reduce: For each eligible IF:
  - Calls Library Script
  - Generates BOL
  - Sets custbody_requested_bol = true
    ↓
summarize: Logs completion stats
```

---

## Key Features

### Data Collection
- **Ship-to Address**: From IF shipping address fields
- **Ship-from Address**: From location record's main address
- **Packages**: Searches SPS package records linked to IF
- **Carrier Info**: SCAC, Pro Number, Load ID from IF fields
- **Customer Info**: Vendor number, customer name from customer record
- **Special Fields**: ARN number, pallet count, PO numbers

### PDF Generation
- Uses NetSuite's Advanced PDF/HTML Template system
- Template receives structured JSON data object
- PDF saved to File Cabinet folder (default: 1373)
- File naming: `BOL_{PO_number} - {location_name}.pdf`

### Field Updates
- `custbody_sps_billofladingnumber` - BOL number (PO number)
- `custbody_link_to_bol` - PDF URL link
- `custbody_requested_bol` - Flag to prevent duplicate processing

### Time Tracking
- Adds time tracker entries for billing:
  - "Create BOL" action (Employee 5, 60 seconds)
  - "Print BOL" action (Employee 3554, 30 seconds)

### Error Handling
- Comprehensive error logging at each step
- Graceful fallbacks for missing data
- User-friendly error messages
- Detailed execution logs for debugging

---

## Integration Points

### Customer Record Fields
- `custentity_generate_and_attach_bols` (Checkbox) - Enable auto-generation
- `custentity_dont_generate_bols` (Multi-select) - SCAC exclusion list

### Item Fulfillment Fields
- `custbody_sps_carrieralphacode` (Text) - SCAC code
- `custbody_requested_bol` (Checkbox) - Processing flag
- `custbody_sps_billofladingnumber` (Text) - BOL number
- `custbody_link_to_bol` (Text) - PDF URL link
- `custbody_sps_ponum_from_salesorder` (Text) - PO number
- `custbody_sps_carrierpronumber` (Text) - Pro Number
- `custbody4` (Text) - Load ID
- `custbody_total_pallets` (Number) - Pallet count
- `custbody_amazon_arn` (Text) - ARN number
- `custbody_ship_from_location` (Select) - Ship-from location

### Related Records
- **SPS Package Records**: Linked to IF via `custrecord_sps_pack_asn`
- **Location Records**: Source of ship-from address
- **Customer Records**: Source of vendor number and exclusion list

---

## Governance Considerations

### Manual Generation (Button)
- Suitelet call: ~15 governance units
- Library function: ~10-20 units per IF
- Total: ~25-35 units per BOL generation

### Automated Generation (Map/Reduce)
- Map/Reduce: Higher governance limits (10,000 units)
- Library function: ~10-20 units per IF
- Can process hundreds of IFs in single execution
- More efficient for bulk processing

---

## Maintenance Notes

### Adding New Fields
1. Update `collectIFData()` in library script
2. Add field to JSON data object
3. Update template to display new field

### Changing Template
1. Create new Advanced PDF/HTML Template
2. Update script parameter `custscript_dsh_bol_template_id`
3. Or modify default in library script

### Modifying Processing Criteria
1. Update search filters in Map/Reduce `getInputData()`
2. Update filter logic in `map()` function
3. Test with sample IFs

---

## Related Documentation

- `README.md` - Deployment instructions and architecture details
- `_dsh_bol_template_new.xml` - Template source code
- Original GBS scripts in `original_GBS_bol_scripts/` folder (reference only)

