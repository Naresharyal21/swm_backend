const { Queue } = require('bullmq');
const env = require('../config/env');

const connection = {
  host: env.redis.host,
  port: env.redis.port
};

// Queues
const dtQueue = new Queue('dt', { connection });
const billingQueue = new Queue('billing', { connection });
const routingQueue = new Queue('routing', { connection });

async function closeQueues() {
  await Promise.all([dtQueue.close(), billingQueue.close(), routingQueue.close()]);
}

module.exports = { connection, dtQueue, billingQueue, routingQueue, closeQueues };
