import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, Check, ListFilter, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import {
  emptyFilter,
  isFilterActive,
  type ColumnDef,
  type Filter,
  type TableFilters,
} from '@/hooks/useTableFilters'

const MENU_WIDTH = 268

/**
 * The menu renders through a portal on purpose. Tables sit inside an
 * `overflow-x-auto` wrapper that would clip an absolutely positioned menu, and
 * the page is wrapped in Framer Motion transforms, which make `position: fixed`
 * resolve against the transformed ancestor rather than the viewport. Portalling
 * to `document.body` sidesteps both.
 */
function FilterMenu<T>({
  column,
  table,
  anchor,
  onClose,
}: {
  column: ColumnDef<T>
  table: TableFilters<T>
  anchor: DOMRect
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [optionQuery, setOptionQuery] = useState('')

  const filter = table.filters[column.id] ?? emptyFilter(column.type)
  const update = (next: Filter) => table.setFilter(column.id, next)

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    // `true` so we see the event before React's own handlers swallow it.
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const left = Math.max(12, Math.min(anchor.left, window.innerWidth - MENU_WIDTH - 12))
  const top = anchor.bottom + 6
  const maxHeight = Math.max(220, window.innerHeight - top - 16)

  const options = table.options[column.id] ?? []
  const visibleOptions = optionQuery
    ? options.filter((o) => o.toLowerCase().includes(optionQuery.toLowerCase()))
    : options

  function toggleOption(value: string) {
    if (filter.type !== 'select') return
    const selected = filter.selected.includes(value)
      ? filter.selected.filter((v) => v !== value)
      : [...filter.selected, value]
    update({ type: 'select', selected })
  }

  return createPortal(
    <div
      ref={menuRef}
      role="dialog"
      aria-label={`Filter by ${column.label}`}
      style={{ position: 'fixed', top, left, width: MENU_WIDTH, maxHeight }}
      className="z-50 flex flex-col overflow-hidden rounded-xl border border-base-600 bg-base-800 shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-base-600 px-3 py-2">
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-base-300">
          {column.label}
        </p>
        <button onClick={onClose} aria-label="Close" className="rounded p-0.5 text-base-400 hover:text-base-100">
          <X className="size-3.5" />
        </button>
      </div>

      {/* Sort */}
      <div className="flex gap-1 border-b border-base-600 p-2">
        {(
          [
            { dir: 'asc' as const, icon: ArrowUp, label: column.type === 'number' ? 'Low–High' : 'A–Z' },
            { dir: 'desc' as const, icon: ArrowDown, label: column.type === 'number' ? 'High–Low' : 'Z–A' },
          ] satisfies { dir: 'asc' | 'desc'; icon: typeof ArrowUp; label: string }[]
        ).map(({ dir, icon: Icon, label }) => {
          const active = table.sort?.columnId === column.id && table.sort.direction === dir
          return (
            <button
              key={dir}
              onClick={() => table.toggleSort(column.id, dir)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'border-orange-500/40 bg-orange-500/15 text-orange-300'
                  : 'border-base-600 text-base-200 hover:border-base-400',
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          )
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filter.type === 'text' && (
          <Input
            autoFocus
            value={filter.query}
            onChange={(e) => update({ type: 'text', query: e.target.value })}
            placeholder={`Contains…`}
            className="text-sm"
          />
        )}

        {filter.type === 'select' && (
          <div className="space-y-1">
            {options.length > 8 && (
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-base-400" />
                <Input
                  autoFocus
                  value={optionQuery}
                  onChange={(e) => setOptionQuery(e.target.value)}
                  placeholder="Search values…"
                  className="py-1.5 pl-8 text-xs"
                />
              </div>
            )}

            {visibleOptions.length === 0 ? (
              <p className="px-1 py-2 text-xs text-base-400">No values</p>
            ) : (
              visibleOptions.map((value) => {
                const checked = filter.selected.includes(value)
                return (
                  <button
                    key={value}
                    onClick={() => toggleOption(value)}
                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm text-base-100 hover:bg-base-700"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        checked ? 'border-orange-500 bg-orange-500 text-white' : 'border-base-500',
                      )}
                    >
                      {checked && <Check className="size-3" />}
                    </span>
                    <span className="truncate capitalize">
                      {column.formatOption ? column.formatOption(value) : value}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}

        {filter.type === 'number' && (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              type="number"
              inputMode="decimal"
              value={filter.min}
              onChange={(e) => update({ ...filter, min: e.target.value })}
              placeholder="Min"
              className="py-1.5 text-sm"
            />
            <span className="text-xs text-base-400">to</span>
            <Input
              type="number"
              inputMode="decimal"
              value={filter.max}
              onChange={(e) => update({ ...filter, max: e.target.value })}
              placeholder="Max"
              className="py-1.5 text-sm"
            />
          </div>
        )}

        {filter.type === 'date' && (
          <div className="space-y-2">
            <label className="block text-xs text-base-400">
              From
              <Input
                type="date"
                value={filter.from}
                onChange={(e) => update({ ...filter, from: e.target.value })}
                className="mt-1 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs text-base-400">
              To
              <Input
                type="date"
                value={filter.to}
                onChange={(e) => update({ ...filter, to: e.target.value })}
                className="mt-1 py-1.5 text-sm"
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-base-600 px-2 py-2">
        <button
          onClick={() => {
            table.clearFilter(column.id)
            setOptionQuery('')
          }}
          className="rounded-lg px-2 py-1 text-xs font-medium text-base-300 hover:text-base-50"
        >
          Clear
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-base-700 px-3 py-1 text-xs font-medium text-base-50 hover:bg-base-600"
        >
          Done
        </button>
      </div>
    </div>,
    document.body,
  )
}

/** Shared open/close + anchor plumbing for both triggers below. */
function useMenuAnchor() {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const openMenu = () => setAnchor(triggerRef.current!.getBoundingClientRect())
  const closeMenu = () => setAnchor(null)

  // Keep the menu stuck to its trigger while the table scrolls sideways.
  useLayoutEffect(() => {
    if (!anchor) return
    function reposition() {
      if (triggerRef.current) setAnchor(triggerRef.current.getBoundingClientRect())
    }
    window.addEventListener('scroll', reposition, true)
    return () => window.removeEventListener('scroll', reposition, true)
  }, [anchor])

  return { triggerRef, anchor, openMenu, closeMenu, isOpen: anchor !== null }
}

/** Column header that opens the filter/sort menu. Drop it inside a `<th>`. */
export function ColumnFilter<T>({
  column,
  table,
  align = 'left',
}: {
  column: ColumnDef<T>
  table: TableFilters<T>
  align?: 'left' | 'right'
}) {
  const { triggerRef, anchor, openMenu, closeMenu, isOpen } = useMenuAnchor()
  const active = isFilterActive(table.filters[column.id])
  const sorted = table.sort?.columnId === column.id

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'group -mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium uppercase tracking-wide transition-colors',
          align === 'right' && 'justify-end',
          active || sorted ? 'text-orange-400' : 'text-base-400 hover:text-base-100',
        )}
      >
        <span className="truncate">{column.label}</span>
        {sorted ? (
          table.sort!.direction === 'asc' ? (
            <ArrowUp className="size-3 shrink-0" />
          ) : (
            <ArrowDown className="size-3 shrink-0" />
          )
        ) : (
          <ListFilter
            className={cn(
              'size-3 shrink-0 transition-opacity',
              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
            )}
          />
        )}
        {active && <span className="size-1.5 shrink-0 rounded-full bg-orange-500" />}
      </button>

      {anchor && <FilterMenu column={column} table={table} anchor={anchor} onClose={closeMenu} />}
    </>
  )
}

/** Summarises a filter in a chip, e.g. "Status: paid, unpaid". */
function filterSummary(filter: Filter | undefined, column: ColumnDef<unknown>): string | null {
  if (!isFilterActive(filter) || !filter) return null
  switch (filter.type) {
    case 'text':
      return filter.query.trim()
    case 'select':
      return filter.selected
        .map((v) => (column.formatOption ? column.formatOption(v) : v))
        .join(', ')
    case 'number':
      if (filter.min && filter.max) return `${filter.min}–${filter.max}`
      return filter.min ? `≥ ${filter.min}` : `≤ ${filter.max}`
    case 'date':
      if (filter.from && filter.to) return `${filter.from} → ${filter.to}`
      return filter.from ? `from ${filter.from}` : `to ${filter.to}`
  }
}

/** Chip trigger — the phone equivalent of a column header, and what the
 *  card-based pages (Service Requests, Feedback, Catalogs) use at every width. */
export function FilterChip<T>({ column, table }: { column: ColumnDef<T>; table: TableFilters<T> }) {
  const { triggerRef, anchor, openMenu, closeMenu, isOpen } = useMenuAnchor()
  const filter = table.filters[column.id]
  const summary = filterSummary(filter, column as ColumnDef<unknown>)
  const sorted = table.sort?.columnId === column.id

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className={cn(
          'inline-flex max-w-[15rem] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          summary || sorted
            ? 'border-orange-500/40 bg-orange-500/15 text-orange-300'
            : 'border-base-600 text-base-300 hover:border-base-400',
        )}
      >
        <ListFilter className="size-3 shrink-0" />
        <span className="truncate capitalize">
          {column.label}
          {summary ? `: ${summary}` : ''}
        </span>
        {sorted &&
          (table.sort!.direction === 'asc' ? (
            <ArrowUp className="size-3 shrink-0" />
          ) : (
            <ArrowDown className="size-3 shrink-0" />
          ))}
      </button>

      {anchor && <FilterMenu column={column} table={table} anchor={anchor} onClose={closeMenu} />}
    </>
  )
}

/**
 * A row of filter chips plus a result count. Used above the card lists, and on
 * phones for the table pages, where the column headers aren't rendered at all.
 */
export function FilterBar<T>({
  columns,
  table,
  className,
  children,
}: {
  columns: ColumnDef<T>[]
  table: TableFilters<T>
  className?: string
  children?: ReactNode
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {columns.map((column) => (
        <FilterChip key={column.id} column={column} table={table} />
      ))}

      {table.isActive && (
        <button
          onClick={table.clearAll}
          className="inline-flex items-center gap-1 rounded-full px-2 py-1.5 text-xs font-medium text-base-400 hover:text-base-100"
        >
          <X className="size-3" />
          Clear all
        </button>
      )}

      {children}
    </div>
  )
}

/** "12 of 27" — shown whenever a filter is hiding rows. */
export function FilterCount<T>({ table }: { table: TableFilters<T> }) {
  if (!table.activeFilterCount) return null
  return (
    <span className="text-xs text-base-400">
      {table.filteredRows.length} of {table.totalCount}
    </span>
  )
}
