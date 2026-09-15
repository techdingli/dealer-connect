import dingliLogoWhite from '@/assets/brand/dingli-logo-white.svg'
import dingliLogoColor from '@/assets/brand/dingli-logo-color.svg'
import { useTheme } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

export function Logo({
  compact = false,
  className,
  forceScheme,
}: {
  compact?: boolean
  className?: string
  /** Pin the logo variant regardless of the app-wide theme — for spots whose
   * background is deliberately forced to one scheme (e.g. AuthLayout's
   * always-dark marketing panel) so the logo's contrast stays correct. */
  forceScheme?: 'light' | 'dark'
}) {
  const { theme } = useTheme()
  const effective = forceScheme ?? theme
  // The white wordmark reads on dark backgrounds; the colored one (dark text +
  // brand orange) is what Dingli's own site uses on light backgrounds.
  const logoSrc = effective === 'dark' ? dingliLogoWhite : dingliLogoColor

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img src={logoSrc} alt="Dingli" className={compact ? 'h-6 w-auto' : 'h-7 w-auto'} />
      {!compact && (
        <span className="rounded-md border border-base-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-base-300">
          Dealer Connect
        </span>
      )}
    </div>
  )
}
