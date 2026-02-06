const dayjs = require('dayjs');
const env = require('../config/env');
const { dtQueue, billingQueue, routingQueue } = require('./queues');

async function ensureRepeatableJobs() {
  if (!env.scheduler.enabled) return { enabled: false };

  // Digital Twin: Virtual bin aggregation every 15 minutes
  await dtQueue.add(
    'AGGREGATE_VIRTUAL_BINS',
    {},
    {
      jobId: 'AGGREGATE_VIRTUAL_BINS',
      repeat: { every: 15 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 100
    }
  );

  // SLA escalation every 5 minutes
  await dtQueue.add(
    'SLA_ESCALATION',
    {},
    {
      jobId: 'SLA_ESCALATION',
      repeat: { every: 5 * 60 * 1000 },
      removeOnComplete: true,
      removeOnFail: 100
    }
  );

  // Daily route generation at 06:00
  await routingQueue.add(
    'GENERATE_DAILY_ROUTES',
    {},
    {
      jobId: 'GENERATE_DAILY_ROUTES',
      repeat: { pattern: env.scheduler.dailyRoutesCron },
      removeOnComplete: true,
      removeOnFail: 100
    }
  );

  // Monthly invoices on configured day (default: 1st), 01:00
  await billingQueue.add(
    'GENERATE_INVOICES_CRON',
    {},
    {
      jobId: 'GENERATE_INVOICES_CRON',
      repeat: { pattern: env.scheduler.monthlyInvoicesCron },
      removeOnComplete: true,
      removeOnFail: 100
    }
  );

  return {
    enabled: true,
    jobs: {
      dailyRoutesCron: env.scheduler.dailyRoutesCron,
      monthlyInvoicesCron: env.scheduler.monthlyInvoicesCron
    }
  };
}

async function enqueueNow(queueName, jobName, payload = {}) {
  if (queueName === 'dt') return dtQueue.add(jobName, payload, { removeOnComplete: true, removeOnFail: 100 });
  if (queueName === 'billing') return billingQueue.add(jobName, payload, { removeOnComplete: true, removeOnFail: 100 });
  if (queueName === 'routing') return routingQueue.add(jobName, payload, { removeOnComplete: true, removeOnFail: 100 });
  throw new Error(`Unknown queue: ${queueName}`);
}

module.exports = { ensureRepeatableJobs, enqueueNow };
