import cors from 'cors';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import routes from './api/routes/index.js';
import path from "path";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/api/views'))



app.enable('json spaces');
app.enable('strict routing');
app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')))
app.use(routes);

export default app;
