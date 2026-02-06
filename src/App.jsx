import { Routes, Route } from 'react-router-dom'
import './App.css'
import { ArtworksProvider } from './context/ArtworksContext'
import { GridBrowseProvider } from './context/GridBrowseContext'
import DiscoveryFeed from './components/DiscoveryFeed'
import GridBrowse from './components/GridBrowse'

export default function App() {
  return (
    <ArtworksProvider>
      <GridBrowseProvider>
        <Routes>
          <Route path="/" element={<DiscoveryFeed />} />
          <Route path="/artist/:artistName" element={<GridBrowse type="artist" />} />
          <Route path="/tag/:tagName" element={<GridBrowse type="tag" />} />
        </Routes>
      </GridBrowseProvider>
    </ArtworksProvider>
  )
}
