import { motion } from 'framer-motion'
import { BookMarked, Download, FileText } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCatalogs, getCatalogDownloadUrl } from '@/hooks/queries'
import { formatDate } from '@/lib/utils'

function formatFileSize(bytes: number | null) {
  if (!bytes) return null
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}

export default function Catalogs() {
  const { data: catalogs, isLoading } = useCatalogs()

  return (
    <div>
      <PageHeader
        eyebrow="Resources"
        title="Catalog Downloads"
        description="Product catalogs and spec sheets, ready to download and share with your customers."
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : !catalogs || catalogs.length === 0 ? (
        <EmptyState icon={BookMarked} title="No catalogs available yet" description="Check back soon — new product catalogs will appear here." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {catalogs.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
            >
              <Card className="group flex h-full flex-col overflow-hidden p-5 transition-all hover:-translate-y-1 hover:border-green-500/40 hover:shadow-glow-green">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/15 to-green-500/15 text-green-400">
                    <FileText className="size-5" />
                  </div>
                  {c.category && <Badge tone="green">{c.category}</Badge>}
                </div>
                <h3 className="font-display font-semibold text-base-50">{c.title}</h3>
                {c.description && <p className="mt-1.5 flex-1 text-sm text-base-300">{c.description}</p>}
                <div className="mt-4 flex items-center justify-between text-xs text-base-400">
                  <span>{formatDate(c.created_at)}</span>
                  {formatFileSize(c.file_size) && <span>{formatFileSize(c.file_size)}</span>}
                </div>
                <a
                  href={getCatalogDownloadUrl(c.file_path)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 px-4 py-2.5 text-sm font-medium text-white shadow-glow-orange transition-all hover:brightness-110 active:scale-[0.97]"
                >
                  <Download className="size-4" />
                  Download
                </a>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
