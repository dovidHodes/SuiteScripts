# Pallet Label Suitelet - Execution Flow

## What Happens When You Call the Suitelet

### URL Call
```
GET /app/site/hosting/scriptlet.nl?script=customscript_dsh_sl_pallet_label&deploy=customdeploy_dsh_sl_pallet_label&palletid=123
```

## Step-by-Step Execution Flow

### 1. Suitelet Receives Request
- **Method Check**: Verifies it's a GET request
- **Parameter Extraction**: Gets `palletid` from URL parameters
- **Validation**: Checks if `palletid` is provided
  - If missing → Returns error JSON: `{"success": false, "error": "Pallet ID is required"}`

### 2. Get Script Parameters
- Reads `custscript_dsh_pallet_label_folder_id` (default: 1373)
- Reads `custscript_dsh_pallet_label_template_id` (default: `CUSTTMPL_DSH_PALLET_LABEL`)

### 3. Call Library Function
Calls `palletLabelLib.generatePalletLabel()` with:
- `palletId`: From URL parameter
- `ifId`: `null` (not used when palletId provided)
- `pdfFolderId`: From script parameter or default
- `templateId`: From script parameter or default
- `options`: `{ attachToRecord: true }`

### 4. Library Function: Collect Pallet Data
The library function `collectPalletData(palletId)` does:

#### 4a. Load Pallet Record
- Loads `customrecord_asn_pallet` record
- Gets pallet name and parent IF ID (`custrecord_parent_if`)

