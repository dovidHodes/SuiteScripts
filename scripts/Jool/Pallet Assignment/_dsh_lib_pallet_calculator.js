/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description Library script to calculate optimal pallet assignments from packages
 * 
 * This library provides a pure calculation function that:
 * - Takes packages and item UPP (units per pallet) values
 * - Calculates optimal pallet assignments (minimize pallets, items can share)
 * - Returns pallet assignment structure
 * 
 * This is designed to be swappable - you can replace this implementation
 * with API calls or other calculation logic without changing callers.
 * 
 * @param {Array} packages - Array of package objects with:
 *   - packageId: string - Package record ID
 *   - packageQty: number - Quantity in this package/carton
 *   - contentId: string - Package content record ID
 *   - itemId: string - Item ID for this package
 * 
 * @param {Object} itemUPP - Map of itemId to units per pallet (UPP)
 *   Format: {itemId: upp}
 * 
 * @returns {Array} Array of pallet assignment objects:
 *   - palletId: null (will be set by caller)
 *   - packageIds: Array of package IDs on this pallet
 *   - contentIds: Array of content IDs on this pallet
 *   - usage: number - Percentage of pallet capacity used (0-100)
 *   - items: Array of {itemId, quantity, cartons}
 *   - totalCartons: number - Total carton count for this pallet
 */

define([
  'N/log'
], function (log) {
  
  /**
   * Calculate optimal pallet assignments
   * Items can share pallets, minimize total pallets
   * 
   * @param {Array} packages - Array of package objects
   * @param {Object} itemUPP - Map of itemId to units per pallet
   * @returns {Array} Array of pallet assignment objects
   */
  function calculatePalletAssignments(packages, itemUPP) {
    // Step 1: Group packages and pre-calculate max cartons per pallet (CPP)
    var packagesByItem = {};
    var maxCppByItem = {};        // SKU → max cartons per pallet
    var percentPerCarton = {};    // SKU → % of pallet one carton uses

    packages.forEach(function(pkg) {
      if (!packagesByItem[pkg.itemId]) packagesByItem[pkg.itemId] = [];
      packagesByItem[pkg.itemId].push(pkg);

      if (!maxCppByItem[pkg.itemId]) {
        var upp = itemUPP[pkg.itemId] || 0;
        var cartonQty = pkg.packageQty;
        var maxCpp = upp > 0 ? Math.floor(upp / cartonQty) : 1;
        maxCpp = Math.max(maxCpp, 1);

        maxCppByItem[pkg.itemId] = maxCpp;
        percentPerCarton[pkg.itemId] = 100.0 / maxCpp;  // Key!
      }
    });

    // Step 2: Sort items by "difficulty" (total % needed) — hardest first
    var sortedItemIds = Object.keys(packagesByItem).sort(function(a, b) {
      var totalPercentA = packagesByItem[a].length * percentPerCarton[a];
      var totalPercentB = packagesByItem[b].length * percentPerCarton[b];
      return totalPercentB - totalPercentA;  // descending
    });

    // Step 3: Pallets array
    var pallets = [];  // each: { packages: [], usage: 0.0, itemCounts: {} }

    // Step 4: Place each carton using First-Fit with % capacity
    sortedItemIds.forEach(function(itemId) {
      var itemPackages = packagesByItem[itemId];
      var percentPer = percentPerCarton[itemId];
      var maxCpp = maxCppByItem[itemId];

      itemPackages.forEach(function(pkg) {
        var placed = false;

        // Try to place on existing pallets (First-Fit)
        for (var i = 0; i < pallets.length; i++) {
          var pallet = pallets[i];
          var currentCount = (pallet.itemCounts[itemId] || 0);

          // Check both: per-item limit AND total % capacity
          if (currentCount < maxCpp && 
              (pallet.usage + percentPer) <= 100.0) {   // This is the magic line

            pallet.packages.push(pkg);
            pallet.itemCounts[itemId] = currentCount + 1;
            pallet.usage += percentPer;
            placed = true;
            break;
          }
        }

        // No existing pallet has space → create new
        if (!placed) {
          pallets.push({
            packages: [pkg],
            itemCounts: { [itemId]: 1 },
            usage: percentPer
          });
        }
      });
    });

    // Log pallet usage after assignment
    for (var i = 0; i < pallets.length; i++) {
      var pal = pallets[i];
      log.audit('Pallet ' + (i + 1), 
        'Usage: ' + pal.usage.toFixed(2) + '% | Packages: ' + pal.packages.length);
    }
    
    // Convert to return format (preserve usage for later logging)
    return pallets.map(function(pal, idx) {
      // Calculate item summary for this pallet
      var itemsOnPallet = {};
      var totalCartons = pal.packages.length;
      
      // Group packages by item and calculate quantities
      pal.packages.forEach(function(pkg) {
        var itemId = pkg.itemId;
        if (!itemsOnPallet[itemId]) {
          itemsOnPallet[itemId] = {
            itemId: itemId,
            quantity: 0,
            cartons: 0
          };
        }
        itemsOnPallet[itemId].quantity += pkg.packageQty;
        itemsOnPallet[itemId].cartons += 1;
      });
      
      // Convert to array
      var itemsArray = [];
      for (var itemId in itemsOnPallet) {
        itemsArray.push(itemsOnPallet[itemId]);
      }
      
      return {
        palletId: null,
        packageIds: pal.packages.map(function(p) { return p.packageId; }),
        contentIds: pal.packages.map(function(p) { return p.contentId; }),
        usage: pal.usage,  // Preserve usage percentage
        items: itemsArray,  // Array of {itemId, quantity, cartons}
        totalCartons: totalCartons  // Total carton count for this pallet
      };
    });
  }
  
  return {
    calculatePalletAssignments: calculatePalletAssignments
  };
  
});

