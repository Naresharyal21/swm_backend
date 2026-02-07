const express = require("express");
const Joi = require("joi");
const { authenticate, requireRole } = require("../middlewares/auth");
const { validate } = require("../middlewares/validate");
const { ROLES, VEHICLE_TYPES } = require("../config/constants");
const ctrl = require("../controllers/admin.controller");
console.log("✅ loaded admin.routes.js from:", __filename);
const router = express.Router();

router.use(authenticate);
router.use(requireRole(ROLES.ADMIN));

// Users
const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().allow("").optional(),
  phone: Joi.string().allow("").optional(),
  role: Joi.string()
    .valid(...Object.values(ROLES))
    .required(),
});

router.post("/users", validate(createUserSchema), ctrl.createUser);
router.get("/users", ctrl.listUsers);


//update
const updateUserSchema = Joi.object({
  name: Joi.string().allow('').optional(),
  phone: Joi.string().allow('').optional(),
  role: Joi.string().valid(...Object.values(ROLES)).optional(),
  isActive: Joi.boolean().optional(),
});
router.put('/users/:id', validate(updateUserSchema), ctrl.updateUser);
router.delete('/users/:id', ctrl.deleteUser);


// Zones
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
router.put("/zones/:id", validate(zoneSchema), ctrl.updateZone);
router.delete("/zones/:id", ctrl.deleteZone);

// Households
const householdSchema = Joi.object({
  zoneId: Joi.string().required(),
  citizenUserId: Joi.string().allow(null).optional(),
  address: Joi.string().required(),
  location: Joi.object({
    type: Joi.string().valid("Point").default("Point"),
    coordinates: Joi.array().items(Joi.number()).length(2).required(),
  }).required(),
  planId: Joi.string().allow(null).optional(),
});

router.post("/households", validate(householdSchema), ctrl.createHousehold);
router.get("/households", ctrl.listHouseholds);

// Bins
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

router.post("/bins", validate(binSchema), ctrl.createBin);
router.get("/bins", ctrl.listBins);

// Virtual Bins
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

router.post("/virtual-bins", validate(virtualBinSchema), ctrl.createVirtualBin);
router.get("/virtual-bins", ctrl.listVirtualBins);

const vbMembersSchema = Joi.object({
  binIds: Joi.array().items(Joi.string()).required(),
});
router.put(
  "/virtual-bins/:id/members",
  validate(vbMembersSchema),
  ctrl.setVirtualBinMembers,
);

// Vehicles
const vehicleSchema = Joi.object({
  code: Joi.string().required(),
  vehicleType: Joi.string()
    .valid(...Object.values(VEHICLE_TYPES))
    .required(),
  capacityKg: Joi.number().allow(null).optional(),
  isActive: Joi.boolean().optional(),
  shiftStart: Joi.string().optional(),
  shiftEnd: Joi.string().optional(),
  crewUserIds: Joi.array().items(Joi.string()).optional(),
});

router.post("/vehicles", validate(vehicleSchema), ctrl.createVehicle);
router.get("/vehicles", ctrl.listVehicles);

// Billing Plans (monthly + daily pickup)
// Billing Plans (monthly + daily pickup)
const planSchema = Joi.object({
  name: Joi.string().required(),
  billingMode: Joi.string().valid("MONTHLY", "DAILY_PICKUP").default("MONTHLY"),
  monthlyFee: Joi.number().min(0).default(0),
  dailyPickupFee: Joi.number().min(0).default(0),
  bulkyDailyChargeOverride: Joi.number().allow(null).optional(),
  isActive: Joi.boolean().optional(),
}).custom((value, helpers) => {
  if (value.billingMode === "DAILY_PICKUP" && Number(value.dailyPickupFee || 0) <= 0) {
    return helpers.error("any.invalid");
  }
  return value;
}, "billingMode validation");

// ✅ create
router.post("/billing-plans", validate(planSchema), ctrl.createBillingPlan);

// ✅ list
router.get("/billing-plans", ctrl.listBillingPlans);

// ✅ update (PATCH-like via PUT): make fields optional
const planUpdateSchema = Joi.object({
  name: Joi.string().optional(),
  billingMode: Joi.string().valid("MONTHLY", "DAILY_PICKUP").optional(),
  monthlyFee: Joi.number().min(0).optional(),
  dailyPickupFee: Joi.number().min(0).optional(),
  bulkyDailyChargeOverride: Joi.number().allow(null).optional(),
  isActive: Joi.boolean().optional(),
}).custom((value, helpers) => {
  // Only validate DAILY_PICKUP rule if billingMode is DAILY_PICKUP
  // or if user is switching to DAILY_PICKUP.
  if (value.billingMode === "DAILY_PICKUP") {
    const fee = Number(value.dailyPickupFee ?? 0);
    if (fee <= 0) return helpers.error("any.invalid");
  }
  return value;
}, "billingMode validation");

router.put("/billing-plans/:id", validate(planUpdateSchema), ctrl.updateBillingPlan);

// ✅ delete
router.delete("/billing-plans/:id", ctrl.deleteBillingPlan);

// Membership plans
const membershipPlanSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow("").optional(),
  monthlyFee: Joi.number().min(0).default(0),
  discountPercent: Joi.number().min(0).max(100).default(0),
  recyclableBonusPercent: Joi.number().min(0).max(100).default(0),
  isActive: Joi.boolean().optional(),
});

router.post(
  "/membership-plans",
  validate(membershipPlanSchema),
  ctrl.createMembershipPlan,
);
router.get("/membership-plans", ctrl.listMembershipPlans);
router.put(
  "/membership-plans/:id",
  validate(membershipPlanSchema),
  ctrl.updateMembershipPlan,
);
router.delete("/membership-plans/:id", ctrl.deactivateMembershipPlan);

// Reward Rates
const rewardRateSchema = Joi.object({
  category: Joi.string().required(),
  ratePerUnit: Joi.number().required(),
  isActive: Joi.boolean().optional(),
});

router.post("/reward-rates", validate(rewardRateSchema), ctrl.createRewardRate);
router.get("/reward-rates", ctrl.listRewardRates);

module.exports = router;
