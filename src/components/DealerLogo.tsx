import { dealerInitials, type Dealer } from '@/config/dealers'
import { cn } from '@/lib/utils'

type Size = 'sm' | 'md' | 'lg'

/* Dealer logos are supplied as-is by each dealership — several are solid black
 * or dark-navy wordmarks that would disappear against the dark theme. Rather
 * than recolour someone else's brand mark, every logo sits on its own white
 * tile, which is how these marks are meant to be reproduced and keeps all 17
 * looking consistent in both themes. */
const tileClasses: Record<Size, string> = {
  sm: 'size-8 rounded-lg p-1',
  md: 'h-12 w-12 rounded-xl p-1.5',
  lg: 'h-20 w-20 rounded-2xl p-2.5',
}

const initialsClasses: Record<Size, string> = {
  sm: 'text-[10px]',
  md: 'text-sm',
  lg: 'text-xl',
}

export function DealerLogo({
  dealer,
  size = 'md',
  className,
}: {
  dealer: Dealer
  size?: Size
  className?: string
}) {
  if (!dealer.logo) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center bg-gradient-to-br from-orange-500 to-green-600 font-display font-bold text-white',
          tileClasses[size],
          initialsClasses[size],
          className,
        )}
        aria-label={dealer.companyName}
      >
        {dealerInitials(dealer)}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center border border-base-600 bg-white',
        tileClasses[size],
        className,
      )}
    >
      <img src={dealer.logo} alt={dealer.companyName} className="max-h-full max-w-full object-contain" />
    </div>
  )
}

/** Wide variant — lets a horizontal wordmark keep its natural aspect ratio. */
export function DealerLogoBanner({ dealer, className }: { dealer: Dealer; className?: string }) {
  if (!dealer.logo) {
    return (
      <div
        className={cn(
          'flex h-16 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-green-600 px-6 font-display text-xl font-bold text-white',
          className,
        )}
      >
        {dealer.companyName}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex h-16 items-center justify-center rounded-xl border border-base-600 bg-white px-4 py-2.5',
        className,
      )}
    >
      <img src={dealer.logo} alt={dealer.companyName} className="max-h-full max-w-full object-contain" />
    </div>
  )
}
