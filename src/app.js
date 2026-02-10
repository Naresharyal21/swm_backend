// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");

const env = require("./config/env");
const apiRoutes = require("./routes");
const { errorHandler } = require("./middlewares/errorHandler");

// ✅ Add BinId routes (admin)
const binIdRoutes = require("./routes/binid.routes");

function createApp() {
  const app = express(); // ✅ app is defined here, safe to use below

  app.use(helmet());
  app.use(
    cors({
      origin: env.server.corsOrigin === "*" ? true : env.server.corsOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("dev"));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  // Swagger
  const specPath = path.join(__dirname, "docs", "openapi.yaml");
  const swaggerDocument = YAML.load(specPath);
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  // ✅ Your existing /api router
  app.use("/api", apiRoutes);

  /**
   * ✅ Bin ID Generator routes
   * You can keep it under /api/admin/binids (recommended)
   * Final endpoints:
   *  GET    /api/admin/binids
   *  POST   /api/admin/binids
   *  POST   /api/admin/binids/generate-range
   *  DELETE /api/admin/binids/delete-range
   *  DELETE /api/admin/binids/:id
   */
  app.use("/api/admin/binids", binIdRoutes);

  // 404
  app.use((req, res) => res.status(404).json({ message: "Not found" }));

  // Error
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
