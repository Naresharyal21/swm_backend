const express = require("express");
const Joi = require("joi");
const { authenticate, requireRole } = require("../middlewares/auth");
const { validate } = require("../middlewares/validate");
const { ROLES, VEHICLE_TYPES } = require("../config/constants");
const ctrl = require("../controllers/admin.controller");



const router = express.Router();

router.use(authenticate);
router.use(requireRole(ROLES.ADMIN));

// --------------------
// Users
// --------------------
const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().allow("").optional(),
  phone: Joi.string().allow("").optional(),
  role: Joi.string().valid(...Object.values(ROLES)).required(),
});

router.post("/users", validate(createUserSchema), ctrl.createUser);
router.get("/users", ctrl.listUsers);

const updateUserSchema = Joi.object({
  name: Joi.string().allow("").optional(),
  phone: Joi.string().allow("").optional(),
  role: Joi.string().valid(...Object.values(ROLES)).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

router.put("/users/:id", validate(updateUserSchema), ctrl.updateUser);
router.delete("/users/:id", ctrl.deleteUser);

// --------------------
// Zones
// --------------------
const zoneSchema = Joi.object({
  name: Joi.string().required(),
  wardCode: Joi.string().allow("").optional(),
  polygon: Joi.any().optional(),
  centroid: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).required(),
});

router.post("/zones", validate(zoneSchema), ctrl.createZone);
router.get("/zones", ctrl.listZones);
router.get("/zones/:id", ctrl.getZoneById);                // ✅ added
router.put("/zones/:id", validate(zoneSchema), ctrl.updateZone);
router.delete("/zones/:id", ctrl.deleteZone);

// --------------------
// Households
// --------------------
const householdSchema = Joi.object({
  zoneId: Joi.string().required(),
  citizenUserId: Joi.string().allow(null).optional(),
  address: Joi.string().required(),
  location: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).required(),
  planId: Joi.string().allow(null).optional(),
  pickupScheduleDays: Joi.array()
    .items(Joi.string().valid("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"))
    .optional(),
});

const householdUpdateSchema = Joi.object({
  zoneId: Joi.string().optional(),
  citizenUserId: Joi.string().allow(null).optional(),
  address: Joi.string().optional(),
  location: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).optional(),
  planId: Joi.string().allow(null).optional(),
  pickupScheduleDays: Joi.array()
    .items(Joi.string().valid("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"))
    .optional(),
}).min(1);

router.post("/households", validate(householdSchema), ctrl.createHousehold);
router.get("/households", ctrl.listHouseholds);
router.get("/households/:id", ctrl.getHouseholdById);              // ✅ added
router.put("/households/:id", validate(householdUpdateSchema), ctrl.updateHousehold); // ✅ added
router.delete("/households/:id", ctrl.deleteHousehold);            // ✅ added

// --------------------
// Bins
// --------------------
const binSchema = Joi.object({
  binId: Joi.string().required(),
  householdId: Joi.string().required(),
  virtualBinId: Joi.string().allow(null).optional(),
  location: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).optional(),
  status: Joi.string().allow("").optional(),
});

const binUpdateSchema = Joi.object({
  binId: Joi.string().optional(), // ✅ add this
  householdId: Joi.string().optional(),
  virtualBinId: Joi.string().allow(null).optional(),
  location: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).optional(),
  status: Joi.string().allow("").optional(),
}).min(1);


router.post("/bins", validate(binSchema), ctrl.createBin);
router.get(
  "/bins",
  validate(
    Joi.object({
      limit: Joi.number().integer().min(1).max(2000).optional(),
      skip: Joi.number().integer().min(0).optional(),

      // ✅ filter options
      onlyActive: Joi.boolean().truthy("true").falsy("false").optional(),
      status: Joi.string().trim().allow("").optional(),
    })
  ),
  ctrl.listBins
);
                         
router.put("/bins/:id", validate(binUpdateSchema), ctrl.updateBin); // ✅ added
router.delete("/bins/:id", ctrl.deleteBin);                        // ✅ added

