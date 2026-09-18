import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { ProtectedRoute, PublicOnlyRoute } from '@/components/ProtectedRoute'
import { DEMO_MODE } from '@/config/demo'

const Login = lazy(() => import('@/pages/auth/Login'))
const Signup = lazy(() => import('@/pages/auth/Signup'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const PriceList = lazy(() => import('@/pages/PriceList'))
const DingliStock = lazy(() => import('@/pages/DingliStock'))
const DealerStock = lazy(() => import('@/pages/DealerStock'))
const InvoiceHistory = lazy(() => import('@/pages/InvoiceHistory'))
const Ledger = lazy(() => import('@/pages/Ledger'))
const ServiceRequests = lazy(() => import('@/pages/ServiceRequests'))
const Feedback = lazy(() => import('@/pages/Feedback'))
const Catalogs = lazy(() => import('@/pages/Catalogs'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function RouteFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 className="size-6 animate-spin text-orange-500" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<Login />} />
          {/* Demo mode has no account creation — the login dropdown is the only
              way in, so /signup folds back into it. */}
          <Route path="/signup" element={DEMO_MODE ? <Navigate to="/login" replace /> : <Signup />} />
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/price-list" element={<PriceList />} />
            <Route path="/dingli-stock" element={<DingliStock />} />
            <Route path="/my-stock" element={<DealerStock />} />
            <Route path="/invoices" element={<InvoiceHistory />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/service-requests" element={<ServiceRequests />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/catalogs" element={<Catalogs />} />
          </Route>
        </Route>

        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </Suspense>
  )
}
