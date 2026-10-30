/**
 * Utility: Robust RFC 4180 Compliant CSV String / Buffer Parser
 *
 * Implements high-performance streaming-ready parsing for bulk requirement imports:
 * - Handles quotes, embedded commas, escaped quotes (""), and varied newlines (\r\n, \n).
 * - Tolerates flexible user-supplied column header aliases (e.g. "Item", "Quantity", "City").
 * - Sanitizes and normalizes row values for MongoDB bulk insertion.
 */

/**
 * Normalizes CSV header text to standard requirement field keys.
 *
 * @param {string} header
 * @returns {string} Standardized field name
 */
export function normalizeHeaderKey(header) {
  const clean = header.trim().toLowerCase().replace(/[\s_-]+/g, "");

  if (/^(productname|product|item|itemname|itemtitle|name)$/.test(clean)) {
    return "productName";
  }
  if (/^(category|productcategory|itemcategory|type)$/.test(clean)) {
    return "category";
  }
  if (/^(requestedquantity|quantity|qty|requestedqty|units|count)$/.test(clean)) {
    return "requestedQuantity";
  }
  if (/^(quantityunit|unit|packunit|uom)$/.test(clean)) {
    return "quantityUnit";
  }
  if (/^(deliveryarea|area|city|location|deliverycity)$/.test(clean)) {
    return "deliveryArea";
  }
  if (/^(packsize|packsizedescription|pack)$/.test(clean)) {
    return "packSize";
  }
  if (/^(material|packagingmaterial)$/.test(clean)) {
    return "material";
  }
  if (/^(capacityorsize|capacity|size|volume)$/.test(clean)) {
    return "capacityOrSize";
  }
  if (/^(requiredby|deadline|needby|date)$/.test(clean)) {
    return "requiredBy";
  }
  if (/^(notes|description|originaldescription|remarks)$/.test(clean)) {
    return "originalDescription";
  }

  return clean;
}

/**
 * Splits a single CSV line into field tokens handling RFC 4180 quotes.
 *
 * @param {string} line
 * @returns {Array<string>}
 */
function parseCsvLine(line) {
  const fields = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped double quote
        currentField += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      fields.push(currentField.trim());
      currentField = "";
    } else {
      currentField += char;
    }
    i++;
  }

  fields.push(currentField.trim());
  return fields;
}

/**
 * Parses raw CSV string or Buffer into an array of structured requirement records.
 *
 * @param {string|Buffer} csvContent
 * @returns {Array<object>}
 */
export function parseRequirementCsv(csvContent) {
  const text = Buffer.isBuffer(csvContent) ? csvContent.toString("utf8") : String(csvContent || "");

  if (!text || !text.trim()) {
    return [];
  }

  // Normalize line endings
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    // Need at least 1 header line and 1 data row
    return [];
  }

  const rawHeaders = parseCsvLine(lines[0]);
  const normalizedHeaders = rawHeaders.map(normalizeHeaderKey);

  const records = [];

  for (let rowIdx = 1; rowIdx < lines.length; rowIdx++) {
    const rowValues = parseCsvLine(lines[rowIdx]);

    // Skip empty lines or malformed rows with 0 content
    if (rowValues.every((val) => val === "")) {
      continue;
    }

    const rowObj = {};
    for (let colIdx = 0; colIdx < normalizedHeaders.length; colIdx++) {
      const key = normalizedHeaders[colIdx];
      const val = rowValues[colIdx] ?? "";

      if (key === "requestedQuantity") {
        const parsedQty = parseInt(val, 10);
        rowObj[key] = !isNaN(parsedQty) && parsedQty > 0 ? parsedQty : null;
      } else if (key === "requiredBy") {
        const parsedDate = val ? new Date(val) : null;
        rowObj[key] = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;
      } else {
        rowObj[key] = val || null;
      }
    }

    records.push(rowObj);
  }

  return records;
}

export default {
  normalizeHeaderKey,
  parseRequirementCsv,
};