// --------------------
// Virtual Bins
// --------------------
const virtualBinSchema = Joi.object({
  name: Joi.string().required(),
  zoneId: Joi.string().required(),
  centroid: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).required(),
  polygon: Joi.any().optional(),
  thresholds: Joi.object({
    over80: Joi.number().allow(null).optional(),
    over95: Joi.number().allow(null).optional(),
    risk: Joi.number().allow(null).optional(),
  }).optional(),
  isActive: Joi.boolean().optional(),
});

const virtualBinUpdateSchema = Joi.object({
  name: Joi.string().optional(),
  zoneId: Joi.string().optional(),
  centroid: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).optional(),
  polygon: Joi.any().optional(),
  thresholds: Joi.object({
    over80: Joi.number().allow(null).optional(),
    over95: Joi.number().allow(null).optional(),
    risk: Joi.number().allow(null).optional(),
  }).optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

router.post("/virtual-bins", validate(virtualBinSchema), ctrl.createVirtualBin);
router.get("/virtual-bins", ctrl.listVirtualBins);
router.get("/virtual-bins/:id", ctrl.getVirtualBinById);                 // ✅ added
router.put("/virtual-bins/:id", validate(virtualBinUpdateSchema), ctrl.updateVirtualBin); // ✅ added
router.delete("/virtual-bins/:id", ctrl.deleteVirtualBin);               // ✅ added

const vbMembersSchema = Joi.object({
  binIds: Joi.array().items(Joi.string()).required(),
});
router.put("/virtual-bins/:id/members", validate(vbMembersSchema), ctrl.setVirtualBinMembers);

// --------------------
// Vehicles
// --------------------
const vehicleSchema = Joi.object({
  code: Joi.string().required(),
  vehicleType: Joi.string().valid(...Object.values(VEHICLE_TYPES)).required(),
  capacityKg: Joi.number().allow(null).optional(),
  isActive: Joi.boolean().optional(),
  shiftStart: Joi.string().optional(),
  shiftEnd: Joi.string().optional(),
  crewUserIds: Joi.array().items(Joi.string()).optional(),
});

const vehicleUpdateSchema = Joi.object({
  code: Joi.string().optional(),
  vehicleType: Joi.string().valid(...Object.values(VEHICLE_TYPES)).optional(),
  capacityKg: Joi.number().allow(null).optional(),
  isActive: Joi.boolean().optional(),
  shiftStart: Joi.string().optional(),
  shiftEnd: Joi.string().optional(),
  crewUserIds: Joi.array().items(Joi.string()).optional(),
}).min(1);

router.post("/vehicles", validate(vehicleSchema), ctrl.createVehicle);
router.get("/vehicles", ctrl.listVehicles);
router.get("/vehicles/:id", ctrl.getVehicleById);                       // ✅ added
router.put("/vehicles/:id", validate(vehicleUpdateSchema), ctrl.updateVehicle); // ✅ added
router.delete("/vehicles/:id", ctrl.deleteVehicle);                     // ✅ added

// --------------------
// Billing Plans
// --------------------
const planSchema = Joi.object({
  name: Joi.string().trim().required(),

  billingMode: Joi.string()
    .valid("MONTHLY", "ANNUAL", "DAILY_PICKUP")
    .default("MONTHLY"),

  // MONTHLY
  monthlyFee: Joi.number().min(0).default(0),

  // ✅ ANNUAL
  annualFee: Joi.number().min(0).default(0),

  // DAILY_PICKUP
  dailyPickupFee: Joi.number().min(0).default(0),

  bulkyDailyChargeOverride: Joi.number().allow(null).optional(),
  isActive: Joi.boolean().optional(),
}).custom((value, helpers) => {
  const mode = value.billingMode;

  if (mode === "DAILY_PICKUP" && Number(value.dailyPickupFee || 0) <= 0) {
    return helpers.error("any.invalid");
  }

  if (mode === "ANNUAL" && Number(value.annualFee || 0) <= 0) {
    return helpers.error("any.invalid");
  }

  return value;
}, "billingMode validation");

router.post("/billing-plans", validate(planSchema), ctrl.createBillingPlan);
router.get("/billing-plans", ctrl.listBillingPlans);

const planUpdateSchema = Joi.object({
  name: Joi.string().trim().optional(),

  billingMode: Joi.string()
    .valid("MONTHLY", "ANNUAL", "DAILY_PICKUP")
    .optional(),

  monthlyFee: Joi.number().min(0).optional(),

  // ✅ ANNUAL
  annualFee: Joi.number().min(0).optional(),

  dailyPickupFee: Joi.number().min(0).optional(),

  bulkyDailyChargeOverride: Joi.number().allow(null).optional(),
  isActive: Joi.boolean().optional(),
})
  .custom((value, helpers) => {
    // NOTE: If billingMode is not provided on update,
    // we cannot safely enforce mode-specific fees here without reading DB.
    // So we only validate strictly when billingMode is explicitly provided.

    if (value.billingMode === "DAILY_PICKUP") {
      const fee = Number(value.dailyPickupFee ?? 0);
      if (fee <= 0) return helpers.error("any.invalid");
    }

    if (value.billingMode === "ANNUAL") {
      const fee = Number(value.annualFee ?? 0);
      if (fee <= 0) return helpers.error("any.invalid");
    }

    return value;
  }, "billingMode validation")
  .min(1);

router.put("/billing-plans/:id", validate(planUpdateSchema), ctrl.updateBillingPlan);
router.delete("/billing-plans/:id", ctrl.deleteBillingPlan);

// --------------------
// Membership plans
// --------------------
const membershipPlanSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow("").optional(),
  monthlyFee: Joi.number().min(0).default(0),
  discountPercent: Joi.number().min(0).max(100).default(0),
  recyclableBonusPercent: Joi.number().min(0).max(100).default(0),
  isActive: Joi.boolean().optional(),
});

