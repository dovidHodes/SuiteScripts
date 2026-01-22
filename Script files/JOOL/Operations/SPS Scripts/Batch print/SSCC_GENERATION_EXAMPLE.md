# SSCC Label ID Generation - Step-by-Step Example

## Example Scenario

Let's trace through a real example:

**Input Values:**
- Package ID (`spsPackageId`): `12345`
- Manufacturer ID (`mfgId`): `1234567` (7 digits)
- Extension Digit: `0` (from customer record, defaults to '0')
- Offset (`custrecord_uccuid`): `1000` (static configuration value)

## Step-by-Step Generation Process

### Step 1: Get Extension Digit
- Source: Customer record field `custentity_sps_sscc_ext_digit`
- Result: `"0"` (default if not set)

### Step 2: Get Manufacturer ID
- Source: `customrecord_sps_label_access` record → `custrecord_sps_label_login_mfgid`
- Or override: `customrecord_sps_man_id_override` → `custrecord_sps_man_id_override`
- Result: `"1234567"`

### Step 3: Get Offset (STATIC VALUE)
- Source: `customrecord_sps_label_access` record → `custrecord_uccuid`
- Or override: `customrecord_sps_man_id_override` → `custrecord_sps_ucc_label_offset_override`
- **This is a STATIC configuration value** - it does NOT increment automatically
- Purpose: Bridge gap between NetSuite and SPS Fulfillment systems
- Result: `1000`

### Step 4: Calculate Base Number
```javascript
packId = 12345
offset = 1000
packMaxLen = 16 - mfgId.length  // 16 - 7 = 9
labelLimitModulo = Math.pow(10, 9)  // 1,000,000,000
uccId = ((12345 + 1000) % 1000000000).toString()
// Result: "13345"
```

### Step 5: Build Prefix (Extension Digit + Manufacturer ID)
```javascript
extensionDigit = "0"
mfgId = "1234567"
uccBase = "0" + "1234567"  // Result: "01234567"
```

### Step 6: Pad the Number to Reach 17 Digits Total
```javascript
// We need: uccBase.length + uccId.length = 17
// Current: 8 + 5 = 13
// Need to pad: 17 - 13 = 4 zeros

uccId = "0000" + "13345"  // Result: "000013345"
```

### Step 7: Combine Base + Number
```javascript
uccFinal = "01234567" + "000013345"  // Result: "01234567000013345" (17 digits)
```

### Step 8: Calculate Check Digit
```javascript
// Algorithm: Sum digits in odd/even positions, apply formula
uccArr = [0, 0]
// Loop through each digit:
// Position 0 (odd): 0 → uccArr[1] += 0
// Position 1 (even): 1 → uccArr[0] += 1
// Position 2 (odd): 2 → uccArr[1] += 2
// ... (continues for all 17 digits)

// After summing all digits:
// uccArr[0] = sum of even positions
// uccArr[1] = sum of odd positions

checkDigit = (10 - (uccArr[1] * 3 + uccArr[0] - 10 * Math.floor((uccArr[1] * 3 + uccArr[0]) / 10))).toString()
// If result is '10', use '0'
// Example result: "7"
```

### Step 9: Final SSCC (18 digits)
```javascript
uccChecked = "01234567000013345" + "7"  // Result: "012345670000133457"
```

## Understanding the Offset

### What is the Offset?
The offset is a **static configuration value** stored in:
- `customrecord_sps_label_access` → `custrecord_uccuid`
- Can be overridden per customer in `customrecord_sps_man_id_override` → `custrecord_sps_ucc_label_offset_override`

### Why Use an Offset?
1. **Bridge Gap**: Helps align NetSuite's Package IDs with SPS Fulfillment's numbering system
2. **Avoid Collisions**: Prevents duplicate SSCCs if both systems are generating IDs
3. **Flexibility**: Allows manual adjustment without changing Package IDs

### Important Notes:
- **NOT auto-incremented**: The offset value is manually configured and remains static
- **Package ID drives uniqueness**: Since Package IDs increment as packages are created, the SSCC naturally increments
- **Modulo wrapping**: The `% labelLimitModulo` ensures the number stays within valid range (prevents overflow)

## Example with Different Package IDs

| Package ID | Offset | Calculation | Result (before check digit) |
|------------|--------|-------------|------------------------------|
| 12345 | 1000 | (12345 + 1000) % 1000000000 = 13345 | 01234567000013345 |
| 12346 | 1000 | (12346 + 1000) % 1000000000 = 13346 | 01234567000013346 |
| 12347 | 1000 | (12347 + 1000) % 1000000000 = 13347 | 01234567000013347 |

Notice: The Package ID increments, so the SSCC increments naturally!

