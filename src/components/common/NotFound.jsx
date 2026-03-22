import Banner from './Banner';

export default function NotFound() {
  return (
    <div className="not-found-page">
      <Banner isScrolled={true} />
      <div className="not-found-content">
        <p className="not-found-text">Page not found</p>
      </div>
    </div>
  );
}
