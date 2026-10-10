import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/theme/tokens.css';
import '@/ui/theme/global.css';
import '@/ui/theme/fonts';
import { App } from '@/app/App';
import { controller } from '@/app/controller';
import { installHotkeys } from '@/app/hotkeys';

installHotkeys(); // module-level, guarded: safe under StrictMode
// Keys loaded from the session or the local .env.local → connect and run preflight once. Idempotent; no-op on Vercel (no keys).
void controller.autoConnect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
