const path = require("path");
const dotenv = require("dotenv");

// Load .env from current dir, then parent, then grandparent
const envPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
];

for (const p of envPaths) {
  dotenv.config({ path: p });
}

function get(name, fallback) {
  return process.env[name] ?? fallback;
}

function required(name, fallback) {
  const v = get(name, fallback);
  if (v === undefined || v === null || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

const invoiceDayOfMonth = Number(get("INVOICE_DAY_OF_MONTH", 1));
const monthlyInvoicesCronDefault = `0 1 ${invoiceDayOfMonth} * *`;

const env = {
  nodeEnv: get("NODE_ENV", "development"),
  server: {
    port: Number(get("PORT", 8080)),
    corsOrigin: get("CORS_ORIGIN", "*"),
  },

  mongoUri: required("MONGO_URI", "mongodb://localhost:27017/smartwaste"),

  redis: {
    host: get("REDIS_HOST", "127.0.0.1"), // default to IPv4 (avoid ::1)
    port: Number(get("REDIS_PORT", 6379)),
  },

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", "change_me_access"),
    refreshSecret: required("JWT_REFRESH_SECRET", "change_me_refresh"),
    accessExpiresIn: get("JWT_ACCESS_EXPIRES_IN", "15m"),
    refreshExpiresIn: get("JWT_REFRESH_EXPIRES_IN", "7d"),
  },

  s3: {
    endpoint: required("S3_ENDPOINT", "http://localhost:9000"),
    region: get("S3_REGION", "us-east-1"),
    bucket: get("S3_BUCKET", "swm-evidence"),
    accessKey: get("S3_ACCESS_KEY", "minioadmin"),
    secretKey: get("S3_SECRET_KEY", "minioadmin"),
    forcePathStyle:
      String(get("S3_FORCE_PATH_STYLE", "true")).toLowerCase() === "true",
  },

  googleMaps: {
    apiKey: get("GOOGLE_MAPS_API_KEY", ""),
    useDistanceMatrix:
      String(get("GOOGLE_MAPS_USE_DISTANCE_MATRIX", "true")).toLowerCase() ===
      "true",
  },

  dt: {
    over80Threshold: Number(get("VIRTUAL_BIN_OVER80_THRESHOLD", 0.35)),
    over95Threshold: Number(get("VIRTUAL_BIN_OVER95_THRESHOLD", 0.1)),
    riskThreshold: Number(get("VIRTUAL_BIN_RISK_THRESHOLD", 70)),
    scooterBufferPercent: Number(get("SCOOTER_BUFFER_PERCENT", 0.25)),
  },

  billing: {
    bulkyDailyCharge: Number(get("BULKY_DAILY_CHARGE", 50)),
    invoiceDayOfMonth,
  },

  scheduler: {
    enabled: String(get("SCHEDULER_ENABLED", "true")).toLowerCase() === "true",
    userId: get("SCHEDULER_USER_ID", ""),
    dailyRoutesCron: get("DAILY_ROUTES_CRON", "0 6 * * *"),
    monthlyInvoicesCron: get(
      "MONTHLY_INVOICES_CRON",
      monthlyInvoicesCronDefault
    ),
  },

  khalti: {
    env: get("KHALTI_ENV", "sandbox"),
    publicKey: get("KHALTI_PUBLIC_KEY", ""),
    secretKey: get("KHALTI_SECRET_KEY", ""),
    initiateUrl: get(
      "KHALTI_INITIATE_URL",
      "https://a.khalti.com/api/v2/epayment/initiate/"
    ),
  },

  ai: {
    baseUrl: get("AI_BASE_URL", "http://localhost:8001"),
  },
};

module.exports = env;
