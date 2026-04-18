import express from 'express';
import cors from 'cors';
import { apiRateLimit } from './middleware/rateLimit.middleware';
import { errorHandler } from './middleware/errorHandler.middleware';
import authRoutes from './modules/auth/auth.routes';
import profileRoutes from './modules/profiles/profiles.routes';
import discoveryRoutes from './modules/discovery/discovery.routes';
import walletRoutes from './modules/wallet/wallet.routes';
import requestRoutes from './modules/requests/requests.routes';
import chatRoutes from './modules/chat/chat.routes';
import meetupRoutes from './modules/meetups/meetups.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use(apiRateLimit);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/discovery', discoveryRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/requests', requestRoutes);
app.use('/api/v1/conversations', chatRoutes);
app.use('/api/v1/meetups', meetupRoutes);

app.use(errorHandler);

export default app;
