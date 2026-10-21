import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import AuthLayout from '../../layouts/AuthLayout'
import { FormAlert, PasswordField, SubmitButton, TextField } from '../../components/ui/Form'
import { homeFor, useAuth } from '../../features/auth/AuthProvider'
import { loginSchema, safeNext } from '../../features/auth/schemas'
import { toApiError } from '../../api/client'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      const user = await login(values)
      navigate(safeNext(params.get('next'), homeFor(user.role)), { replace: true })
    } catch (error) {
      setServerError(toApiError(error).message)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to book stays, save favourites and manage trips.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <FormAlert>{serverError}</FormAlert>
        <TextField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <PasswordField autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-forest-700 underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>
        <SubmitButton loading={isSubmitting} className="w-full">
          Log in
        </SubmitButton>
      </form>
      <p className="mt-8 text-center text-sm text-ink-600">
        New to Vistara?{' '}
        <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`} className="font-semibold text-forest-800 underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-ink-600">
        Own a property?{' '}
        <Link to="/owners/register" className="font-semibold text-forest-800 underline-offset-4 hover:underline">
          Register as an owner
        </Link>
      </p>
    </AuthLayout>
  )
}
