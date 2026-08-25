/**
 * Site-wide date format: DD-MM-YY.
 *
 * Read in UTC on purpose. Frontmatter dates like `2026-08-21` parse as UTC
 * midnight, so reading them in a negative-offset timezone would render the
 * previous day.
 */
export function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}
