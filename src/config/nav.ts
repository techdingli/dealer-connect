import {
  LayoutDashboard,
  Tags,
  Warehouse,
  Boxes,
  Receipt,
  ScrollText,
  MessageSquareHeart,
  Wrench,
  BookMarked,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/price-list', label: 'Price List', icon: Tags },
  { to: '/dingli-stock', label: 'Dingli India Stock', icon: Warehouse },
  { to: '/my-stock', label: 'My Stock', icon: Boxes },
  { to: '/invoices', label: 'Invoice History', icon: Receipt },
  { to: '/ledger', label: 'Ledger', icon: ScrollText },
  { to: '/service-requests', label: 'Service Requests', icon: Wrench },
  { to: '/feedback', label: 'Feedback & Suggestions', icon: MessageSquareHeart },
  { to: '/catalogs', label: 'Catalog Downloads', icon: BookMarked },
]
