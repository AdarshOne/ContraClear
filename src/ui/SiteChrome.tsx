// Public (signed-out) pages wear the main site's nav and footer, exactly as given in the handoff brief.
// The markup is injected verbatim so it stays identical to adarshsharma.ca; it is static and contains no user data.
import type { ReactNode } from 'react';
import '@fontsource/inter-tight/400.css';
import '@fontsource/inter-tight/500.css';
import '@fontsource/inter-tight/600.css';
import '@fontsource/inter-tight/800.css';
import '@fontsource/roboto-serif/300.css';
import '@fontsource/roboto-serif/500.css';
import '@fontsource/noto-serif-devanagari/600.css';
import './chrome.css';
const NAV = `<!--email_off-->
<nav class="nav" aria-label="Main" style="display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 0 36px; width: 100%; box-sizing: border-box; padding: 12px 24px; border-bottom: 1px solid #e8e8ed; font-size: 15px; font-weight: 500;">
<a href="/" aria-label="Adarsh Sharma, home" style="display: inline-flex; align-items: center; min-height: 44px; font-family: 'Noto Serif Devanagari', serif; font-size: 20px; font-weight: 600; color: #000; text-decoration: none;"><span class="brand" aria-hidden="true"><span class="cube"><span class="face f1" lang="sa">आदर्श</span><span class="face f2 en" lang="en">Adarsh</span><span class="face f3" lang="sa">आदर्श</span><span class="face f4 en" lang="en">Adarsh</span></span></span></a>
<a href="/#lab" style="display: inline-flex; align-items: center; min-height: 44px; color: #1d1d1f; text-decoration: none;">Lab</a>
<a href="/#about" style="display: inline-flex; align-items: center; min-height: 44px; color: #1d1d1f; text-decoration: none;">About</a>
<a href="https://www.linkedin.com/in/adarsh-one/" target="_blank" rel="noopener" aria-label="LinkedIn (opens in a new tab)" style="display: inline-flex; align-items: center; gap: 6px; min-height: 44px; color: #1d1d1f; text-decoration: none;"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg><span class="li-text">LinkedIn</span></a>
</nav>`;
const FOOT = `<footer id="contact" class="contact dark-zone">
<p class="contact-lead serif">Built with intention.</p>
<p class="contact-sub">Questions, ideas, or a problem worth solving?</p>
<a class="mail serif" href="mailto:hello@adarshsharma.ca">hello@adarshsharma.ca</a>
<div class="foot">
<a href="https://www.linkedin.com/in/adarsh-one/" target="_blank" rel="noopener"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z"/></svg>LinkedIn</a>
<span lang="sa" style="font-family: 'Noto Serif Devanagari', serif; font-size: 15px;">कर्मण्येवाधिकारस्ते</span>
<span>© 2026 Adarsh Sharma</span>
</div>
</footer>
<!--/email_off-->`;
export const SiteChrome = ({ children }: { children: ReactNode }) => <div className="site-chrome-body">
  <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: NAV }} />
  {children}
  <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: FOOT }} />
</div>;
