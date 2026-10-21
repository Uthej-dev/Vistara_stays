import { apiClient } from './client'

export const signup = (body) => apiClient.post('/auth/signup', body).then((r) => r.data)
export const login = (body) => apiClient.post('/auth/login', body).then((r) => r.data)
export const logout = () => apiClient.post('/auth/logout')
export const logoutAll = () => apiClient.post('/auth/logout-all')
export const forgotPassword = (email) => apiClient.post('/auth/forgot-password', { email }).then((r) => r.data)
export const resetPassword = (token, newPassword) => apiClient.post('/auth/reset-password', { token, new_password: newPassword })
export const verifyEmail = (token) => apiClient.post('/auth/verify-email', { token })
export const resendVerification = () => apiClient.post('/auth/resend-verification').then((r) => r.data)
export const changePassword = (current, next) =>
  apiClient.post('/auth/change-password', { current_password: current, new_password: next }).then((r) => r.data)

export const getMe = () => apiClient.get('/users/me').then((r) => r.data)
export const updateMe = (body) => apiClient.patch('/users/me', body).then((r) => r.data)
export const deleteMe = () => apiClient.delete('/users/me')

export const getFavouriteIds = () => apiClient.get('/favourites/ids').then((r) => r.data)
export const getFavourites = (page = 1) => apiClient.get('/favourites', { params: { page, page_size: 12 } }).then((r) => r.data)
export const addFavourite = (resortId) => apiClient.put(`/favourites/${resortId}`)
export const removeFavourite = (resortId) => apiClient.delete(`/favourites/${resortId}`)
export const checkoutSignup = (body) => apiClient.post('/auth/checkout-signup', body).then((r) => r.data)
