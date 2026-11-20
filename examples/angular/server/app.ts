import express from 'express';
import { createApiRouter } from './api.js';

// Shared by the standalone Node server and the Vercel function.
export const app = express();
app.disable('x-powered-by');
app.use('/api', createApiRouter());
