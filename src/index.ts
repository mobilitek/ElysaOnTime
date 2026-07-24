import { createApp } from './app';
import { config } from './config';

// Point d'entrée minimal : toute la composition de l'API demeure dans createApp,
// ce qui permet de réutiliser exactement la même application dans les tests.
const app = createApp().listen(config.port);

console.log(`Elysia Ontime API listening on http://localhost:${app.server?.port}`);
