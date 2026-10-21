import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CircleCheck, MailCheck } from 'lucide-react'
import AuthLayout from '../../layouts/AuthLayout'
import { FormAlert, PasswordField, SubmitButton, TextField } from '../../components/ui/Form'
import { Spinner } from '../../components/ui/States'
import Button from '../../components/ui/Button'
import * as authApi from '../../api/auth'
import { toApiError } from '../../api/client'
import { resetSchema } from '../../features/auth/schemas'
import { useAuth } from '../../features/auth/AuthProvider'

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email address') })) })

  const onSubmit = async ({ email }) => {
    setServerError(null)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (error) {
      setServerError(toApiError(error).message)
    }
  }

  return (
    <AuthLayout title="Reset your password" subtitle="We’ll email you a link to choose a new password.">
      {sent ? (
        <div className="rounded-2xl bg-forest-100 p-6 text-forest-900" role="status">
          <MailCheck className="size-8" aria-hidden="true" />
          <p className="mt-3 font-semibold">Check your inbox</p>
          <p className="mt-1 text-sm">If an account exists for that email, a reset link is on its way. It expires in 30 minutes.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <FormAlert>{serverError}</FormAlert>
          <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <SubmitButton loading={isSubmitting} className="w-full">
            Send reset link
          </SubmitButton>
        </form>
      )}
      <p className="mt-8 text-center text-sm">
        <Link to="/login" className="font-semibold text-forest-800 underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetSchema) })

  const onSubmit = async ({ password }) => {
    setServerError(null)
    try {
      await authApi.resetPassword(token, password)
      setDone(true)
    } catch (error) {
      setServerError(toApiError(error).message)
    }
  }

  return (
    <AuthLayout title="Choose a new password">
      {!token ? (
        <FormAlert>This reset link is incomplete. Please request a new one.</FormAlert>
      ) : done ? (
        <div className="space-y-5" role="status">
          <FormAlert tone="success">Your password has been changed. You’ve been signed out on all devices.</FormAlert>
          <Button to="/login" className="w-full">
            Log in
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <FormAlert>{serverError}</FormAlert>
          <PasswordField label="New password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
          <PasswordField label="Confirm new password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
          <SubmitButton loading={isSubmitting} className="w-full">
            Save new password
          </SubmitButton>
        </form>
      )}
    </AuthLayout>
  )
}

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const { user, setUser } = useAuth()
  const [state, setState] = useState(token ? 'verifying' : 'missing')
  const [message, setMessage] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return // StrictMode runs effects twice in dev; tokens are single-use
    started.current = true
    authApi
      .verifyEmail(token)
      .then(() => setState('done'))
      .catch((error) => {
        setMessage(toApiError(error).message)
        setState('error')
      })
  }, [token])

  useEffect(() => {
    if (state === 'done' && user && !user.email_verified) setUser({ ...user, email_verified: true })
  }, [state, user, setUser])

  return (
    <AuthLayout title="Verify your email">
      {state === 'verifying' && (
        <p role="status" className="flex items-center gap-2 text-ink-600">
          <Spinner /> Confirming your email…
        </p>
      )}
      {state === 'done' && (
        <div role="status" className="rounded-2xl bg-forest-100 p-6 text-forest-900">
          <CircleCheck className="size-8" aria-hidden="true" />
          <p className="mt-3 font-semibold">Email verified</p>
          <p className="mt-1 text-sm">You can now book stays.</p>
          <Button to="/" className="mt-5">
            Find a stay
          </Button>
        </div>
      )}
      {state === 'error' && <FormAlert>{message} You can request a new link from your account page.</FormAlert>}
      {state === 'missing' && <FormAlert>This verification link is incomplete.</FormAlert>}
    </AuthLayout>
  )
}
