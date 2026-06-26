const DIRECT_COPY_RISK_PATTERN =
  /\b(copy|clone|replicate|exact|identical|steal|reupload)\b|\bsame\s+(?:video|clip|ad|edit)\b|\b99\s*%|sao\s*chep|y\s*het|y\s*chang|giong\s+(?:het|video|clip|mau|ban|reference|tham\s*khao|y\s*het)|bat\s*chuoc|nhai|lam\s+lai\s+y\s*chang|lam\s+giong\s+(?:het|video|clip|mau)/i;
const HUNDRED_PERCENT_CONTEXT_PATTERN =
  /(?:100\s*%[^.!?]{0,80}\b(?:video|clip|ad|edit|reference|tham\s*khao|cau\s*truc|structure|hoc|learn|copy|giong|y\s*het)|\b(?:video|clip|ad|edit|reference|tham\s*khao|cau\s*truc|structure|hoc|learn|copy|giong|y\s*het)[^.!?]{0,80}100\s*%)/i;

export function hasCopyRiskIntent(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = normalizeCopyRiskText(value);
  return DIRECT_COPY_RISK_PATTERN.test(normalized) || HUNDRED_PERCENT_CONTEXT_PATTERN.test(normalized);
}

function normalizeCopyRiskText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
