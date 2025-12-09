# Pallet Label Template Setup Guide

## Record Type for Advanced PDF/HTML Template

When creating the Advanced PDF/HTML Template in NetSuite, set the **Record Type** to:

### **Item Fulfillment** (`itemfulfillment`)

**Why Item Fulfillment?**
- The pallet label can be generated from either a pallet record OR an Item Fulfillment record
- Item Fulfillment is the more common source (since pallets are typically created from IFs)
- This matches the pattern used by the BOL template
- The template uses a **custom data source** (JSON), so the record type is mainly for organization/grouping in NetSuite

**Note:** Even though the template can work with pallet records, setting it to `itemfulfillment` is recommended because:
1. Most pallet labels are generated in the context of an Item Fulfillment
2. The library script primarily uses IF data
3. It's consistent with other shipping document templates (BOL, Packing Slips)

### Alternative: Custom Record Type

If you want to be more specific, you could also use:
- **Custom Record Type**: `customrecord_pallet` (if you primarily generate from pallet records)

However, **Item Fulfillment is recommended** for maximum flexibility.

## Orientation

### **Landscape** ✅

The template is configured for **Landscape orientation** because:
- Pallet labels are typically wider than they are tall
- The two-column layout (SHIP FROM | SHIP TO) works better in landscape
- Label printers often use landscape orientation for shipping labels
- The SSCC barcode at the bottom needs horizontal space

The template XML includes:
```xml
<body ... orientation="landscape">
```

## Template Settings in NetSuite

When creating the template in NetSuite:

1. **Go to**: Customization → Forms → Advanced PDF/HTML Templates → New
2. **Template ID**: `CUSTTMPL_DSH_PALLET_LABEL`
3. **Name**: "DSH Pallet Label"
4. **Record Type**: Select **Item Fulfillment**
5. **Print Type**: Leave as default (doesn't matter since we use custom data source)
6. **Saved Search**: Not required (we use custom data source)
7. **Copy the XML content** from `_dsh_pallet_label_template.xml`
8. **Save**

## Important Notes

### Custom Data Source
- The template uses a **custom data source** (`JSON`) passed from the library script
- The record type setting in NetSuite is mainly for organization
- Data is accessed via `${JSON.record.fieldName}` in the template
- The template doesn't directly access NetSuite record fields

### Template Access Pattern
```xml
<#if JSON?has_content>
    <#list JSON.record as record>
        ${record.palletName}
        ${record.asin}
        ${record.sscc}
        <!-- etc -->
    </#list>
</#if>
```

### Size Options
The template uses `size="Letter"` with `orientation="landscape"`. You can also use:
- `size="A4"` for A4 paper
- `size="Custom"` with specific dimensions for label printers
- Adjust `padding` values if needed for your label printer

## Testing

After creating the template:
1. Test with a pallet record: `generatePalletLabel(palletId, null, ...)`
2. Test with an IF record: `generatePalletLabel(null, ifId, ...)`
3. Verify the layout matches your label printer requirements
4. Adjust padding/margins if needed for your specific label size

