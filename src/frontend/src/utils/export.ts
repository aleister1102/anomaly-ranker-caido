import { RankedResult } from "../../../shared/types.js";

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCsvField(value: string | number): string {
  let s = String(value);
  if (FORMULA_PREFIX.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export const toCsv = (results: RankedResult[]): string => {
  const headers = ["Rank", "Raw", "Method", "Status", "Length", "Type", "URL"];
  const rows = results.map((r) =>
    [
      r.rank,
      r.rawRank,
      r.method,
      r.statusCode,
      r.contentLength,
      r.contentType,
      r.url,
    ]
      .map(escapeCsvField)
      .join(","),
  );
  return [headers.join(","), ...rows].join("\n");
};

export const toFfuf = (results: RankedResult[]): string => {
  const urls = results.map((r) => r.url).join("\n");
  return `# Save this to urls.txt and run:\n# ffuf -w urls.txt:URL -u FUZZ\n\n${urls}`;
};
