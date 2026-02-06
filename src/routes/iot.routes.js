const express = require('express');
const Joi = require('joi');
const { validate } = require('../middlewares/validate');
const { ingestTelemetry } = require('../controllers/iot.controller');

const router = express.Router();

const telemetrySchema = Joi.object({
  binId: Joi.string().required(),
  ts: Joi.date().optional(),
  fillPercent: Joi.number().min(0).max(100).required(),
  batteryPercent: Joi.number().min(0).max(100).allow(null).optional()
});

router.post('/telemetry', validate(telemetrySchema), ingestTelemetry);

module.exports = router;
