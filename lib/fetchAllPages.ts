export const PAGE_SIZE = 500

/**
 * Reads every row a query matches, one page at a time. The Supabase API caps a
 * single response at 1,000 rows and drops the rest without an error, so any
 * query whose result can grow past that must page. `query` builds a fresh
 * query per page and must have a stable order (end with a unique column).
 */
export async function fetchAllPages<T = any>(query: () => any, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query().range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}
