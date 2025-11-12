# BOL (Bill of Lading) Generation Project

## Overview
This project contains scripts for generating single BOL (Bill of Lading) PDFs from Item Fulfillment records and attaching them directly to the IF. The solution supports both **button-triggered** (via Suitelet) and **scheduled** (automated) BOL generation.

## Architecture

### Library Script Pattern
All BOL generation logic is centralized in a **Library Script** that can be called by multiple script types:

```
┌─────────────────┐
│  Client Script  │ (Button on IF record)
│  (_dsh_cs_...)  │
└────────┬────────┘
         │ HTTP Request
         ↓
┌─────────────────┐
│    Suitelet     │ (Handles HTTP requests)
│  (_dsh_sl_...)  │
└────────┬────────┘
         │ Direct Function Call
         ↓
┌─────────────────┐
│  Library Script │ (Shared BOL logic)
│  (_dsh_lib_...) │
└────────┬────────┘
         │
         ↓
    BOL Generated & Attached

┌─────────────────┐
│Scheduled Script │ (Automated processing)
│  (_dsh_sch_...) │
└────────┬────────┘
         │ Direct Function Call (no HTTP!)
         ↓
┌─────────────────┐
│  Library Script │ (Same shared logic)
│  (_dsh_lib_...) │
└─────────────────┘
```

## File Structure

### Core Scripts

#### `_dsh_lib_bol_generator.js` - **Library Script** ⭐
- **Type**: Module/Utility Script (no script type - just a reusable module)
- **Purpose**: Contains all shared BOL generation logic
- **Used By**: Suitelet and Scheduled Script
- **Key Functions**:
  - `generateAndAttachBOL(ifId, pdfFolderId, templateId)` - Main function
  - `collectIFData(ifIdArr)` - Collects data from IF
  - `renderBolPdf(jsonData, ifId, pdfFolderId, templateId)` - Generates PDF
  - `updateIFFields(ifId, jsonData)` - Updates IF record fields
- **Upload Location**: Customization → Scripting → Scripts → New → Script Type: **Suitelet** (or RESTlet - doesn't matter, won't be deployed)

#### `_dsh_sl_single_bol_generate.js` - **Suitelet**
- **Type**: Suitelet
- **Purpose**: HTTP endpoint for button-triggered BOL generation
- **Called By**: Client Script (button click)
- **Calls**: Library Script
- **Upload Location**: Customization → Scripting → Scripts → New → Script Type: **Suitelet**
- **Deployment**: 
  - Script ID: `customscript_dsh_sl_single_bol`
  - Deployment ID: `customdeploy_dsh_sl_single_bol`
  - Parameters:
    - `custscript_dsh_bol_folder_id` (Number) - File cabinet folder ID for PDFs
    - `custscript_dsh_bol_template_id` (Text) - Advanced PDF/HTML Template ID (optional)

#### `_dsh_cs_single_bol_button.js` - **Client Script**
- **Type**: Client Script
- **Purpose**: Adds "Generate BOL" button to IF record and handles button click
- **Calls**: Suitelet via HTTP (fetch API)
- **Upload Location**: File Cabinet (same folder as other scripts)
- **Note**: This file is referenced by the User Event script, not deployed as a standalone script

#### `_dsh_ue_if_bol_button.js` - **User Event Script**
- **Type**: User Event Script
- **Purpose**: Adds "Generate BOL" button to Item Fulfillment form
- **Deployed On**: Item Fulfillment record
- **Upload Location**: Customization → Scripting → Scripts → New → Script Type: **User Event Script**
- **Deployment**: 
  - Record Type: Item Fulfillment
  - Event: beforeLoad (View mode only)

