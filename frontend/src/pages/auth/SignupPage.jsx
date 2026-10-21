import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import AuthLayout from '../../layouts/AuthLayout'
import { FormAlert, PasswordField, SubmitButton, TextField } from '../../components/ui/Form'
import { homeFor, useAuth } from '../../features/auth/AuthProvider'
import { safeNext, signupSchema } from '../../features/auth/schemas'
import { fieldErrors, toApiError } from '../../api/client'
import { useToast } from '../../components/ui/Toast'

/** Customer sign-up at /signup; owner sign-up at /owners/register (accountType="owner"). */
export default function SignupPage({ accountType = 'customer' }) {
  const isOwner = accountType === 'owner'
  const { signup } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(signupSchema) })

  const onSubmit = async ({ accept: _accept, phone, business_name, ...values }) => {
    setServerError(null)
    try {
      const user = await signup({
        ...values,
        account_type: accountType,
        ...(phone ? { phone } : {}),
        ...(isOwner && business_name ? { business_name } : {}),
      })
      toast.success('Account created. Check your email to verify your address.')
      navigate(safeNext(params.get('next'), homeFor(user.role)), { replace: true })
    } catch (error) {
      const byField = fieldErrors(error)
      Object.entries(byField).forEach(([name, message]) => setError(name, { message }))
      if (!Object.keys(byField).length) setServerError(toApiError(error).message)
    }
  }

  return (
    <AuthLayout
      title={isOwner ? 'List your property' : 'Create your account'}
      subtitle={isOwner ? 'Create an owner account to register resorts and manage bookings.' : 'Save favourites, book stays and keep track of your trips.'}
      photo={isOwner ? 'coorg' : 'varkala'}
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <FormAlert>{serverError}</FormAlert>
        <TextField label="Full name" autoComplete="name" error={errors.name?.message} {...register('name')} />
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        {isOwner && <TextField label="Business name (optional)" autoComplete="organization" error={errors.business_name?.message} {...register('business_name')} />}
        <TextField
          label="Mobile number (optional)"
          type="tel"
          autoComplete="tel"
          placeholder="+919876543210"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <PasswordField
          autoComplete="new-password"
          hint="At least 10 characters. A short phrase works well."
          error={errors.password?.message}
          {...register('password')}
        />
        <label className="flex items-start gap-2.5 text-sm text-ink-900">
          <input type="checkbox" className="mt-0.5 size-4 accent-forest-800" aria-invalid={Boolean(errors.accept)} {...register('accept')} />
          <span>
            I agree to the{' '}
            <Link to="/terms" className="underline">
              terms of use
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline">
              privacy policy
            </Link>
            .
          </span>
        </label>
        {errors.accept && <p className="-mt-3 text-xs text-clay-600">{errors.accept.message}</p>}
        <SubmitButton loading={isSubmitting} className="w-full">
          {isOwner ? 'Create owner account' : 'Create account'}
        </SubmitButton>
      </form>
      <p className="mt-8 text-center text-sm text-ink-600">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-forest-800 underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  )
}
