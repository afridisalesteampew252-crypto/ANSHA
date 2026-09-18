/** Case-insensitive substring match. Empty/whitespace query matches everything. */
export function matchesQuery(
  query: string,
  fields: ReadonlyArray<string | number | boolean | null | undefined>
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((value) => {
    if (value == null || value === '') return false;
    return String(value).toLowerCase().includes(q);
  });
}
