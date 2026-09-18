import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Tags, Warehouse, Boxes, Receipt, Wrench, MessageSquareHeart, BookMarked, ScrollText, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Card } from '@/components/ui/Card'
import { useAuth } from '@/context/AuthContext'
import { useDealerStock, useInvoices, useServiceRequests, useProducts } from '@/hooks/queries'
import { formatCurrencyINR, CURRENT_FY } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

const QUICK_LINKS = [
  { to: '/price-list', label: 'Price List', description: 'Browse the full Dingli product catalog & pricing', icon: Tags },
  { to: '/dingli-stock', label: 'Dingli India Stock', description: 'Live availability across Dingli India warehouses', icon: Warehouse },
  { to: '/my-stock', label: 'My Stock', description: 'Machines currently held at your dealership', icon: Boxes },
  { to: '/invoices', label: 'Invoice History', description: `Every invoice raised in ${CURRENT_FY}`, icon: Receipt },
  { to: '/ledger', label: 'Ledger', description: `Your running account statement for ${CURRENT_FY}`, icon: ScrollText },
  { to: '/service-requests', label: 'Service Requests', description: 'Raise & track machine service tickets', icon: Wrench },
  { to: '/feedback', label: 'Feedback & Suggestions', description: 'Tell us what’s working, and what isn’t', icon: MessageSquareHeart },
  { to: '/catalogs', label: 'Catalog Downloads', description: 'Spec sheets & product catalogs, ready to share', icon: BookMarked },
]

export default function Dashboard() {
  const { profile, user } = useAuth()
  const { data: products, isLoading: productsLoading } = useProducts()
  const { data: dealerStock, isLoading: stockLoading } = useDealerStock()
  const { data: invoices, isLoading: invoicesLoading } = useInvoices()
  const { data: serviceRequests, isLoading: srLoading } = useServiceRequests()

  const displayName = profile?.dealer_name || user?.email?.split('@')[0] || 'Dealer'
  const unpaidInvoices = invoices?.filter((i) => i.status !== 'paid').length ?? 0
  const openTickets = serviceRequests?.filter((s) => s.status === 'open' || s.status === 'in_progress').length ?? 0
  const totalStockUnits = dealerStock?.reduce((sum, s) => sum + s.quantity, 0) ?? 0
  const totalInvoiceValue = invoices?.reduce((sum, i) => sum + Number(i.amount), 0) ?? 0

  return (
    <div>
      <PageHeader
        eyebrow={CURRENT_FY}
        title={`Welcome back, ${displayName}`}
        description={`Here's a snapshot of your ${profile?.company_name ?? 'dealership'}'s account with Dingli India.`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stockLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <StatCard icon={Boxes} label="Units in My Stock" value={totalStockUnits.toLocaleString('en-IN')} tone="green" delay={0} />
        )}
        {invoicesLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <StatCard icon={Receipt} label={`Invoiced (${CURRENT_FY})`} value={formatCurrencyINR(totalInvoiceValue)} tone="orange" delay={0.05} />
        )}
        {invoicesLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <StatCard icon={Receipt} label="Unpaid Invoices" value={String(unpaidInvoices)} tone="green" delay={0.1} />
        )}
        {srLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <StatCard icon={Wrench} label="Open Service Tickets" value={String(openTickets)} tone="orange" delay={0.15} />
        )}
      </div>

      <div className="mt-10">
        <h2 className="font-display mb-4 text-lg font-semibold text-base-50">Quick access</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link, i) => (
            <motion.div
              key={link.to}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link to={link.to} className="group block h-full">
                <Card className="group relative h-full overflow-hidden p-5 transition-all duration-200 hover:-translate-y-1 hover:border-orange-500/40 hover:shadow-glow-orange">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-green-500/15 text-orange-400">
                      <link.icon className="size-5" />
                    </div>
                    <h3 className="font-display font-semibold text-base-50">{link.label}</h3>
                  </div>
                  <p className="mt-3 text-sm text-base-300">{link.description}</p>
                  <div className="mt-4 flex items-center gap-1 text-sm font-medium text-orange-400 opacity-0 transition-opacity group-hover:opacity-100">
                    Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {!productsLoading && products && (
        <p className="mt-8 text-center text-xs text-base-400">
          {products.length} active products available in the current price list
        </p>
      )}
    </div>
  )
}