router.post("/membership-plans", validate(membershipPlanSchema), ctrl.createMembershipPlan);
router.get("/membership-plans", ctrl.listMembershipPlans);
router.put("/membership-plans/:id", validate(membershipPlanSchema), ctrl.updateMembershipPlan);
router.delete("/membership-plans/:id", ctrl.deactivateMembershipPlan);
//admin view payment

// --------------------
// Reward Rates
// --------------------
const rewardRateSchema = Joi.object({
  category: Joi.string().required(),
  ratePerUnit: Joi.number().required(),
  isActive: Joi.boolean().optional(),
});

const rewardRateUpdateSchema = Joi.object({
  category: Joi.string().optional(),
  ratePerUnit: Joi.number().optional(),
  isActive: Joi.boolean().optional(),
}).min(1);

router.post("/reward-rates", validate(rewardRateSchema), ctrl.createRewardRate);
router.get("/reward-rates", ctrl.listRewardRates);
router.get("/reward-rates/:id", ctrl.getRewardRateById);                    // ✅ added
router.put("/reward-rates/:id", validate(rewardRateUpdateSchema), ctrl.updateRewardRate); // ✅ added
router.delete("/reward-rates/:id", ctrl.deleteRewardRate);                  // ✅ added

//admin view payment
// --------------------
// Payment Transactions (Admin)
// --------------------
router.get(
  "/payment-transactions",
  validate(
    Joi.object({
      status: Joi.string().optional(),
      kind: Joi.string().optional(),
      limit: Joi.number().integer().min(1).max(1000).optional(),
      skip: Joi.number().integer().min(0).optional(),
      from: Joi.string().optional(),  // ISO date string
      to: Joi.string().optional(),    // ISO date string
      search: Joi.string().allow("").optional(), // email/txUuid/refId
    })
  ),
  ctrl.listPaymentTransactions
);


module.exports = router;
