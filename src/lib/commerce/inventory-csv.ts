export const INVENTORY_CSV_HEADERS = [
  "sku",
  "title",
  "category",
  "on_hand",
  "threshold",
  "incoming",
  "reason",
] as const;
export const INVENTORY_CSV_TEMPLATE = INVENTORY_CSV_HEADERS.join(",") + "\r\n";
export type CsvRecord = { line: number; cells: Record<string, string> };

/** Strict CSV reader: quoted commas, escaped quotes and embedded newlines work. */
export function readInventoryCsv(source: string): CsvRecord[] {
  if (source.length > 200_000 || new TextEncoder().encode(source).byteLength > 200_000)
    throw Error("Choose a CSV file up to 200 KB and 500 stock rows.");
  const text = source.replace(/^\uFEFF/, "");
  const records: { line: number; values: string[] }[] = [];
  let values: string[] = [],
    value = "",
    quoted = false,
    closed = false,
    line = 1,
    start = 1;
  const cell = () => {
    values.push(value);
    value = "";
    closed = false;
  };
  const row = () => {
    cell();
    if (values.some((v) => v.trim())) records.push({ line: start, values });
    values = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\0") throw Error(`Line ${line}: NUL characters are not allowed.`);
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += c;
        if (c === "\n") line++;
      }
    } else if (c === '"') {
      if (value || closed)
        throw Error(`Line ${line}: quote a complete field, or escape quotes as two quotes.`);
      quoted = true;
    } else if (c === ",") cell();
    else if (c === "\r" || c === "\n") {
      row();
      if (c === "\r" && text[i + 1] === "\n") i++;
      line++;
      start = line;
    } else {
      if (closed) throw Error(`Line ${line}: unexpected text after a closing quote.`);
      value += c;
    }
  }
  if (quoted) throw Error(`Line ${start}: a quoted field is not closed.`);
  if (value || values.length || closed) row();
  const header = records.shift();
  if (!header) throw Error("The CSV needs a header and at least one stock row.");
  const columns = header.values.map((v) => v.trim().toLowerCase());
  if (new Set(columns).size !== columns.length) throw Error("CSV column names must be unique.");
  if (
    columns.some(
      (name) => !INVENTORY_CSV_HEADERS.includes(name as (typeof INVENTORY_CSV_HEADERS)[number]),
    )
  )
    throw Error(
      "Use only the inventory template columns: " + INVENTORY_CSV_HEADERS.join(", ") + ".",
    );
  if (!columns.includes("sku") || !columns.includes("on_hand"))
    throw Error("The CSV must include sku and on_hand columns.");
  if (!records.length || records.length > 500) throw Error("Include from 1 to 500 stock rows.");
  return records.map((r) => {
    if (r.values.length !== columns.length)
      throw Error(`Line ${r.line}: expected ${columns.length} fields, found ${r.values.length}.`);
    return {
      line: r.line,
      cells: Object.fromEntries(columns.map((name, i) => [name, r.values[i].trim()])),
    };
  });
}

export function inventoryCsvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // Escape spreadsheet formulas in exported text; imported values are never executed.
  if (/^[\s=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