#### `_dsh_sch_bol_scheduled.js` - **Scheduled Script** ⭐
- **Type**: Scheduled Script
- **Purpose**: Automated BOL generation for multiple IFs
- **Calls**: Library Script directly (no HTTP)
- **Upload Location**: Customization → Scripting → Scripts → New → Script Type: **Scheduled Script**
- **Deployment**:
  - Script ID: `customscript_dsh_sch_bol_scheduled`
  - Parameters:
    - `custscript_dsh_bol_folder_id` (Number) - File cabinet folder ID
    - `custscript_dsh_bol_template_id` (Text) - Template ID (optional)
- **Schedule**: Set up in Script Deployment → Scheduling tab

### Example/Reference Files

#### `_dsh_sch_bol_example_https.js` - **Example (Not Recommended)**
- **Type**: Scheduled Script (example)
- **Purpose**: Shows how to call Suitelet via HTTP (inefficient)
- **Status**: Reference only - do not deploy
- **Why Not Recommended**: Uses extra governance units, network overhead

### Original Scripts (Reference)

#### `original_bol_scripts/` folder
Contains the original consolidated BOL scripts for reference:
- `_gbs_aw_consolidated_bol.js` - Suitelet (AW version)
- `_gbs_sl_consolidated_bol.js` - Suitelet (SL version)
- `_gbs_ue_consolidated_bol.js` - User Event (PDF generation)
- `_gbs_sch_consolidated_bol.js` - Scheduled Script

**Note**: These are for reference only. The new single BOL scripts use a different, simpler architecture.

### Documentation

- `BOL_Document_Generation_Pattern.md` - Explains document generation patterns
- `CONSOLIDATED_vs_SINGLE_BOL_Comparison.md` - Compares consolidated vs single BOL
- `CREATE_BOL_TEMPLATE.md` - Guide for creating Advanced PDF/HTML Templates

## Deployment Steps

### 1. Upload Library Script ⚠️ CRITICAL
1. Go to **Customization → Scripting → Scripts → New**
2. Script Type: **Suitelet** (or RESTlet - doesn't matter, it won't be deployed)
3. Upload `_dsh_lib_bol_generator.js`
4. **Save** (do NOT deploy - library scripts are just modules, not deployed scripts)
5. **Note the Script ID** - it will be something like `customscript_dsh_lib_bol_generator`
6. **Important**: 
   - Library scripts must be uploaded to NetSuite for other scripts to import them
   - The relative path `'./_dsh_lib_bol_generator'` works if the file is in the same File Cabinet folder
   - If you get "is not a function" errors, verify the library script is uploaded and the file path matches

### 2. Upload Suitelet
1. Go to **Customization → Scripting → Scripts → New**
2. Script Type: **Suitelet**
3. Upload `_dsh_sl_single_bol_generate.js`
4. **Deploy**:
   - Create new deployment
   - Set Script ID: `customscript_dsh_sl_single_bol`
   - Set Deployment ID: `customdeploy_dsh_sl_single_bol`
   - Add parameters:
     - `custscript_dsh_bol_folder_id` (Number) - Default: 1373
     - `custscript_dsh_bol_template_id` (Text) - Default: `CUSTTMPL_DSH_SVC_BOL`
   - Status: Testing/Released

### 3. Upload Client Script to File Cabinet
1. Go to **Documents → Files → File Cabinet**
2. Navigate to your scripts folder (e.g., `SuiteScripts/Jool/BOL/`)
3. Upload `_dsh_cs_single_bol_button.js`
4. **Note**: This file is referenced by the User Event script, not deployed separately

### 4. Upload User Event Script
1. Go to **Customization → Scripting → Scripts → New**
2. Script Type: **User Event Script**
3. Upload `_dsh_ue_if_bol_button.js`
4. **Deploy**:
   - Create new deployment
   - Record Type: **Item Fulfillment**
   - Event: **beforeLoad**
   - Status: Testing/Released
   - **Important**: The script references the Client Script file path - ensure it matches your file cabinet location

