const STATUS_COLORS = {
  informational: "#60a5fa",
  success: "#4ade80",
  redirect: "#facc15",
  clientError: "#fb923c",
  serverError: "#f87171",
  unknown: "#94a3b8",
} as const;

export const getStatusColor = (statusCode: number): string => {
  if (statusCode >= 500) return STATUS_COLORS.serverError;
  if (statusCode >= 400) return STATUS_COLORS.clientError;
  if (statusCode >= 300) return STATUS_COLORS.redirect;
  if (statusCode >= 200) return STATUS_COLORS.success;
  if (statusCode >= 100) return STATUS_COLORS.informational;
  return STATUS_COLORS.unknown;
};
