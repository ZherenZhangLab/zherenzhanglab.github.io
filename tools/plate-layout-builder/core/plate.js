// Standalone geometry, following the website analyser's documented plate bounds.
export const PLATE_LAYOUTS = Object.freeze({
  24: Object.freeze({ size: 24, rows: 4, columns: 6, lastWell: "D6" }),
  48: Object.freeze({ size: 48, rows: 6, columns: 8, lastWell: "F8" }),
  96: Object.freeze({ size: 96, rows: 8, columns: 12, lastWell: "H12" }),
  384: Object.freeze({ size: 384, rows: 16, columns: 24, lastWell: "P24" })
});

export function getPlateLayout(size) {
  const layout = PLATE_LAYOUTS[Number(size)];
  if (!layout) throw new RangeError(`Unsupported plate size: ${size}`);
  return layout;
}

export function normalizeWell(value) {
  const match = String(value ?? "").trim().match(/^([A-Pa-p])0*([1-9]|1\d|2[0-4])$/);
  return match ? `${match[1].toUpperCase()}${Number(match[2])}` : null;
}

export function wellParts(value) {
  const well = normalizeWell(value);
  if (!well) throw new RangeError(`Invalid well: ${value}`);
  return { well, row: well.charCodeAt(0) - 65, column: Number(well.slice(1)) - 1 };
}

export function containsWell(size, value) {
  const layout = getPlateLayout(size);
  const well = normalizeWell(value);
  if (!well) return false;
  const { row, column } = wellParts(well);
  return row < layout.rows && column < layout.columns;
}

export function layoutWells(size) {
  const { rows, columns } = getPlateLayout(size);
  return Array.from({ length: rows * columns }, (_, index) =>
    `${String.fromCharCode(65 + Math.floor(index / columns))}${index % columns + 1}`);
}

export function sortWells(a, b) {
  const left = wellParts(a), right = wellParts(b);
  return left.row - right.row || left.column - right.column;
}

export function rowWells(size, letter) {
  const { rows, columns } = getPlateLayout(size);
  const row = String(letter).toUpperCase();
  if (!/^[A-P]$/.test(row) || row.charCodeAt(0) - 65 >= rows) {
    throw new RangeError(`Row ${letter} is outside this plate.`);
  }
  return Array.from({ length: columns }, (_, index) => `${row}${index + 1}`);
}

export function columnWells(size, column) {
  const layout = getPlateLayout(size);
  const number = Number(column);
  if (!Number.isInteger(number) || number < 1 || number > layout.columns) {
    throw new RangeError(`Column ${column} is outside this plate.`);
  }
  return Array.from({ length: layout.rows }, (_, index) => `${String.fromCharCode(65 + index)}${number}`);
}

export function isPerimeterWell(size, value) {
  const layout = getPlateLayout(size);
  if (!containsWell(size, value)) throw new RangeError(`Well ${value} is outside this plate.`);
  const { row, column } = wellParts(value);
  return row === 0 || row === layout.rows - 1 || column === 0 || column === layout.columns - 1;
}

export function navigateWell(size, value, key, wholePlate = false) {
  const layout = getPlateLayout(size);
  if (!containsWell(size, value)) throw new RangeError(`Well ${value} is outside this plate.`);
  let { row, column } = wellParts(value);
  if (key === "ArrowUp") row = Math.max(0, row - 1);
  if (key === "ArrowDown") row = Math.min(layout.rows - 1, row + 1);
  if (key === "ArrowLeft") column = Math.max(0, column - 1);
  if (key === "ArrowRight") column = Math.min(layout.columns - 1, column + 1);
  if (key === "Home") { column = 0; if (wholePlate) row = 0; }
  if (key === "End") { column = layout.columns - 1; if (wholePlate) row = layout.rows - 1; }
  return `${String.fromCharCode(65 + row)}${column + 1}`;
}
