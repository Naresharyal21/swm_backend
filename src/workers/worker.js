const { Worker } = require("bullmq");
const dayjs = require("dayjs");
const env = require("../config/env");
const { connectMongo } = require("../db/mongoose");
const { aggregateAll } = require("../services/virtualBinService");
const { escalateSla } = require("../services/slaService");
const { generateMonthlyInvoices } = require("../services/billingService");
const { generateRoutesForDate } = require("../services/routeService");
const User = require("../models/User");
const { ROLES } = require("../config/constants");

const connection = {
  host: env.redis.host,
  port: env.redis.port,
};

function log(msg, extra) {
  const prefix = "[worker]";
  if (extra !== undefined) console.log(prefix, msg, extra);
  else console.log(prefix, msg);
}

async function getSystemUserId() {
  if (env.scheduler.userId && env.scheduler.userId.trim())
    return env.scheduler.userId.trim();
  const u = await User.findOne({ role: ROLES.ADMIN }).select("_id").lean();
  return u?._id ? String(u._id) : null;
}

async function start() {
  await connectMongo();
  const systemUserId = await getSystemUserId();

  // DT queue
  new Worker(
    "dt",
    async (job) => {
      if (job.name === "AGGREGATE_VIRTUAL_BINS") {
        await aggregateAll();
        return { ok: true };
      }
      if (job.name === "SLA_ESCALATION") {
        return await escalateSla();
      }
      throw new Error(`Unknown DT job: ${job.name}`);
    },
    { connection },
  ).on("failed", (job, err) => {
    log(`DT job failed: ${job?.name}`, err?.message || err);
  });

  // Routing queue
  new Worker(
    "routing",
    async (job) => {
      if (job.name === "GENERATE_DAILY_ROUTES") {
        const date = dayjs().format("YYYY-MM-DD");
        if (!systemUserId)
          throw new Error("No SCHEDULER_USER_ID set and no admin user found");
        const routes = await generateRoutesForDate({
          date,
          createdByUserId: systemUserId,
        });
        return { date, count: routes.length };
      }
      throw new Error(`Unknown routing job: ${job.name}`);
    },
    { connection },
  ).on("failed", (job, err) => {
    log(`Routing job failed: ${job?.name}`, err?.message || err);
  });

  // Billing queue
  new Worker(
    "billing",
    async (job) => {
      if (job.name === "GENERATE_INVOICES_CRON") {
        const month = dayjs().subtract(1, "month").format("YYYY-MM");
        const results = await generateMonthlyInvoices({ month });
        return { month, count: results.length };
      }
      if (job.name === "GENERATE_INVOICES") {
        const month =
          job.data?.month || dayjs().subtract(1, "month").format("YYYY-MM");
        const results = await generateMonthlyInvoices({ month });
        return { month, count: results.length };
      }
      throw new Error(`Unknown billing job: ${job.name}`);
    },
    { connection },
  ).on("failed", (job, err) => {
    log(`Billing job failed: ${job?.name}`, err?.message || err);
  });

  log("Workers started", { redis: `${env.redis.host}:${env.redis.port}` });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
