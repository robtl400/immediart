import Banner from '../common/Banner';
import useGoBack from '../../hooks/useGoBack';

// The masthead of every grid-shaped view: the banner, a back control and the
// term the grid shows. A module-level component, so the subtree keeps its
// identity across the view's renders.
export default function GridHeader({ displayTerm, isQuery = false }) {
  const goBack = useGoBack();
  return (
    <>
      <Banner />
      <div className="search-heading">
        <button className="grid-back-btn" onClick={goBack} aria-label="Back">
          ‹
        </button>
        {/* A typed query is verbatim user text, so it renders in the UI sans-serif
            (Outfit); artist/tag handles keep the decorative Allura script. */}
        <h2 className={`search-term${isQuery ? ' search-term--query' : ''}`}>{displayTerm}</h2>
      </div>
    </>
  );
}
