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

/**
 * Normalise une saisie rapide d'heure de travail.
 *
 * Exemples : 8 -> 08:00, 730 -> 07:30, 0730 -> 07:30, 7:30 -> 07:30.
 * Une valeur qui ne représente pas une heure valide est laissée au formulaire
 * afin qu'il puisse afficher son message de validation habituel.
 */
export const normalizeDurationInput = (value: string): string | null => {
  const trimmed = value.trim();
  let hours: number;
  let minutes: number;

  const separated = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (separated) {
    hours = Number(separated[1]);
    minutes = Number(separated[2]);
  } else if (/^\d{1,2}$/.test(trimmed)) {
    hours = Number(trimmed);
    minutes = 0;
  } else if (/^\d{3,4}$/.test(trimmed)) {
    hours = Number(trimmed.slice(0, -2));
    minutes = Number(trimmed.slice(-2));
  } else {
    return null;
  }

  if (!Number.isSafeInteger(hours) || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Produit l'affichage progressif du masque HH:MM à partir des chiffres tapés.
 * Un premier chiffre de 0 à 2 attend un deuxième chiffre d'heure; un premier
 * chiffre de 3 à 9 représente immédiatement une heure à un chiffre.
 */
export const progressiveDurationInput = (digits: string): string => {
  const value = digits.replace(/\D/g, '').slice(0, 4);
  if (!value) return '';

  const waitsForSecondHourDigit = Number(value[0]) <= 2;
  const hourDigitCount = waitsForSecondHourDigit && value.length >= 2 ? 2 : 1;
  const hourDigits = value.slice(0, hourDigitCount);
  const minuteDigits = value.slice(hourDigitCount, hourDigitCount + 2);

  return `${hourDigits.padStart(2, '0')}:${minuteDigits}`;
};

export const completeProgressiveDuration = (
  digits: string,
  fallbackValue: string,
): string | null => {
  if (!digits) return normalizeDurationInput(fallbackValue);

  const progressive = progressiveDurationInput(digits);
  const [hours, minutes = ''] = progressive.split(':');
  const completedMinutes = minutes.length === 0
    ? '00'
    : minutes.length === 1
      ? `${minutes}0`
      : minutes;

  return normalizeDurationInput(`${hours}:${completedMinutes}`);
};
