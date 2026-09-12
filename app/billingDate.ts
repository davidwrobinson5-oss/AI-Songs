export function formatBillingDate(value: string | number | Date | null | undefined, locale = 'en-US') {
  if (value == null || value === '') return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  // Billing dates represent the Stripe cycle boundary, not a local-midnight
  // appointment. Formatting in UTC prevents date-only values such as
  // "2026-11-11" from appearing as November 10 in western time zones.
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
