import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/ui/theme/tokens.css';
import '@/ui/theme/global.css';
import '@/ui/theme/fonts';
import { App } from '@/app/App';
import { installHotkeys } from '@/app/hotkeys';

installHotkeys(); // module-level, guarded: safe under StrictMode

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
