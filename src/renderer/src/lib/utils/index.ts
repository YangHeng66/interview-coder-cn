import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
export * from './env'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function getCloneableFields<T extends object>(obj: T): Partial<T> {
  const cloneable: Partial<T> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (isCloneableValue(value)) {
      cloneable[key as keyof T] = value as T[keyof T]
    }
  }

  return cloneable
}

function isCloneableValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'function' || typeof value === 'symbol') return false
  if (value instanceof WeakMap || value instanceof WeakSet) return false

  try {
    JSON.stringify(value)
    return true
  } catch {
    return false
  }
}