### 5. Upload Scheduled Script (Optional)
1. Go to **Customization → Scripting → Scripts → New**
2. Script Type: **Scheduled Script**
3. Upload `_dsh_sch_bol_scheduled.js`
4. **Deploy**:
   - Create new deployment
   - Add parameters (same as Suitelet)
   - Set schedule in **Scheduling** tab
   - Status: Testing/Released

## How It Works

### Button Flow (User-Triggered)
1. User views Item Fulfillment record
2. User Event script adds "Generate BOL" button
3. User clicks button
4. Client Script calls Suitelet via HTTP
5. Suitelet calls Library Script function
6. Library Script:
   - Collects IF data
   - Generates PDF using Advanced PDF/HTML Template
   - Attaches PDF to IF record
   - Updates IF fields (BOL Number, etc.)
7. Suitelet returns JSON response
8. Client Script shows success/error message
9. Page reloads to show attached PDF

### Scheduled Flow (Automated)
1. Scheduled Script runs on schedule
2. Searches for IFs without BOL (empty `custbody_sps_billofladingnumber`)
3. For each IF:
   - Calls Library Script function directly
   - Library Script generates and attaches BOL
4. Logs success/error counts

## Key Differences: Button vs Scheduled

| Aspect | Button (Suitelet) | Scheduled Script |
|--------|------------------|------------------|
| **Trigger** | User clicks button | Automated schedule |
| **Method** | HTTP request | Direct function call |
| **Governance** | ~15 units per call | ~2 units per call |
| **Speed** | Network latency | Instant |
| **Code** | Suitelet + Library | Library only |

## Advanced PDF/HTML Template

The BOL PDF is generated using NetSuite's Advanced PDF/HTML Template system:
- **Template ID**: `CUSTTMPL_DSH_SVC_BOL` (default)
- **Location**: Customization → Forms → Advanced PDF/HTML Templates
- **Data Source**: Library script passes `jsonData` object to template
- **Template Access**: `${JSON.record.fieldName}` in template

See `CREATE_BOL_TEMPLATE.md` for creating custom templates.

## Script Parameters (For Future Customization)

Both the Suitelet and Scheduled Script support the following deployment parameters that can be configured without code changes:

### Available Parameters:
1. **`custscript_dsh_bol_folder_id`** (Number)
   - **Purpose**: File cabinet folder ID where BOL PDFs are stored
   - **Default**: `1373`
   - **Usage**: Change this to store PDFs in a different folder

2. **`custscript_dsh_bol_template_id`** (Text)
   - **Purpose**: Advanced PDF/HTML Template ID to use for BOL generation
   - **Default**: `CUSTTMPL_DSH_SVC_BOL`
   - **Usage**: 
     - Use different templates for different customers/locations
     - Create template variations and switch via parameter
     - Test new templates without code changes

### How to Use Parameters:
1. Go to the script deployment (Suitelet or Scheduled Script)
2. Navigate to **Parameters** tab
3. Add/edit parameter values
4. Save deployment
5. Script will use new values on next execution

**Note**: Parameters are optional - if not provided, defaults are used. This allows for easy customization without modifying code.

## Troubleshooting

### Button Not Showing
- Check User Event script is deployed to Item Fulfillment
- Verify Client Script file path in User Event matches file cabinet location
- Check script logs for errors

### PDF Not Generating
- Verify Advanced PDF/HTML Template ID is correct
- Check template exists and is active
- Review script logs for template errors
- Verify IF has required data (packages, addresses, etc.)

### Scheduled Script Not Running
- Check script deployment status
- Verify schedule is set correctly
- Review execution logs
- Check governance limits

## Future Enhancements

- [ ] Add ship from address logic (currently placeholder)
- [ ] Support for consolidated BOLs
- [ ] Custom template selection per customer
- [ ] Email BOL PDF to customer
- [ ] Batch processing with progress tracking

## Related Scripts

- Original consolidated BOL scripts: `original_bol_scripts/`
- Auto Pack IFs: `../Auto Pack IFs/`
- SPS Scripts: `../SPS Scripts/`

