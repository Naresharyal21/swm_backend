/* eslint-disable no-console */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { connectMongo } = require('../src/db/mongoose');
const env = require('../src/config/env');
const { ROLES, VEHICLE_TYPES } = require('../src/config/constants');

const User = require('../src/models/User');
const Zone = require('../src/models/Zone');
const Household = require('../src/models/Household');
const BillingPlan = require('../src/models/BillingPlan');
const Bin = require('../src/models/Bin');
const VirtualBin = require('../src/models/VirtualBin');
const VirtualBinMember = require('../src/models/VirtualBinMember');
const BinTwinLatest = require('../src/models/BinTwinLatest');
const Vehicle = require('../src/models/Vehicle');
const RewardRate = require('../src/models/RewardRate');

/**
 * SEED SETTINGS
 * You can override via environment variables:
 *  SEED_CITY, SEED_WARDS, SEED_HOUSEHOLDS, SEED_VB_PER_WARD
 */
const CITY_NAME = process.env.SEED_CITY || 'Kathmandu Metro Core';
const WARDS_COUNT = Number(process.env.SEED_WARDS || 1);
const HOUSEHOLDS_TOTAL = Number(process.env.SEED_HOUSEHOLDS || 10);
const VIRTUAL_BINS_PER_WARD = Number(process.env.SEED_VB_PER_WARD || 5);

// Kathmandu "core" bounding box (approx demo region)
const KTM_BOUNDS = {
  minLat: 27.67,
  maxLat: 27.75,
  minLng: 85.26,
  maxLng: 85.36
};

// 20 wards -> 4x5 grid
const GRID_ROWS = 4;
const GRID_COLS = 5;

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function jitterPoint(lat, lng, maxMeters = 500) {
  // 1 deg lat ≈ 111km
  const maxDeg = maxMeters / 111000;
  const dLat = (Math.random() - 0.5) * 2 * maxDeg;
  const dLng = (Math.random() - 0.5) * 2 * maxDeg;
  return { lat: lat + dLat, lng: lng + dLng };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function distributeHouseholds(total, wardCount) {
  const base = Math.floor(total / wardCount);
  const remainder = total % wardCount;
  const perWard = Array(wardCount).fill(base);
  for (let i = 0; i < remainder; i++) perWard[i]++;

  // small shuffle so ward sizes aren’t perfectly equal
  for (let i = perWard.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [perWard[i], perWard[j]] = [perWard[j], perWard[i]];
  }
  return perWard;
}

function generateWardGrid(bounds, rows, cols) {
  const wards = [];
  const latStep = (bounds.maxLat - bounds.minLat) / rows;
  const lngStep = (bounds.maxLng - bounds.minLng) / cols;

  let wardNo = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const minLat = bounds.minLat + r * latStep;
      const maxLat = minLat + latStep;
      const minLng = bounds.minLng + c * lngStep;
      const maxLng = minLng + lngStep;

      const centroidLat = (minLat + maxLat) / 2;
      const centroidLng = (minLng + maxLng) / 2;

      wards.push({
        wardNo,
        wardCode: `KTM-${pad2(wardNo)}`,
        name: `${CITY_NAME} - Ward ${pad2(wardNo)}`,
        cellBounds: { minLat, maxLat, minLng, maxLng },
        centroid: { lat: centroidLat, lng: centroidLng }
      });

      wardNo++;
    }
  }
  return wards;
}

async function upsertUser({ email, password, name, role }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $set: { email: email.toLowerCase(), passwordHash, name, role, isActive: true } },
    { upsert: true, new: true }
  );
  return user;
}

async function resetDb() {
  const collections = await User.db.db.listCollections().toArray();

  for (const c of collections) {
    const name = c.name;

    // ✅ Skip MongoDB internal namespaces (system.views lives here)
    if (name.startsWith('system.')) {
      console.log(`Skipping system collection: ${name}`);
      continue;
    }

    // ✅ Skip MongoDB views (non-writable)
    if (c.type === 'view') {
      console.log(`Skipping view: ${name}`);
      continue;
    }

    await User.db.db.collection(name).deleteMany({});
  }
}


function batteryStateFromPct(pct) {
  if (pct >= 60) return 'OK';
  if (pct >= 30) return 'LOW';
  return 'CRITICAL';
}

function generateFillPercent() {
  // Make demo interesting: some high fill to trigger BIN_SERVICE after aggregation
  if (Math.random() < 0.18) return Math.floor(randBetween(85, 100)); // 18% high risk
  return Math.floor(randBetween(10, 80));
}

