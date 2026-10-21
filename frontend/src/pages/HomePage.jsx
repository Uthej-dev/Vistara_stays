import { useEffect } from 'react'
import Hero from '../features/home/Hero'
import PopularDestinations from '../features/home/PopularDestinations'
import FeaturedResorts from '../features/home/FeaturedResorts'
import Categories from '../features/home/Categories'
import Collections from '../features/home/Collections'
import TrustAndReviews from '../features/home/TrustAndReviews'

export default function HomePage() {
  useEffect(() => {
    document.title = 'Vistara Stays — Resorts & retreats across South India'
  }, [])

  return (
    <>
      <Hero />
      <PopularDestinations />
      <FeaturedResorts />
      <Categories />
      <Collections />
      <TrustAndReviews />
    </>
  )
}
