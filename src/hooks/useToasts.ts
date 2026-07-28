import { useState } from 'react'
import type { Toast } from '../types'

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const pushToast = (message: string, tone: Toast['tone'] = 'info', duration = 4000) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, duration)
  }

  const dismissToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }

  return { toasts, pushToast, dismissToast }
}
