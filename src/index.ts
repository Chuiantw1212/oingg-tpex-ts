import express from 'ultimate-express';
import { swaggerUi, swaggerSpec } from './adapters/swagger/index';
import { config } from './shared/config';
import { connectDb } from './adapters/db/index';
import routes from './routes';

const app = express();

// --- Middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// --- Routes ---
app.use(routes);

// --- Server Start ---
const startServer = async () => {
  await connectDb(); // Connect to DB on startup
  const host = config.isProduction ? '0.0.0.0' : 'localhost';
  const port = Number(config.port);
  app.listen(port, host, () => {
    console.log(`[server]: Server is running at http://${host}:${port}`);
    if (!config.isProduction) {
      console.log(`[server]: API docs available at http://localhost:${port}/api-docs`);
    }
  });
};
startServer();
