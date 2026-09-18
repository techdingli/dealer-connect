import { useCallback, useMemo, useState } from 'react'

/**
 * Column filtering + sorting shared by every list in the portal.
 *
 * The pages keep their own markup — each one renders a table on tablet+ and a
 * card list on phones — so this deliberately isn't a DataTable component. It
 * takes the rows and a column spec, hands back the filtered/sorted rows, and
 * lets the page render them however it already does. The same state drives the
 * header menus on desktop and the filter chips on phones.
 */

export type ColumnType = 'text' | 'select' | 'number' | 'date'

export interface ColumnDef<T> {
  id: string
  label: string
  type: ColumnType
  /** The value this column filters and sorts on. */
  accessor: (row: T) => string | number | null | undefined
  /** Renders a distinct value as a label in a `select` menu. */
  formatOption?: (value: string) => string
}

export type Filter =
  | { type: 'text'; query: string }
  | { type: 'select'; selected: string[] }
  | { type: 'number'; min: string; max: string }
  | { type: 'date'; from: string; to: string }

export interface SortState {
  columnId: string
  direction: 'asc' | 'desc'
}

export function emptyFilter(type: ColumnType): Filter {
  switch (type) {
    case 'text':
      return { type: 'text', query: '' }
    case 'select':
      return { type: 'select', selected: [] }
    case 'number':
      return { type: 'number', min: '', max: '' }
    case 'date':
      return { type: 'date', from: '', to: '' }
  }
}

/** True when a filter would actually narrow anything — drives the "active" dot. */
export function isFilterActive(filter: Filter | undefined): boolean {
  if (!filter) return false
  switch (filter.type) {
    case 'text':
      return filter.query.trim() !== ''
    case 'select':
      return filter.selected.length > 0
    case 'number':
      return filter.min !== '' || filter.max !== ''
    case 'date':
      return filter.from !== '' || filter.to !== ''
  }
}

function matches<T>(row: T, column: ColumnDef<T>, filter: Filter): boolean {
  const raw = column.accessor(row)

  switch (filter.type) {
    case 'text': {
      const query = filter.query.trim().toLowerCase()
      if (!query) return true
      return String(raw ?? '').toLowerCase().includes(query)
    }
    case 'select': {
      if (filter.selected.length === 0) return true
      return filter.selected.includes(String(raw ?? ''))
    }
    case 'number': {
      const value = Number(raw)
      if (!Number.isFinite(value)) return false
      if (filter.min !== '' && value < Number(filter.min)) return false
      if (filter.max !== '' && value > Number(filter.max)) return false
      return true
    }
    case 'date': {
      // Accessors hand back ISO strings, so a lexicographic compare on the
      // yyyy-mm-dd prefix is a correct date compare and dodges timezone drift.
      const value = String(raw ?? '').slice(0, 10)
      if (!value) return false
      if (filter.from && value < filter.from) return false
      if (filter.to && value > filter.to) return false
      return true
    }
  }
}

function compare<T>(a: T, b: T, column: ColumnDef<T>): number {
  const left = column.accessor(a)
  const right = column.accessor(b)

  // Blanks sort last in both directions — they carry no information.
  const leftBlank = left === null || left === undefined || left === ''
  const rightBlank = right === null || right === undefined || right === ''
  if (leftBlank && rightBlank) return 0
  if (leftBlank) return 1
  if (rightBlank) return -1

  if (column.type === 'number') return Number(left) - Number(right)
  if (column.type === 'date') return String(left).localeCompare(String(right))
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

export function useTableFilters<T>(rows: T[] | undefined, columns: ColumnDef<T>[]) {
  const [filters, setFilters] = useState<Record<string, Filter>>({})
  const [sort, setSort] = useState<SortState | null>(null)

  const setFilter = useCallback((columnId: string, filter: Filter) => {
    setFilters((prev) => ({ ...prev, [columnId]: filter }))
  }, [])

  const clearFilter = useCallback((columnId: string) => {
    setFilters((prev) => {
      const next = { ...prev }
      delete next[columnId]
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setFilters({})
    setSort(null)
  }, [])

  const toggleSort = useCallback((columnId: string, direction: 'asc' | 'desc') => {
    setSort((prev) =>
      prev?.columnId === columnId && prev.direction === direction ? null : { columnId, direction },
    )
  }, [])

  /**
   * Distinct values per `select` column, taken from the *unfiltered* rows so the
   * options don't disappear as you tick them — nothing is more confusing than a
   * filter menu that empties itself out.
   */
  const options = useMemo(() => {
    const result: Record<string, string[]> = {}
    for (const column of columns) {
      if (column.type !== 'select') continue
      const seen = new Set<string>()
      for (const row of rows ?? []) {
        const value = column.accessor(row)
        if (value === null || value === undefined || value === '') continue
        seen.add(String(value))
      }
      result[column.id] = Array.from(seen).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
      )
    }
    return result
  }, [rows, columns])

  const filteredRows = useMemo(() => {
    const columnsById = new Map(columns.map((c) => [c.id, c]))

    const result = (rows ?? []).filter((row) =>
      Object.entries(filters).every(([columnId, filter]) => {
        const column = columnsById.get(columnId)
        return !column || matches(row, column, filter)
      }),
    )

    if (sort) {
      const column = columnsById.get(sort.columnId)
      if (column) {
        result.sort((a, b) => (sort.direction === 'asc' ? compare(a, b, column) : compare(b, a, column)))
      }
    }

    return result
  }, [rows, columns, filters, sort])

  const activeFilterCount = Object.values(filters).filter(isFilterActive).length

  return {
    filteredRows,
    totalCount: rows?.length ?? 0,
    filters,
    setFilter,
    clearFilter,
    clearAll,
    sort,
    toggleSort,
    options,
    activeFilterCount,
    /** True when anything is narrowing or reordering the rows. */
    isActive: activeFilterCount > 0 || sort !== null,
  }
}

export type TableFilters<T> = ReturnType<typeof useTableFilters<T>>
