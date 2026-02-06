const asyncHandler = require('../utils/asyncHandler');
const Bin = require('../models/Bin');
const Telemetry = require('../models/Telemetry');
const BinTwinLatest = require('../models/BinTwinLatest');
const { badRequest, notFound, unauthorized } = require('../utils/errors');
const env = require('../config/env');

const ingestTelemetry = asyncHandler(async (req, res) => {
  // Optional shared key for devices
  const shared = process.env.IOT_INGEST_KEY;
  if (shared) {
    const key = req.headers['x-iot-key'] || '';
    if (key !== shared) throw unauthorized('Invalid IoT key');
  }

  const bin = await Bin.findOne({ binId: req.body.binId }).lean();
  if (!bin) throw notFound('Bin not found');

  const ts = req.body.ts ? new Date(req.body.ts) : new Date();
  if (Number.isNaN(ts.getTime())) throw badRequest('Invalid ts');

  await Telemetry.updateOne(
    { binId: bin._id, ts },
    { $setOnInsert: { binId: bin._id, ts, fillPercent: req.body.fillPercent, batteryPercent: req.body.batteryPercent } },
    { upsert: true }
  );

  await BinTwinLatest.updateOne(
    { binId: bin._id },
    {
      $set: {
        binId: bin._id,
        lastSeenAt: ts,
        fillPercent: req.body.fillPercent,
        batteryPercent: req.body.batteryPercent,
        isOffline: false,
        batteryState: req.body.batteryPercent !== undefined && req.body.batteryPercent !== null && req.body.batteryPercent < 20 ? 'LOW' : 'OK'
      }
    },
    { upsert: true }
  );

  res.json({ status: 'ok' });
});

module.exports = { ingestTelemetry };
