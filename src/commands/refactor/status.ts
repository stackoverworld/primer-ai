export function simplifyExecutionStatus(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("ai activity: planning")) {
    return "Planning refactor steps";
  }
  if (lower.includes("ai activity: reading")) {
    return "Reading project files";
  }
  if (lower.includes("ai activity: editing")) {
    return "Editing project files";
  }
  if (lower.includes("ai activity: running verification")) {
    return "Running verification checks";
  }
  if (lower.includes("ai activity: preparing completion")) {
    return "Preparing completion report";
  }
  if (lower.includes("checking available ai clis") || lower.includes("checking availability")) {
    return "Preparing AI environment";
  }
  if (lower.includes("launching")) {
    return "Starting AI session";
  }
  if (lower.includes("retrying")) {
    return "Retrying fallback mode";
  }
  if (lower.includes("generating and applying")) {
    return "Applying refactor updates";
  }
  if (lower.includes("still processing")) {
    return "Waiting for AI response";
  }
  if (lower.includes("waiting for additional response")) {
    return "Waiting for AI response";
  }
  return "Working on refactor request";
}
