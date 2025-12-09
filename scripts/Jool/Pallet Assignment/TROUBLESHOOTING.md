# Pallet Assignment Troubleshooting

## Issue: Only 1 Pallet Created Instead of 3

### Possible Causes

1. **Calculation Logic Issue**
   - The `calculateOptimalPallets` function might be calculating only 1 pallet
   - Check execution logs for "Pallet Calculation Complete" to see how many pallets were calculated
   - Verify packages are being found and have correct UPP values

2. **Package Data Issue**
   - Packages might not be found for the IF
   - UPP (units per pallet) values might be very high, causing everything to fit on 1 pallet
   - Check execution logs for "Packages Found" message

3. **Pallet Creation Loop Issue**
   - Check if there are errors in the pallet creation loop
   - Look for "Create Pallet Error" messages in logs
   - Verify all pallets are being created (check "Pallet Creation Complete" log)

### Debugging Steps

1. **Check Execution Logs**
   - Go to System → Monitoring → Execution Log
   - Search for your script execution
   - Look for these key log messages:
     - "Pallet Calculation Complete" - Shows how many pallets were calculated
     - "Starting Pallet Creation" - Shows how many pallets will be created
     - "Pallet Created" - Shows each pallet as it's created
     - "Pallet Creation Complete" - Shows how many were actually created

2. **Verify Package Count**
   - Check log for "Packages Found" message
   - Should show the number of packages found for the IF
   - If 0 packages, that's the problem

3. **Check UPP Values**
   - Verify items have correct UPP (units per pallet) values
   - If UPP is too high, everything might fit on 1 pallet
   - Check logs for "No UPP" errors

4. **Check for Errors**
   - Review `result.errors` array in the response
   - Check execution logs for any error messages
   - Look for "Create Pallet Error" messages

## Issue: Map/Reduce Script Never Triggered

### Possible Causes

1. **MR Script ID Mismatch**
   - Current hardcoded ID: `customscript_assign_packages_to_pallets`
   - Deployment ID: `customdeploy1`
   - **Verify these match your actual MR script IDs in NetSuite**

2. **MR Script Not Deployed**
   - Check if the MR script is deployed and active
   - Verify deployment ID exists

3. **Error in MR Trigger**
   - Check execution logs for "Map/Reduce Trigger Error"
   - Look for "MAP_REDUCE_ALREADY_RUNNING" warnings
   - Check if task.create() is failing silently

4. **No Pallet Assignments**
   - If `palletAssignments.length === 0`, MR won't be triggered
   - Check "Pallet Calculation Complete" log

### Debugging Steps

1. **Check MR Trigger Logs**
   - Look for "Triggering Map/Reduce" log message
   - Should show number of pallet assignments
   - Look for "MR batch X submitted" messages
   - Check for "Map/Reduce Trigger Error" messages

2. **Verify MR Script IDs**
   - Go to the MR script in NetSuite
   - Note the actual Script ID and Deployment ID
   - Update `_dsh_lib_calculate_and_assign_pallets.js` line 542-543:
     ```javascript
     var mrScriptId = 'customscript_assign_packages_to_pallets'; // UPDATE THIS
     var mrDeployId = 'customdeploy1'; // UPDATE THIS
     ```

3. **Check MR Script Parameter**
   - The MR script needs a parameter field named `json` (becomes `custscriptjson`)
   - Go to MR script deployment → Parameters tab
   - Add parameter:
     - Field ID: `json`
     - Type: Free-Form Text
     - Default: (leave blank)

4. **Check Task Queue**
   - Go to System → Monitoring → Scheduled Scripts
   - Look for tasks with script ID matching your MR script
   - Check if tasks are queued but not running

## Quick Fix: Update MR Script IDs

If the MR script IDs are wrong, update them in the library:

```javascript
// Line 542-543 in _dsh_lib_calculate_and_assign_pallets.js
var mrScriptId = 'customscript_dsh_mr_assign_pallets'; // Your actual script ID
var mrDeployId = 'customdeploy_dsh_mr_assign_pallets'; // Your actual deployment ID
```

## Common Issues

### Issue: Only 1 Pallet Created
**Check:**
- Execution logs for "Pallet Calculation Complete" - how many calculated?
- Package count - are all packages being found?
- UPP values - are they correct for the items?

### Issue: MR Never Triggered
**Check:**
- Execution logs for "Triggering Map/Reduce" message
- MR script IDs match actual script/deployment IDs
- MR script has `json` parameter field in deployment
- No errors in "Map/Reduce Trigger Error" logs

### Issue: MR Triggered But Not Running
**Check:**
- Scheduled Scripts queue - is task queued?
- MR script deployment status - is it active?
- MR script parameter field exists
- Check MR script execution logs for errors