#### 4b. Load Parent IF Data (if available)
- Loads Item Fulfillment record
- Gets:
  - Transaction ID
  - PO Number (`custbody_sps_ponum_from_salesorder`)
  - Customer name
  - Ship-to address (company, address1, city, state, zip, country)
  - Ship-from location
  - Carrier info (BOL #, PRO #, ARN)

#### 4c. Get Packages on Pallet
- Searches `customrecord_sps_package` records
- Filters: `custrecord_parent_pallet = palletId`
- Gets package IDs, names, and weights

#### 4d. Get ASIN from Package Content
- Gets first package content record
- Loads item record
- Gets ASIN from item (`custitem_asin` or `upccode`)

#### 4e. Calculate Pallet Numbers
- Searches all pallets for the parent IF
- Calculates: `palletNumber` (this pallet's position) and `totalPallets`

#### 4f. Generate SSCC
- Gets SSCC from pallet record field or generates from pallet ID

#### 4g. Build Data Structure
Creates JSON object with all data needed for template:
```javascript
{
  palletId: "123",
  palletName: "Pallet 1 - IF 456",
  palletNumber: 1,
  totalPallets: 3,
  asin: "B001234567",
  packages: [...],
  packageCount: 15,
  cartonCount: 15,
  totalWeight: "125.50",
  ifId: "456",
  ifTranId: "IF-001",
  poNumber: "PO-12345",
  customerName: "ABC Company",
  shipToAddress: {...},
  shipFromAddress: {...},
  locationName: "Main Warehouse",
  bolNumber: "654321",
  proNumber: "123456789",
  arnNumber: "98765431",
  sscc: "(00) 012345678101112131"
}
```

### 5. Library Function: Render PDF
The library function `renderPalletLabelPdf()` does:

#### 5a. Create Renderer
- Creates NetSuite render object
- Sets template by Script ID (`CUSTTMPL_DSH_PALLET_LABEL`)

#### 5b. Add Custom Data Source
- Adds data with alias `record` (not `JSON`)
- Structures data to match pallet record field names:
  ```javascript
  {
    id: palletId,
    name: palletName,
    custrecord_pallet_index: palletNumber,
    custrecord_total_pallet_count: totalPallets,
    custrecord_items: asin,
    custrecord_parent_if: {
      id: ifId,
      tranid: ifTranId,
      custbody_sps_ponum_from_salesorder: poNumber,
      shipcompany: "...",
      shipaddr1: "...",
      shipcity: "...",
      shipstate: "...",
      shipzip: "...",
      custbody_sps_billofladingnumber: bolNumber,
      custbody_sps_carrierpronumber: proNumber,
      custbody_amazon_arn: arnNumber,
      custbody_ship_from_location: {
        name: locationName,
        mainaddress_text: "..."
      }
    }
  }
  ```

#### 5c. Render PDF
- Calls `renderer.renderAsPdf()`
- Template processes data and generates PDF
- PDF is saved to File Cabinet folder (default: 1373)
- File name: `PalletLabel_<pallet_name>.pdf`
- Returns File ID

### 6. Library Function: Attach PDF
- Attaches PDF file to pallet record (`customrecord_asn_pallet`)
- PDF appears in Files tab of pallet record

### 7. Library Function: Get PDF URL
- Loads file record
- Generates full URL to PDF
- Returns in result object

### 8. Suitelet: Return Response

#### If Success:
- **With Redirect** (`&redirect=T`):
  - Returns HTML page that redirects to pallet record
  - User sees pallet record with PDF attached
  
- **Without Redirect**:
  - Returns JSON:
    ```json
    {
      "success": true,
      "fileId": "789",
      "pdfUrl": "https://...",
      "message": "Pallet label PDF generated successfully"
    }
    ```

#### If Error:
- **With Redirect**:
  - Still redirects to pallet record (but PDF not attached)
  
- **Without Redirect**:
  - Returns JSON:
    ```json
    {
      "success": false,
      "error": "Error message here"
    }
    ```

## Complete Flow Diagram

```
User/System calls Suitelet URL
    ↓
Suitelet receives GET request
    ↓
Extract palletid parameter
    ↓
Get script parameters (folder ID, template ID)
    ↓
Call library: generatePalletLabel(palletId, ...)
    ↓
Library: collectPalletData(palletId)
    ├─ Load pallet record
    ├─ Load parent IF record
    ├─ Search packages on pallet
    ├─ Get ASIN from package content
    ├─ Calculate pallet numbers
    └─ Build JSON data structure
    ↓
Library: renderPalletLabelPdf(jsonData, ...)
    ├─ Create renderer
    ├─ Set template by Script ID
    ├─ Add custom data source (alias: 'record')
    ├─ Render PDF
    └─ Save PDF to File Cabinet
    ↓
Library: Attach PDF to pallet record
    ↓
Library: Get PDF URL
    ↓
Library: Return result object
    ↓
Suitelet: Check redirect parameter
    ├─ If redirect=T → Return HTML redirect
    └─ If no redirect → Return JSON response
    ↓
Done!
```

## Data Flow in Template

The template receives data structured like a pallet record:

```xml
<#if record?has_content>
  ${record.name}                                    <!-- Pallet name -->
  ${record.custrecord_pallet_index}                <!-- Pallet number -->
  ${record.custrecord_total_pallet_count}         <!-- Total pallets -->
  ${record.custrecord_items}                       <!-- ASIN -->
  ${record.custrecord_parent_if.shipaddr1}        <!-- Ship-to address -->
  ${record.custrecord_parent_if.custbody_sps_ponum_from_salesorder} <!-- PO -->
  ${record.custrecord_parent_if.custbody_sps_billofladingnumber}   <!-- BOL -->
  ${record.custrecord_parent_if.custbody_sps_carrierpronumber}      <!-- PRO -->
  ${record.custrecord_parent_if.custbody_amazon_arn}                <!-- ARN -->
</#if>
```

## Key Points

1. **Single Parameter**: Only needs `palletid` - everything else is derived
2. **Automatic Data Collection**: Library automatically gets all related data (IF, packages, items, etc.)
3. **PDF Attachment**: PDF is automatically attached to pallet record
4. **Template Access**: Template uses pallet record field structure with IF fields via `custrecord_parent_if.fieldname`
5. **Redirect Support**: Can redirect back to pallet record after generation

