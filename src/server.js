const { connectMongo } = require('./db/mongoose');
const { createApp } = require('./app');
const env = require('./config/env');
const { ensureRepeatableJobs } = require('./jobs/scheduler');

async function main() {
  await connectMongo();

  try {
    const sched = await ensureRepeatableJobs();
    if (sched?.enabled) {
      console.log('Scheduler enabled', sched.jobs);
    } else {
      console.log('Scheduler disabled');
    }
  } catch (err) {
    console.error('Failed to ensure repeatable jobs', err);
  }

  const app = createApp();
  app.listen(env.server.port, () => {
    console.log(`API running on port ${env.server.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
