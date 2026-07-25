/**
 * Complète une saisie composée uniquement d'un nombre d'heures.
 * Les formats déjà complets ou ambigus sont laissés intacts pour être validés
 * par le formulaire appelant.
 */
export const completeWholeHours = (
  value: string,
  allowNegative = false,
): string | null => {
  const expression = allowNegative ? /^-?\d+$/ : /^\d+$/;
  const trimmed = value.trim();
  if (!expression.test(trimmed)) return null;

  const numericValue = Number(trimmed);
  if (!Number.isSafeInteger(numericValue)) return null;
  const sign = numericValue < 0 ? '-' : '';
  return `${sign}${String(Math.abs(numericValue)).padStart(2, '0')}:00`;
};
