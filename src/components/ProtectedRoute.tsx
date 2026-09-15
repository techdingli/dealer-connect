import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Loader2 } from 'lucide-react'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-base-950">
        <Loader2 className="size-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}

export function PublicOnlyRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-base-950">
        <Loader2 className="size-8 animate-spin text-orange-500" />
      </div>
    )
  }

  if (session) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
