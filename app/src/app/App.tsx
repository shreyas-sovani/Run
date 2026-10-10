import { controller } from '@/app/controller';
import { Routes } from '@/app/routes';

// Module-level and idempotent: the controller singleton exists exactly once, whatever React does.
controller.init();

export function App() {
  return <Routes />;
}
