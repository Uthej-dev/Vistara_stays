import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { BadgeCheck, MailWarning } from 'lucide-react'
import { Container } from '../components/ui/Section'
import { FormAlert, PasswordField, SubmitButton, TextField } from '../components/ui/Form'
import { useToast } from '../components/ui/Toast'
import { useAuth } from '../features/auth/AuthProvider'
import { passwordSchema } from '../features/auth/schemas'
import * as authApi from '../api/auth'
import { fieldErrors, toApiError } from '../api/client'

function Card({ title, description, children }) {
  return (
    <section className="rounded-3xl bg-white p-6 ring-1 ring-forest-900/5 sm:p-8">
      <h2 className="font-display text-2xl text-forest-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
      <div className="mt-6">{children}</div>
    </section>
  )
}

function ProfileForm() {
  const { user, setUser } = useAuth()
  const toast = useToast()
  const [serverError, setServerError] = useState(null)
  const schema = z.object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    phone: z.string().trim().regex(/^(\+[1-9]\d{7,14})?$/, 'Use international format, e.g. +919876543210'),
    business_name: z.string().trim().max(120).optional(),
  })
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name, phone: user.phone ?? '', business_name: user.owner_profile?.business_name ?? '' },
  })

  const onSubmit = async ({ name, phone, business_name }) => {
    setServerError(null)
    try {
      const body = { name, phone: phone || null }
      if (user.role === 'owner') body.owner_profile = { ...(user.owner_profile ?? {}), business_name: business_name || null }
      const updated = await authApi.updateMe(body)
      setUser(updated)
      reset({ name: updated.name, phone: updated.phone ?? '', business_name: updated.owner_profile?.business_name ?? '' })
      toast.success('Profile saved')
    } catch (error) {
      const byField = fieldErrors(error)
      Object.entries(byField).forEach(([field, message]) => setError(field, { message }))
      if (!Object.keys(byField).length) setServerError(toApiError(error).message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormAlert>{serverError}</FormAlert>
      </div>
      <TextField label="Full name" autoComplete="name" error={errors.name?.message} {...register('name')} />
      <TextField label="Mobile number" type="tel" autoComplete="tel" placeholder="+919876543210" error={errors.phone?.message} {...register('phone')} />
      {user.role === 'owner' && <TextField label="Business name" error={errors.business_name?.message} {...register('business_name')} />}
      <TextField label="Email" value={user.email} readOnly disabled hint="Contact support to change your email." />
      <div className="sm:col-span-2">
        <SubmitButton loading={isSubmitting} disabled={!isDirty || isSubmitting}>
          Save changes
        </SubmitButton>
      </div>
    </form>
  )
}

function PasswordForm() {
  const { applySession } = useAuth()
  const toast = useToast()
  const [serverError, setServerError] = useState(null)
  const schema = z
    .object({ current: z.string().min(1, 'Enter your current password'), next: passwordSchema, confirm: z.string() })
    .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Passwords don’t match' })
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async ({ current, next }) => {
    setServerError(null)
    try {
      applySession(await authApi.changePassword(current, next))
      reset()
      toast.success('Password changed. Other devices have been signed out.')
    } catch (error) {
      setServerError(toApiError(error).message)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormAlert>{serverError}</FormAlert>
      </div>
      <PasswordField label="Current password" autoComplete="current-password" error={errors.current?.message} {...register('current')} className="sm:col-span-2" />
      <PasswordField label="New password" autoComplete="new-password" error={errors.next?.message} {...register('next')} />
      <PasswordField label="Confirm new password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
      <div className="sm:col-span-2">
        <SubmitButton loading={isSubmitting}>Change password</SubmitButton>
      </div>
    </form>
  )
}

export default function AccountPage() {
  const { user, logout, signOutLocally } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'Your account · Vistara Stays'
  }, [])

  const resend = async () => {
    try {
      await authApi.resendVerification()
      toast.success('Verification email sent. Check your inbox.')
    } catch (error) {
      toast.error(toApiError(error).message)
    }
  }

  const logoutEverywhere = async () => {
    setBusy(true)
    try {
      await authApi.logoutAll()
      signOutLocally()
      navigate('/login')
    } catch (error) {
      toast.error(toApiError(error).message)
    } finally {
      setBusy(false)
    }
  }

  const deleteAccount = async () => {
    if (!window.confirm('Delete your account? Your bookings are kept for our records but your profile is removed. This cannot be undone.')) return
    try {
      await authApi.deleteMe()
      signOutLocally()
      navigate('/')
      toast.success('Your account has been deleted.')
    } catch (error) {
      toast.error(toApiError(error).message)
    }
  }

  return (
    <Container className="max-w-3xl py-12">
      <h1 className="font-display text-4xl text-forest-900">Your account</h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-ink-600">
        {user.email}
        {user.email_verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-forest-100 px-2.5 py-0.5 text-xs font-medium text-forest-800">
            <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-clay-600/10 px-2.5 py-0.5 text-xs font-medium text-clay-600">
            <MailWarning className="size-3.5" aria-hidden="true" /> Not verified
          </span>
        )}
      </p>

      {!user.email_verified && (
        <div className="mt-6">
          <FormAlert>
            Verify your email to book stays.{' '}
            <button type="button" onClick={resend} className="font-semibold underline">
              Resend verification email
            </button>
          </FormAlert>
        </div>
      )}

      <div className="mt-8 space-y-6">
        <Card title="Profile">
          <ProfileForm />
        </Card>
        <Card title="Password" description="Changing your password signs you out on other devices.">
          <PasswordForm />
        </Card>
        <Card title="Sessions & privacy">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => logout().then(() => navigate('/'))} className="h-11 rounded-full px-5 text-sm font-medium ring-1 ring-forest-900/15 hover:bg-forest-100">
              Log out
            </button>
            <button type="button" disabled={busy} onClick={logoutEverywhere} className="h-11 rounded-full px-5 text-sm font-medium ring-1 ring-forest-900/15 hover:bg-forest-100">
              Log out on all devices
            </button>
            <button type="button" onClick={deleteAccount} className="h-11 rounded-full px-5 text-sm font-medium text-clay-600 ring-1 ring-clay-600/30 hover:bg-clay-600/10">
              Delete account
            </button>
          </div>
        </Card>
      </div>
    </Container>
  )
}
