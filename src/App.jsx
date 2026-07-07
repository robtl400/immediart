import { Routes, Route, useLocation } from 'react-router-dom'
import './App.css'
import { ArtworksProvider } from './context/ArtworksContext'
import { GridBrowseProvider } from './context/GridBrowseContext'
import { ArtworkModalProvider } from './context/ArtworkModalContext'
import { LikesProvider } from './context/LikesContext'
import DiscoveryFeed from './components/feed/DiscoveryFeed'
import GridBrowse from './components/grid/GridBrowse'
import LikedGrid from './components/grid/LikedGrid'
import ArtworkModal from './components/modal/ArtworkModal'
import NotFound from './components/common/NotFound'
import ErrorBoundary from './components/common/ErrorBoundary'

// The artwork modal is a route (/artwork/:id) rendered OVER whatever page the
// user was on — the URL is the single source of truth for whether it's open.
//   - Opened from a page: openModal() pushes /artwork/:id with state.background,
//     so the page routes render at `background` and the modal renders on top.
//   - Direct load / shared link: no background, so we substitute "/" as the page
//     location — the feed renders behind the modal with no redirect dance.
function AppRoutes() {
  const location = useLocation()
  const background = location.state?.background
  const isArtworkRoute = location.pathname.startsWith('/artwork/')
  const pageLocation = background ?? (isArtworkRoute ? { ...location, pathname: '/' } : location)

  return (
    <>
      <Routes location={pageLocation}>
        <Route path="/" element={<DiscoveryFeed />} />
        <Route path="/liked" element={<LikedGrid />} />
        <Route path="/artist/:artistName" element={<GridBrowse type="artist" />} />
        <Route path="/tag/:tagName" element={<GridBrowse type="tag" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      {/* Matches only when the real URL is /artwork/:id — mount IS "open". */}
      <Routes>
        <Route path="/artwork/:artworkId" element={<ArtworkModal />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <LikesProvider>
      <ArtworksProvider>
        <GridBrowseProvider>
          <ArtworkModalProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </ArtworkModalProvider>
        </GridBrowseProvider>
      </ArtworksProvider>
    </LikesProvider>
  )
}
