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

const port = Number(get("PORT", 5000));

const env = {
  nodeEnv: get("NODE_ENV", "development"),

  // =========================
  // SERVER
  // =========================
  server: {
    port,
    corsOrigin: get("CORS_ORIGIN", "*"),
  },

  // Public URLs (used for payment callbacks/redirects)
  websiteUrl: get("WEBSITE_URL", "http://localhost:5173"),
  apiPublicUrl: get("API_PUBLIC_URL", `http://localhost:${port}`),

  // =========================
  // DATABASE
  // =========================
  mongoUri: required("MONGO_URI", "mongodb://localhost:27017/smartwaste"),

  // =========================
  // REDIS (BullMQ)
  // =========================
  redis: {
    host: get("REDIS_HOST", "127.0.0.1"), // default to IPv4 (avoid ::1)
    port: Number(get("REDIS_PORT", 6379)),
  },

  // =========================
  // JWT
  // =========================
  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET", "change_me_access"),
    refreshSecret: required("JWT_REFRESH_SECRET", "change_me_refresh"),
    accessExpiresIn: get("JWT_ACCESS_EXPIRES_IN", "15m"),
    refreshExpiresIn: get("JWT_REFRESH_EXPIRES_IN", "7d"),

    // ✅ Password reset token (OTP flow) - keep separate from access/refresh
    resetSecret: required("JWT_RESET_SECRET", "change_me_reset"),
    resetTtlMin: Number(get("JWT_RESET_TTL_MIN", 10)),
  },

  // =========================
  // OTP (Forgot Password)
  // =========================
  otp: {
    ttlMin: Number(get("OTP_TTL_MIN", 10)),
    resendCooldownSec: Number(get("OTP_RESEND_COOLDOWN_SEC", 60)),
  },

  // =========================
  // SMTP (Email)
  // =========================
  smtp: {
    host: get("SMTP_HOST", ""),
    port: Number(get("SMTP_PORT", 587)),
    user: get("SMTP_USER", ""),
    pass: get("SMTP_PASS", ""),
    from: get("MAIL_FROM", ""),
  },

  // =========================
  // STORAGE (MinIO / S3)
  // =========================
  s3: {
    endpoint: required("S3_ENDPOINT", "http://localhost:9000"),
    region: get("S3_REGION", "us-east-1"),
    bucket: get("S3_BUCKET", "swm-evidence"),
    accessKey: get("S3_ACCESS_KEY", "minioadmin"),
    secretKey: get("S3_SECRET_KEY", "minioadmin"),
    forcePathStyle:
      String(get("S3_FORCE_PATH_STYLE", "true")).toLowerCase() === "true",
  },

  // =========================
  // GOOGLE MAPS
  // =========================
  googleMaps: {
    apiKey: get("GOOGLE_MAPS_API_KEY", ""),
    useDistanceMatrix:
      String(get("GOOGLE_MAPS_USE_DISTANCE_MATRIX", "true")).toLowerCase() ===
      "true",
    useDirectionsOptimization:
      String(get("GOOGLE_MAPS_USE_DIRECTIONS_OPTIMIZATION", "true")).toLowerCase() ===
      "true",
  },

  // =========================
  // DIGITAL TWIN / ROUTING
  // =========================
  dt: {
    over80Threshold: Number(get("VIRTUAL_BIN_OVER80_THRESHOLD", 0.35)),
    over95Threshold: Number(get("VIRTUAL_BIN_OVER95_THRESHOLD", 0.1)),
    riskThreshold: Number(get("VIRTUAL_BIN_RISK_THRESHOLD", 70)),
    scooterBufferPercent: Number(get("SCOOTER_BUFFER_PERCENT", 0.25)),
  },

  // =========================
  // BILLING
  // =========================
  billing: {
    bulkyDailyCharge: Number(get("BULKY_DAILY_CHARGE", 50)),
    invoiceDayOfMonth,
  },

  // =========================
  // BACKGROUND JOBS
  // =========================
  scheduler: {
    enabled: String(get("SCHEDULER_ENABLED", "true")).toLowerCase() === "true",
    userId: get("SCHEDULER_USER_ID", ""),
    dailyRoutesCron: get("DAILY_ROUTES_CRON", "0 6 * * *"),
    monthlyInvoicesCron: get("MONTHLY_INVOICES_CRON", monthlyInvoicesCronDefault),
  },

  // =========================
  // PAYMENTS
  // =========================
  payments: {
    provider: get("PAYMENT_PROVIDER", "MOCK"), // ESEWA | MOCK
    mockBaseUrl: get("MOCK_PAYMENT_BASE_URL", `http://localhost:${port}`),
  },

  // eSewa ePay v2 (Sandbox/UAT)
  esewa: {
    env: get("ESEWA_ENV", "sandbox"),
    productCode: required("ESEWA_PRODUCT_CODE", "EPAYTEST"),
    secretKey: required("ESEWA_SECRET_KEY", ""),
    formUrl: required(
      "ESEWA_FORM_URL",
      "https://rc-epay.esewa.com.np/api/epay/main/v2/form"
    ),
    statusUrl: required(
      "ESEWA_STATUS_URL",
      "https://rc.esewa.com.np/api/epay/transaction/status/"
    ),
  },

  // =========================
  // AI SERVICE
  // =========================
  ai: {
    baseUrl: get("AI_BASE_URL", "http://localhost:8001"),
  },
};

module.exports = env;
