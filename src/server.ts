import app from './app';
import { config } from './config';

const port = config.server.port;

app.listen(port, () => {
  console.log(`Dating App API running on port ${port} [${config.server.nodeEnv}]`);
});
