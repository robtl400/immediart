import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

// decodeURIComponent throws on malformed escapes — fall back to the raw text.
function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Full-width search input that takes over the banner masthead. Mounted by Banner
 * only while search is open (its open/closed state lives there so the input can
 * span the whole header). Owns just the input behaviour:
 *   - autofocuses on mount; prefilled with the current query on /search pages so
 *     the box refines-in-place rather than starting blank.
 *   - Enter (form submit) navigates to /search/:query and closes.
 *   - Escape, the back chevron, or a tap outside the field closes it. `onClose`
 *     restores focus to the magnifier toggle; submit passes {refocus:false} since
 *     we're navigating away.
 */
export default function BannerSearch({ onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef(null);

  const initial = location.pathname.startsWith('/search/')
    ? safeDecode(location.pathname.slice('/search/'.length))
    : '';
  const [value, setValue] = useState(initial);

  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Tap/click outside the field collapses it. pointerdown (not click) so it
  // beats the focus churn; the opening click already completed before this
  // listener attached, so it can't self-close.
  useEffect(() => {
    const onDown = (e) => {
      if (!formRef.current?.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    onClose({ refocus: false });
    navigate(`/search/${encodeURIComponent(q)}`);
  };

  // Escape closes; Tab is trapped among the overlay's three controls so keyboard
  // focus can't slip onto the buttons it covers or into the feed behind it.
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'Tab') {
      const focusables = formRef.current?.querySelectorAll('button, input');
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };

  return (
    <form id="banner-search" className="banner-search" role="search" ref={formRef} onSubmit={submit} onKeyDown={onKeyDown}>
      <button
        type="button"
        className="banner-search-back"
        onClick={() => onClose()}
        aria-label="Close search"
      >
        ‹
      </button>
      <input
        ref={inputRef}
        data-search-input
        type="search"
        className="banner-search-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search the Met collection"
        aria-label="Search the Met collection"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
      />
      <button type="submit" className="banner-icon-btn banner-search-go" aria-label="Search">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="7" />
          <line x1="15.6" y1="15.6" x2="21" y2="21" />
        </svg>
      </button>
    </form>
  );
}
