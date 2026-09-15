import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={cn('mb-1.5 block text-sm font-medium text-base-100', className)} {...props} />
)

const fieldClasses =
  'w-full rounded-xl border border-base-500 bg-base-900/60 px-3.5 py-2.5 text-sm text-base-50 ' +
  'placeholder:text-base-400 outline-none transition-colors ' +
  'focus:border-orange-500 focus:ring-2 focus:ring-orange-500/25 ' +
  'disabled:opacity-50'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(fieldClasses, className)} {...props} />,
)
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldClasses, 'min-h-28 resize-y', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

export function FieldError({ children }: { children?: string }) {
  if (!children) return null
  return <p className="mt-1.5 text-xs text-red-400">{children}</p>
}
