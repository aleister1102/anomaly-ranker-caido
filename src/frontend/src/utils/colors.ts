/**
 * Utility to map status codes and content types to colors based on Crayon rules.
 */

const JSON_MATCHES = ["application/json", "+json"];
const XML_MATCHES = ["application/xml", "text/xml", "+xml"];
const HTML_MATCHES = ["text/html", "application/xhtml+xml"];

export const getRowColor = (statusCode: number, contentType: string): string => {
  if (statusCode >= 500) return "#a32f2a"; // Red
  if (statusCode >= 400) return "#a06008"; // Amber
  if (statusCode >= 300) return "#8a7a06"; // Olive
  
  if (statusCode >= 200 && statusCode < 300) {
    const ct = contentType.toLowerCase();
    if (JSON_MATCHES.some(m => ct.includes(m))) return "#157a37"; // Green
    if (XML_MATCHES.some(m => ct.includes(m)) && !ct.includes("image/svg")) return "#0b4ea8"; // Blue
    if (HTML_MATCHES.some(m => ct.includes(m))) return "#1f7aa8"; // Cyan
  }
  
  return "transparent";
};

export const getRowStyle = (statusCode: number, contentType: string): string => {
  const color = getRowColor(statusCode, contentType);
  return color !== "transparent" ? `border-left: 4px solid ${color};` : "";
};

const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const getRowBackgroundColor = (statusCode: number, contentType: string): string => {
  const color = getRowColor(statusCode, contentType);
  if (color === "transparent") return "transparent";
  return hexToRgba(color, 0.15);
};
