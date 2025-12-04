define(["require", "exports"], function (require, exports) {
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.labelOverrideObj = void 0;
    exports.labelOverrideObj = {
        // Walmart Shipping Label Walmart SSCC14 NON DSDC
        19625: {
            FieldOverrides: {
                trackingNumber: 'GTIN',
            },
        },
        // Joanna Stores Label
        13117: {
            FieldOverrides: {
                innerPack: 'InnerPack',
            },
        },
        // Lidl Shipping Label
        16825: {
            FieldFormat: {
                SellByDate: 'YYMMDD',
            },
        },
    };
});
