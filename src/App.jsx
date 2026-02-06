import './App.css'
import { ArtworksProvider } from './context/ArtworksContext'
import DiscoveryFeed from './components/DiscoveryFeed'

export default function App() {
  return (
    <ArtworksProvider>
      <DiscoveryFeed />
    </ArtworksProvider>
  )
}
