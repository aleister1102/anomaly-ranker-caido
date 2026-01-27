import { RankedResult } from "../../../shared/types.js";

export const toCsv = (results: RankedResult[]): string => {
  const headers = ["Rank", "Method", "Status", "Length", "Type", "URL"];
  const rows = results.map(r => [r.rank, r.method, r.statusCode, r.contentLength, r.contentType, r.url].join(","));
  return [headers.join(","), ...rows].join("\n");
};

export const toFfuf = (results: RankedResult[]): string => {
  const urls = results.map(r => r.url).join("\n");
  return `# Save this to urls.txt and run:\n# ffuf -w urls.txt:URL -u URL`;
};
