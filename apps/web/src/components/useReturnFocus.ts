import { useRef } from 'react'

/**
 * Dialogs opened from state (no Radix Dialog.Trigger) lose focus to <body> when they close, so keyboard and
 * screen-reader users lose their place. Remember what had focus when the dialog first rendered and give it back.
 * Use as `onCloseAutoFocus` on Dialog.Content.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  if (opener.current === null && typeof document !== 'undefined') opener.current = document.activeElement as HTMLElement | null
  return (event: Event) => {
    event.preventDefault()
    const el = opener.current
    if (el && el.isConnected && el !== document.body) el.focus()
  }
}
