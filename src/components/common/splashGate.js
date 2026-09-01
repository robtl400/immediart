import { readStorage, writeStorage } from '../../utils/storage';

// The launch splash plays once per browser session (tab), not once per page
// load: a pull-to-refresh or a reload mid-visit gets straight to the feed.
// It also plays only when the session starts on the feed — its flier lands in
// the feed's full banner, and a shared /artwork/:id link (or /liked, a grid)
// opens under the collapsed banner, where the landing would not line up.
export const SPLASH_SEEN_KEY = 'immediart_splash_seen';

export const shouldPlaySplash = (pathname = window.location.pathname) =>
  pathname === '/' && readStorage('sessionStorage', SPLASH_SEEN_KEY) !== '1';

export const markSplashSeen = () => { writeStorage('sessionStorage', SPLASH_SEEN_KEY, '1'); };
