import { Routes, Route } from 'react-router-dom'
import './App.css'
import { ArtworksProvider } from './context/ArtworksContext'
import { GridBrowseProvider } from './context/GridBrowseContext'
import { ArtworkModalProvider } from './context/ArtworkModalContext'
import DiscoveryFeed from './components/feed/DiscoveryFeed'
import GridBrowse from './components/grid/GridBrowse'
import ArtworkModal from './components/modal/ArtworkModal'
import ArtworkDeepLink from './components/ArtworkDeepLink'
import NotFound from './components/common/NotFound'
import ErrorBoundary from './components/common/ErrorBoundary'

export default function App() {
  return (
    <ArtworksProvider>
      <GridBrowseProvider>
        <ArtworkModalProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<DiscoveryFeed />} />
              <Route path="/artist/:artistName" element={<GridBrowse type="artist" />} />
              <Route path="/tag/:tagName" element={<GridBrowse type="tag" />} />
              <Route path="/artwork/:artworkId" element={<ArtworkDeepLink />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <ArtworkModal />
          </ErrorBoundary>
        </ArtworkModalProvider>
      </GridBrowseProvider>
    </ArtworksProvider>
  )
}
