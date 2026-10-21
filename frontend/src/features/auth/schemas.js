import { z } from 'zod'

// Mirrors the backend rules (app/schemas/auth.py) for instant feedback; the server re-checks.
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => !/^\d+$/.test(v), 'Password can’t be only numbers')
  .refine((v) => new Set(v).size >= 4, 'Password needs more variety')

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email: z.string().trim().email('Enter a valid email address'),
    password: passwordSchema,
    phone: z
      .string()
      .trim()
      .regex(/^(\+[1-9]\d{7,14})?$/, 'Use international format, e.g. +919876543210')
      .optional(),
    business_name: z.string().trim().max(120).optional(),
    accept: z.literal(true, { message: 'Please accept the terms to continue' }),
  })
  .refine((v) => !v.password.toLowerCase().includes(v.email.split('@')[0].toLowerCase()), {
    path: ['password'],
    message: 'Password must not contain your email',
  })

export const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' })

/** Only allow same-site relative paths after login (prevents open-redirect phishing). */
export function safeNext(next, fallback = '/') {
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')) return next
  return fallback
}
