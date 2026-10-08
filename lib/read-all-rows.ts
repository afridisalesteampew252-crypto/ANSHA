type PageResult<T> = { data: T[] | null; count: number | null; error: { message: string } | null };

/** Advance by actual rows received so lower provider caps never truncate totals. */
export async function readAllRows<T extends { id: string }>(
  loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label: string,
): Promise<T[]> {
  const rows: T[] = [];
  const ids = new Set<string>();
  let expected: number | null = null;
  do {
    const { data, count, error } = await loadPage(rows.length, rows.length + 499);
    if (error) throw new Error(`${label} could not be loaded. Please retry.`);
    if (!Array.isArray(data) || count === null || !Number.isSafeInteger(count) || count < 0 ||
        (expected !== null && count !== expected) || (!data.length && rows.length < count)) {
      throw new Error(`${label} could not be loaded completely. Please retry.`);
    }
    expected = count;
    for (const row of data) {
      if (!row.id || ids.has(row.id)) throw new Error(`${label} changed while loading. Please retry.`);
      ids.add(row.id);
      rows.push(row);
    }
    if (rows.length > expected) throw new Error(`${label} changed while loading. Please retry.`);
  } while (rows.length < expected);
  return rows;
}
