// Presentation baseline: website analyser app.js downloadExcelMetadataTemplate,
// reviewed at bea89c8 / analyser commit 3ecc71d. Keep this standalone.
export function buildMetadataWorkbook(ExcelJS, snapshot) {
  if (!ExcelJS?.Workbook) throw new Error("The Excel generator did not load. Reload the page and try again; CSV export is also available.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Zheren Lab Plate Layout Builder";
  workbook.subject = `Metadata template for ${snapshot.name} (${snapshot.plateSize}-well plate)`;
  const sheet = workbook.addWorksheet("Plate Metadata", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "well", key: "well", width: 12 }, { header: "strain", key: "strain", width: 22 },
    { header: "condition", key: "condition", width: 26 }, { header: "replicate_id", key: "replicate_id", width: 18 },
    { header: "role", key: "role", width: 16 }, { header: "blank_group", key: "blank_group", width: 20 }
  ];
  // Primitive strings are literal text cells, including numeric-looking IDs,
  // date-like labels and strings starting with '='. No formula objects are used.
  snapshot.rows.forEach(record => sheet.addRow(record));
  sheet.autoFilter = { from: "A1", to: "F1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FF071318" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4FD1C5" } };
  sheet.getRow(1).alignment = { vertical: "middle" };
  sheet.getRow(1).height = 22;
  for (let row = 2; row <= snapshot.plateSize + 1; row += 1) {
    sheet.getCell("E" + row).dataValidation = { type: "list", allowBlank: true,
      formulae: ['"sample,blank,control,unused"'], showErrorMessage: true, errorStyle: "stop",
      errorTitle: "Invalid role", error: "Choose sample, blank, control, or unused." };
  }
  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 20 }, { width: 62 }, { width: 30 }];
  // Preserve all eight source rows, their terminology and their examples.
  instructions.addRows([
    ["Metadata template", "For the currently selected " + snapshot.plateSize + "-well plate. You may leave wells without metadata blank.", ""],
    ["Column", "Description", "Example"],
    ["well", "Plate well identifier. Pre-filled; do not duplicate wells.", "A1"],
    ["strain", "Biological strain or sample identity. Wells with the same strain and condition can later be grouped for summary plots such as mean +/- SD.", "WT"],
    ["condition", "Experimental growth condition. Together with strain, this defines the sample group for downstream averaging and comparison.", "M9 + glucose"],
    ["replicate_id", "Identifier for an individual replicate within the same strain and condition. Use simple labels such as 1, 2, 3.", "1"],
    ["role", "Choose exactly one of sample, blank, control, or unused. Use the dropdown in the Plate Metadata sheet.", "sample"],
    ["blank_group", "Links sample wells to the blank wells used for background correction. Sample and blank wells that should be matched must use exactly the same blank-group name.", "M9_glucose"]
  ]);
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: "FF4FD1C5" } };
  instructions.getRow(2).font = { bold: true, color: { argb: "FF071318" } };
  instructions.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4FD1C5" } };
  instructions.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  // Short usage notes follow the unchanged template, in its same three columns.
  instructions.addRows([
    [],
    ["Analyser import", `Select the matching ${snapshot.plateSize}-well layout in Growth Curve Analyser before importing this file.`, ""],
    ["Full-plate metadata", "This file contains every plate well. Import replaces metadata for listed wells; a well-only row clears previous metadata.", ""],
    ["Replicate numbering", "Sample, control and blank wells use simple replicate IDs such as 1, 2, 3. Unused and unassigned wells have no replicate ID.", "1, 2, 3"],
    ["Blank matching", "Sample and control wells must use exactly the same blank_group as their matching blanks. Names are case-sensitive. No blank correction remains available in the analyser.", "M9_glucose"],
    ["Unused / unassigned", "Unused wells have role unused and otherwise empty metadata. Unassigned wells have only the well identifier; all five metadata fields are empty.", "unused"]
  ]);
  return workbook;
}
