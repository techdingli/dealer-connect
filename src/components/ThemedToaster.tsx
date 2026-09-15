import { Toaster } from 'sonner'
import { useTheme } from '@/context/ThemeContext'

/** Keeps sonner's toast theme in sync with the app's light/dark toggle. */
export function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster theme={theme} position="top-right" richColors closeButton />
}
