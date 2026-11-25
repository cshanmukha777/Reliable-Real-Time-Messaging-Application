import { createApplication } from './application';
import { loadEnvironment } from './config/environment';

async function main() {
  let environment;
  try {
    environment = loadEnvironment(process.env);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Invalid API configuration.',
    );
    process.exitCode = 1;
    return;
  }
  const app = await createApplication(environment);
  try {
    app.enableShutdownHooks();
    await app.listen(environment.PORT, environment.HOST);
  } catch {
    await app.close();
    throw new Error('API listen failed.');
  }
}

void main().catch(() => {
  console.error('ChatApp API failed to start.');
  process.exitCode = 1;
});
