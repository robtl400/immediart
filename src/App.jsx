import { Routes, Route } from 'react-router-dom'
import './App.css'
import { ArtworksProvider } from './context/ArtworksContext'
import { GridBrowseProvider } from './context/GridBrowseContext'
import { ArtworkModalProvider } from './context/ArtworkModalContext'
import DiscoveryFeed from './components/DiscoveryFeed'
import GridBrowse from './components/GridBrowse'
import ArtworkModal from './components/ArtworkModal'

export default function App() {
  return (
    <ArtworksProvider>
      <GridBrowseProvider>
        <ArtworkModalProvider>
          <Routes>
            <Route path="/" element={<DiscoveryFeed />} />
            <Route path="/artist/:artistName" element={<GridBrowse type="artist" />} />
            <Route path="/tag/:tagName" element={<GridBrowse type="tag" />} />
          </Routes>
          <ArtworkModal />
        </ArtworkModalProvider>
      </GridBrowseProvider>
    </ArtworksProvider>
  )
}
