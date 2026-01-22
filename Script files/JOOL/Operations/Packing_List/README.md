# Packing List Templates

Advanced PDF/HTML templates for generating packing slip documents.

## Overview

Templates for creating packing slip PDFs that can be attached to Item Fulfillment records or printed for shipping.

## Templates

### `packing_slip_template_original.xml`
- **Type**: Advanced PDF/HTML Template
- **Purpose**: Original packing slip template
- **Usage**: Standard packing slip format

### `packing_slip_template_with_rick_roll.xml`
- **Type**: Advanced PDF/HTML Template
- **Purpose**: Packing slip template with custom content
- **Usage**: Modified version with additional content

## Features

- **PDF Generation**: Uses NetSuite's Advanced PDF/HTML Template system
- **Customizable**: XML-based templates can be modified in NetSuite
- **Data Binding**: Templates can access Item Fulfillment record data
- **Print Ready**: Templates generate print-ready PDF documents

## Usage

1. Upload template to NetSuite: Customization → Forms → Advanced PDF/HTML Templates
2. Reference template ID in scripts that generate packing slips
3. Templates receive data from Item Fulfillment records
4. PDFs can be attached to records or printed

## Related Scripts

- BOL Templates: `../BOL/_dsh_bol_template_new.xml`

