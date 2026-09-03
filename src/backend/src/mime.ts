export function parseMimeType(value: string): string {
  const separator = value.indexOf(";");
  return (separator === -1 ? value : value.slice(0, separator))
    .trim()
    .toLowerCase();
}
