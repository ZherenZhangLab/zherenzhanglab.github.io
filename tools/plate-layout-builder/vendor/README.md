# Excel workbook dependency

ExcelJS **4.4.0**, matching the current website Growth Curve Analyser's template
generator. `exceljs-4.4.0.min.js` is the unmodified npm distribution browser bundle;
its MIT license is in `ExcelJS-LICENSE.txt`.

SHA-256: `7e49da68588e250dbb8bba190d2caa8ab3787cc0284bda1d8b2f805c4df742c9`.

Reproduce with `npm ci --ignore-scripts` then `npm run vendor:exceljs` from the
project directory. This vendored asset lets XLSX generation work without a CDN.
SheetJS 0.18.5 is a development-only reader for compatibility tests, matching the
analyser's reader. No experimental metadata leaves the browser.