async function main() {
  await connectMongo();
  await resetDb();

  console.log('Seeding large dataset...');
  console.log(` City: ${CITY_NAME}`);
  console.log(` Wards: ${WARDS_COUNT} (grid ${GRID_ROWS}x${GRID_COLS})`);
  console.log(` Households total: ${HOUSEHOLDS_TOTAL}`);
  console.log(` VirtualBins/ward: ${VIRTUAL_BINS_PER_WARD}`);

  // Core demo users
  const admin = await upsertUser({
    email: 'admin@gmail.com', password: 'Admin1234', name: 'Admin', role: ROLES.ADMIN
  });
  const supervisor = await upsertUser({
    email: 'supervisor@gmail.com', password: 'Supervisor1234', name: 'Supervisor', role: ROLES.SUPERVISOR
  });
  const crew = await upsertUser({
    email: 'crew@gmail.com', password: 'Crew1234', name: 'Crew Member', role: ROLES.CREW
  });

  // Keep one citizen login for easy testing
  await upsertUser({
    email: 'citizen@gmail.com', password: 'Citizen1234', name: 'Citizen', role: ROLES.CITIZEN
  });

  // Billing plan
  const plan = await BillingPlan.create({
    name: 'Standard',
    monthlyFee: 200,
    bulkyDailyChargeOverride: env.billing.bulkyDailyCharge
  });

  // Generate ward grid and take the first WARDS_COUNT
  const wardGrid = generateWardGrid(KTM_BOUNDS, GRID_ROWS, GRID_COLS).slice(0, WARDS_COUNT);

  // Create zones
  const zoneDocs = await Zone.insertMany(
    wardGrid.map(w => ({
      name: w.name,
      wardCode: w.wardCode,
      centroid: { type: 'Point', coordinates: [w.centroid.lng, w.centroid.lat] }
    })),
    { ordered: false }
  );

  // Map wardNo -> created zone doc + bounds
  const zonesByWardCode = new Map();
  for (let i = 0; i < zoneDocs.length; i++) {
    const zone = zoneDocs[i];
    // find original grid entry by wardCode
    const gridEntry = wardGrid.find(w => w.wardCode === zone.wardCode);
    zonesByWardCode.set(zone.wardCode, { zone, gridEntry });
  }

  // Create virtual bins (5 per ward)
  const virtualBinsToInsert = [];
  for (const w of wardGrid) {
    const { zone } = zonesByWardCode.get(w.wardCode);
    for (let i = 1; i <= VIRTUAL_BINS_PER_WARD; i++) {
      const pt = jitterPoint(w.centroid.lat, w.centroid.lng, 350);
      virtualBinsToInsert.push({
        name: `${w.wardCode}-VB-${i}`,
        zoneId: zone._id,
        centroid: { type: 'Point', coordinates: [pt.lng, pt.lat] },
        thresholds: { over80: 0.35, over95: 0.10, risk: 70 },
        isActive: true
      });
    }
  }

  const virtualBinDocs = await VirtualBin.insertMany(virtualBinsToInsert, { ordered: false });

  // Group virtual bins by zoneId
  const vbsByZoneId = new Map();
  for (const vb of virtualBinDocs) {
    const key = String(vb.zoneId);
    if (!vbsByZoneId.has(key)) vbsByZoneId.set(key, []);
    vbsByZoneId.get(key).push(vb);
  }

  // Create 2000 citizen users FAST (hash once)
  const citizenPasswordHash = await bcrypt.hash('Citizen1234', 10);
  const citizenUsers = [];
  for (let i = 1; i <= HOUSEHOLDS_TOTAL; i++) {
    citizenUsers.push({
      email: `citizen+${String(i).padStart(4, '0')}@gmail.com`,
      passwordHash: citizenPasswordHash,
      name: `Citizen ${String(i).padStart(4, '0')}`,
      role: ROLES.CITIZEN,
      isActive: true
    });
  }
  const citizenDocs = await User.insertMany(citizenUsers, { ordered: false });

  // Household distribution per ward
  const perWard = distributeHouseholds(HOUSEHOLDS_TOTAL, WARDS_COUNT);

  // Bulk create households + bins + members + twin latest
  const households = [];
  const bins = [];
  const vbMembers = [];
  const twinLatest = [];

  let globalHouseIndex = 0;

  for (let wardIndex = 0; wardIndex < wardGrid.length; wardIndex++) {
    const w = wardGrid[wardIndex];
    const { zone, gridEntry } = zonesByWardCode.get(w.wardCode);
    const countHere = perWard[wardIndex];
    const vbs = vbsByZoneId.get(String(zone._id)) || [];

    if (!vbs.length) {
      throw new Error(`No virtual bins found for zone ${zone.wardCode}`);
    }

    for (let j = 0; j < countHere; j++) {
      globalHouseIndex++;

      const householdId = new mongoose.Types.ObjectId();
      const binObjectId = new mongoose.Types.ObjectId();

      // pick a citizen user for this household
      const citizenUser = citizenDocs[globalHouseIndex - 1];

      // sample location inside ward cell bounds (more realistic than centroid jitter)
      const lat = randBetween(gridEntry.cellBounds.minLat, gridEntry.cellBounds.maxLat);
      const lng = randBetween(gridEntry.cellBounds.minLng, gridEntry.cellBounds.maxLng);

      // assign to a virtual bin in this ward (round robin)
      const vb = vbs[(j % VIRTUAL_BINS_PER_WARD)];

      const address = `${CITY_NAME}, ${w.wardCode}, House ${String(j + 1).padStart(3, '0')}`;

      households.push({
        _id: householdId,
        zoneId: zone._id,
        citizenUserId: citizenUser._id,
        address,
        location: { type: 'Point', coordinates: [lng, lat] },
        planId: plan._id
      });

      const binIdStr = `KTM-BIN-${w.wardCode}-${String(j + 1).padStart(3, '0')}`;

      bins.push({
        _id: binObjectId,
        binId: binIdStr,
        householdId,
        virtualBinId: vb._id,
        location: { type: 'Point', coordinates: [lng, lat] },
        status: 'ACTIVE'
      });

      vbMembers.push({
        virtualBinId: vb._id,
        binId: binObjectId
      });

      // Twin latest seed (some offline + some high fill)
      const fill = generateFillPercent();
      const offline = Math.random() < 0.02; // 2% offline
      const battery = Math.floor(randBetween(40, 100));
      twinLatest.push({
        binId: binObjectId,
        lastSeenAt: offline ? new Date(Date.now() - 6 * 60 * 60 * 1000) : new Date(),
        fillPercent: fill,
        batteryPercent: battery,
        isOffline: offline,
        batteryState: batteryStateFromPct(battery)
      });
    }
  }

  await Household.insertMany(households, { ordered: false });
  await Bin.insertMany(bins, { ordered: false });
  await VirtualBinMember.insertMany(vbMembers, { ordered: false });
  await BinTwinLatest.insertMany(twinLatest, { ordered: false });

  // Vehicles (more realistic fleet)
  const vehicles = [];
  for (let t = 1; t <= 4; t++) {
    vehicles.push({
      code: `TRUCK-${pad2(t)}`,
      vehicleType: VEHICLE_TYPES.TRUCK,
      capacityKg: 2000,
      crewUserIds: [crew._id],
      isActive: true
    });
  }
  for (let s = 1; s <= 6; s++) {
    vehicles.push({
      code: `SCOOTER-${pad2(s)}`,
      vehicleType: VEHICLE_TYPES.SCOOTER,
      capacityKg: 150,
      crewUserIds: [crew._id],
      isActive: true
    });
  }
  await Vehicle.insertMany(vehicles, { ordered: false });

  // Reward rate
  await RewardRate.create({
    category: 'LITTER_REPORT_VALID',
    ratePerUnit: 10,
    isActive: true
  });

  console.log('✅ Seed complete.');
  console.log(` Zones created: ${zoneDocs.length}`);
  console.log(` Virtual bins created: ${virtualBinDocs.length}`);
  console.log(` Citizens created (bulk): ${citizenDocs.length}`);
  console.log(` Households created: ${households.length}`);
  console.log(` Bins created: ${bins.length}`);
  console.log(` BinTwinLatest created: ${twinLatest.length}`);
  console.log(` Vehicles created: ${vehicles.length}`);

  console.log('\nDemo users:');
  console.log(' admin@gmail.com / Admin1234');
  console.log(' supervisor@gmail.com / Supervisor1234');
  console.log(' crew@gmail.com / Crew1234');
  console.log(' citizen@gmail.com / Citizen1234');
  console.log('\nExtra citizens: citizen+0001@gmail.com ... citizen+2000@gmail.com (password: Citizen1234)');

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
