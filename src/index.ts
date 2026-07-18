import { createApp } from './app';
import { config } from './config';

const app = createApp().listen(config.port);

console.log(`Elysia Ontime API listening on http://localhost:${app.server?.port}`);
