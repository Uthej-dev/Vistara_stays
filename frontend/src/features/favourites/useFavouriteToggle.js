import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router'
import * as authApi from '../../api/auth'
import { toApiError } from '../../api/client'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from '../../components/ui/Toast'

export const favouriteKeys = { ids: ['favourites', 'ids'], list: (page) => ['favourites', 'list', page] }

/**
 * Favourite hearts for resort cards. Customers toggle instantly (optimistic update, rolled back
 * on error); visitors are sent to log in; owners/admins don't get the button behaviour.
 */
export function useFavouriteToggle() {
  const { user, status } = useAuth()
  const isCustomer = user?.role === 'customer'
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const { data: ids = [] } = useQuery({
    queryKey: favouriteKeys.ids,
    queryFn: authApi.getFavouriteIds,
    enabled: isCustomer,
  })

  const mutation = useMutation({
    mutationFn: ({ id, save }) => (save ? authApi.addFavourite(id) : authApi.removeFavourite(id)),
    onMutate: async ({ id, save }) => {
      await queryClient.cancelQueries({ queryKey: favouriteKeys.ids })
      const previous = queryClient.getQueryData(favouriteKeys.ids) ?? []
      queryClient.setQueryData(favouriteKeys.ids, save ? [...previous, id] : previous.filter((x) => x !== id))
      return { previous }
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(favouriteKeys.ids, context.previous)
      toast.error(toApiError(error).message)
    },
    onSuccess: (_data, { save }) => toast.success(save ? 'Saved to favourites' : 'Removed from favourites'),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['favourites'] }),
  })

  const toggle = (resort) => {
    if (status !== 'authenticated') {
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
      return
    }
    if (!isCustomer) {
      toast.error('Favourites are available on customer accounts.')
      return
    }
    mutation.mutate({ id: resort.id, save: !ids.includes(resort.id) })
  }

  return {
    ids,
    toggle,
    isFavourite: (id) => ids.includes(id),
    cardProps: (resort) => ({ onToggleFavourite: toggle, isFavourite: ids.includes(resort.id) }),
  }
}
