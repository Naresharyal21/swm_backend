// smartwaste_mongo_init.js
// Smart Waste Management System (MongoDB) – Collections + Validators + Indexes + Views
//
// Run (PowerShell):
//   mongosh "mongodb://127.0.0.1:27017" smartwaste_mongo_init.js
//
// NOTE:
// - This is designed to match your current Mongoose models (models.zip).
// - MongoDB does not support SQL-style stored procedures. "Procedures" are implemented as
//   aggregation pipelines + views + background jobs (BullMQ/cron).

const DB_NAME = "smartwaste"; // <-- set to match your MONGO_URI db name
const dbRef = db.getSiblingDB(DB_NAME);

print(`\n=== Init DB: ${DB_NAME} ===\n`);

function ensureCollection(name, validator) {
  if (!dbRef.getCollectionNames().includes(name)) {
    dbRef.createCollection(name, validator ? { validator } : undefined);
    print(`Created collection: ${name}`);
  } else if (validator) {
    // Update validator on existing collection (idempotent)
    try {
      dbRef.runCommand({ collMod: name, validator });
      print(`Updated validator: ${name}`);
    } catch (e) {
      print(`(warn) Could not update validator for ${name}: ${e}`);
    }
  } else {
    print(`Collection exists: ${name}`);
  }
}

function ensureIndex(col, keys, opts = {}) {
  dbRef[col].createIndex(keys, opts);
  const u = opts.unique ? " unique" : "";
  const p = opts.partialFilterExpression ? " partial" : "";
  const ttl =
    opts.expireAfterSeconds != null ? ` ttl=${opts.expireAfterSeconds}` : "";
  print(`Index ${col}: ${JSON.stringify(keys)}${u}${p}${ttl}`);
}

function ensureView(viewName, sourceCol, pipeline) {
  try {
    dbRef.createView(viewName, sourceCol, pipeline);
    print(`Created view: ${viewName}`);
  } catch (e) {
    if (String(e).includes("already exists")) {
      print(`View exists: ${viewName}`);
    } else {
      print(`(warn) Could not create view ${viewName}: ${e}`);
    }
  }
}

/* ------------------------------
 * 1) AUTH / USERS
 * Collections (Mongoose pluralization):
 *  User -> users
 *  RefreshToken -> refreshtokens
 * ------------------------------ */

ensureCollection("users", {
  $jsonSchema: {
    bsonType: "object",
    required: ["email", "passwordHash", "role"],
    properties: {
      email: { bsonType: "string" },
      passwordHash: { bsonType: "string" },
      name: { bsonType: "string" },
      phone: { bsonType: "string" },
      role: {
        bsonType: "string",
        enum: ["ADMIN", "SUPERVISOR", "CREW", "CITIZEN"],
      },
      isActive: { bsonType: "bool" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("refreshtokens", {
  $jsonSchema: {
    bsonType: "object",
    required: ["userId", "tokenHash", "expiresAt"],
    properties: {
      userId: { bsonType: "objectId" },
      tokenHash: { bsonType: "string" },
      expiresAt: { bsonType: "date" },
      revokedAt: { bsonType: ["date", "null"] },
      replacedByTokenHash: { bsonType: ["string", "null"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

// Indexes
ensureIndex("users", { email: 1 }, { unique: true });
ensureIndex("users", { role: 1, isActive: 1 });

ensureIndex("refreshtokens", { userId: 1, createdAt: -1 });
ensureIndex("refreshtokens", { tokenHash: 1 }, { unique: true });
//ensureIndex("refreshtokens", { expiresAt: 1 });
// Recommended: TTL cleanup of expired refresh tokens (safe + keeps DB small)
ensureIndex(
  "refreshtokens",
  { expiresAt: 1 },
  { name: "expiresAt_1", expireAfterSeconds: 0 }
);

/* ------------------------------
 * 2) GEO STRUCTURE
 * Zone -> zones
 * ------------------------------ */

ensureCollection("zones", {
  $jsonSchema: {
    bsonType: "object",
    required: ["name"],
    properties: {
      name: { bsonType: "string" },
      wardCode: { bsonType: "string" },
      polygon: { bsonType: ["object", "null"] },
      centroid: {
        bsonType: "object",
        properties: {
          type: { bsonType: "string", enum: ["Point"] },
          coordinates: { bsonType: "array" },
        },
      },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});


ensureIndex("zones", { wardCode: 1 }, { unique: true });
ensureIndex("zones", { centroid: "2dsphere" });


/* ------------------------------
 * 3) BILLING MASTER
 * BillingPlan -> billingplans
 * ------------------------------ */

ensureCollection("billingplans", {
  $jsonSchema: {
    bsonType: "object",
    required: ["name", "monthlyFee"],
    properties: {
      name: { bsonType: "string" },
      monthlyFee: { bsonType: ["double", "int", "long", "decimal"] },
      bulkyDailyChargeOverride: {
        bsonType: ["double", "int", "long", "decimal", "null"],
      },
      isActive: { bsonType: "bool" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureIndex("billingplans", { name: 1 }, { unique: true });
ensureIndex("billingplans", { isActive: 1 });

/* ------------------------------
 * 4) HOUSEHOLDS / BINS / VIRTUAL BINS
 * Household -> households
 * Bin -> bins
 * VirtualBin -> virtualbins
 * VirtualBinMember -> virtualbinmembers
 * ------------------------------ */

ensureCollection("households", {
  $jsonSchema: {
    bsonType: "object",
    required: ["zoneId", "address", "location"],
    properties: {
      zoneId: { bsonType: "objectId" },
      citizenUserId: { bsonType: ["objectId", "null"] },
      address: { bsonType: "string" },
      location: {
        bsonType: "object",
        properties: {
          type: { bsonType: "string", enum: ["Point"] },
          coordinates: { bsonType: "array" },
        },
      },
      planId: { bsonType: ["objectId", "null"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("virtualbins", {
  $jsonSchema: {
    bsonType: "object",
    required: ["name", "zoneId"],
    properties: {
      name: { bsonType: "string" },
      zoneId: { bsonType: "objectId" },
      centroid: {
        bsonType: "object",
        properties: {
          type: { bsonType: "string", enum: ["Point"] },
          coordinates: { bsonType: "array" },
        },
      },
      polygon: { bsonType: ["object", "null"] },
      thresholds: {
        bsonType: "object",
        properties: {
          over80: { bsonType: ["double", "int", "long", "decimal", "null"] },
          over95: { bsonType: ["double", "int", "long", "decimal", "null"] },
          risk: { bsonType: ["double", "int", "long", "decimal", "null"] },
        },
      },
      isActive: { bsonType: "bool" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("bins", {
  $jsonSchema: {
    bsonType: "object",
    required: ["binId", "householdId", "location"],
    properties: {
      binId: { bsonType: "string" },
      householdId: { bsonType: "objectId" },
      virtualBinId: { bsonType: ["objectId", "null"] },
      location: {
        bsonType: "object",
        properties: {
          type: { bsonType: "string", enum: ["Point"] },
          coordinates: { bsonType: "array" },
        },
      },
      status: { bsonType: "string" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("virtualbinmembers", {
  $jsonSchema: {
    bsonType: "object",
    required: ["virtualBinId", "binId"],
    properties: {
      virtualBinId: { bsonType: "objectId" },
      binId: { bsonType: "objectId" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

// Indexes
ensureIndex("households", { zoneId: 1 });
ensureIndex("households", { location: "2dsphere" });
// Recommended: one household per citizen account when citizenUserId is set
ensureIndex(
  "households",
  { citizenUserId: 1 },
  {
    unique: true,
    partialFilterExpression: { citizenUserId: { $type: "objectId" } },
  }
);

ensureIndex("virtualbins", { zoneId: 1, isActive: 1 });
ensureIndex("virtualbins", { centroid: "2dsphere" });

ensureIndex("bins", { binId: 1 }, { unique: true });
ensureIndex("bins", { householdId: 1 });
ensureIndex("bins", { virtualBinId: 1 });
ensureIndex("bins", { location: "2dsphere" });
ensureIndex("bins", { status: 1 });

ensureIndex(
  "virtualbinmembers",
  { virtualBinId: 1, binId: 1 },
  { unique: true }
);
ensureIndex("virtualbinmembers", { binId: 1 });

/* ------------------------------
 * 5) TELEMETRY + DIGITAL TWIN
 * Telemetry -> telemetries
 * BinTwinLatest -> bintwinlatests
 * VirtualBinTwin -> virtualbintwins
 * ------------------------------ */

ensureCollection("telemetries", {
  $jsonSchema: {
    bsonType: "object",
    required: ["binId", "ts", "fillPercent"],
    properties: {
      binId: { bsonType: "objectId" },
      ts: { bsonType: "date" },
      fillPercent: { bsonType: ["double", "int", "long", "decimal"] },
      batteryPercent: {
        bsonType: ["double", "int", "long", "decimal", "null"],
      },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("bintwinlatests", {
  $jsonSchema: {
    bsonType: "object",
    required: ["binId", "lastSeenAt", "fillPercent"],
    properties: {
      binId: { bsonType: "objectId" },
      lastSeenAt: { bsonType: "date" },
      fillPercent: { bsonType: ["double", "int", "long", "decimal"] },
      batteryPercent: {
        bsonType: ["double", "int", "long", "decimal", "null"],
      },
      batteryState: { bsonType: "string" },
      isOffline: { bsonType: "bool" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("virtualbintwins", {
  $jsonSchema: {
    bsonType: "object",
    required: ["virtualBinId", "computedAt", "binsCount", "riskScore"],
    properties: {
      virtualBinId: { bsonType: "objectId" },
      computedAt: { bsonType: "date" },
      binsCount: { bsonType: ["double", "int", "long", "decimal"] },
      over80Count: { bsonType: ["double", "int", "long", "decimal"] },
      over95Count: { bsonType: ["double", "int", "long", "decimal"] },
      offlineCount: { bsonType: ["double", "int", "long", "decimal"] },
      avgFill: { bsonType: ["double", "int", "long", "decimal"] },
      maxFill: { bsonType: ["double", "int", "long", "decimal"] },
      pctOver80: { bsonType: ["double", "int", "long", "decimal"] },
      pctOver95: { bsonType: ["double", "int", "long", "decimal"] },
      offlinePct: { bsonType: ["double", "int", "long", "decimal"] },
      riskScore: { bsonType: ["double", "int", "long", "decimal"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

// Indexes
ensureIndex("telemetries", { binId: 1, ts: 1 }, { unique: true });
ensureIndex("telemetries", { binId: 1, ts: -1 });
ensureIndex("telemetries", { ts: -1 });
// Recommended retention: keep telemetry 180 days (comment out if you want to retain forever)
ensureIndex("telemetries", { ts: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

ensureIndex("bintwinlatests", { binId: 1 }, { unique: true });
ensureIndex("bintwinlatests", { isOffline: 1 });
ensureIndex("bintwinlatests", { isOffline: 1, lastSeenAt: -1 });
ensureIndex("bintwinlatests", { fillPercent: -1, updatedAt: -1 });

ensureIndex("virtualbintwins", { virtualBinId: 1 }, { unique: true });
ensureIndex("virtualbintwins", { riskScore: -1, computedAt: -1 });

/* ------------------------------
 * 6) OPERATIONS: CASES + TASKS
 * Case -> cases
 * Task -> tasks
 * ------------------------------ */

ensureCollection("cases", {
  $jsonSchema: {
    bsonType: "object",
    required: ["type", "status", "createdByUserId"],
    properties: {
      type: { bsonType: "string" },
      status: { bsonType: "string" },
      isOpen: { bsonType: "bool" },
      createdByUserId: { bsonType: "objectId" },
      householdId: { bsonType: ["objectId", "null"] },
      zoneId: { bsonType: ["objectId", "null"] },
      virtualBinId: { bsonType: ["objectId", "null"] },
      location: {
        bsonType: "object",
        properties: {
          type: { bsonType: "string", enum: ["Point"] },
          coordinates: { bsonType: "array" },
        },
      },
      description: { bsonType: "string" },
      bulkyWeightKg: { bsonType: ["double", "int", "long", "decimal", "null"] },
      priority: { bsonType: ["double", "int", "long", "decimal"] },
      slaDeadline: { bsonType: ["date", "null"] },
      validation: {
        bsonType: "object",
        properties: {
          validatedByUserId: { bsonType: ["objectId", "null"] },
          validatedAt: { bsonType: ["date", "null"] },
          note: { bsonType: "string" },
        },
      },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("tasks", {
  $jsonSchema: {
    bsonType: "object",
    required: ["caseId", "requiredVehicle", "status"],
    properties: {
      caseId: { bsonType: "objectId" },
      requiredVehicle: { bsonType: "string" },
      estimatedWeightKg: {
        bsonType: ["double", "int", "long", "decimal", "null"],
      },
      status: { bsonType: "string" },
      assignedToUserId: { bsonType: ["objectId", "null"] },
      vehicleId: { bsonType: ["objectId", "null"] },
      scheduledDate: { bsonType: ["string", "null"] },
      startedAt: { bsonType: ["date", "null"] },
      completedAt: { bsonType: ["date", "null"] },
      proofEvidenceId: { bsonType: ["objectId", "null"] },
      failureReason: { bsonType: "string" },
      stopLocation: {
        bsonType: "object",
        properties: {
          type: { bsonType: "string", enum: ["Point"] },
          coordinates: { bsonType: "array" },
        },
      },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

// Indexes (match model + add practical composites)
ensureIndex("cases", { type: 1, status: 1 });
ensureIndex("cases", { status: 1, isOpen: 1 });
ensureIndex("cases", { createdByUserId: 1, createdAt: -1 });
ensureIndex("cases", { householdId: 1, createdAt: -1 });
ensureIndex("cases", { zoneId: 1, status: 1, priority: -1 });
ensureIndex("cases", { virtualBinId: 1, createdAt: -1 });
ensureIndex("cases", { slaDeadline: 1 });
ensureIndex("cases", { location: "2dsphere" });

// BIN_SERVICE: only one open (isOpen=true) per virtualBinId
ensureIndex(
  "cases",
  { virtualBinId: 1, type: 1, isOpen: 1 },
  {
    unique: true,
    partialFilterExpression: { type: "BIN_SERVICE", isOpen: true },
  }
);

ensureIndex("tasks", { caseId: 1 });
ensureIndex("tasks", { requiredVehicle: 1, status: 1, scheduledDate: 1 });
ensureIndex("tasks", { assignedToUserId: 1, scheduledDate: 1, status: 1 });
ensureIndex("tasks", { vehicleId: 1, scheduledDate: 1, status: 1 });
ensureIndex("tasks", { scheduledDate: 1, status: 1 });
ensureIndex("tasks", { stopLocation: "2dsphere" });

/* ------------------------------
 * 7) ROUTING / VEHICLES
 * Vehicle -> vehicles
 * Route -> routes
 * RouteStop -> routestops
 * ------------------------------ */

ensureCollection("vehicles", {
  $jsonSchema: {
    bsonType: "object",
    required: ["code", "vehicleType"],
    properties: {
      code: { bsonType: "string" },
      vehicleType: { bsonType: "string" },
      capacityKg: { bsonType: ["double", "int", "long", "decimal", "null"] },
      isActive: { bsonType: "bool" },
      shiftStart: { bsonType: "string" },
      shiftEnd: { bsonType: "string" },
      crewUserIds: { bsonType: "array" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("routes", {
  $jsonSchema: {
    bsonType: "object",
    required: ["date", "vehicleId", "vehicleType", "createdByUserId"],
    properties: {
      date: { bsonType: "string" }, // YYYY-MM-DD (matches your model)
      vehicleId: { bsonType: "objectId" },
      vehicleType: { bsonType: "string" },
      status: { bsonType: "string" },
      version: { bsonType: ["double", "int", "long", "decimal"] },
      createdByUserId: { bsonType: "objectId" },
      publishedByUserId: { bsonType: ["objectId", "null"] },
      publishedAt: { bsonType: ["date", "null"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("routestops", {
  $jsonSchema: {
    bsonType: "object",
    required: ["routeId", "order", "location"],
    properties: {
      routeId: { bsonType: "objectId" },
      order: { bsonType: ["double", "int", "long", "decimal"] },
      location: {
        bsonType: "object",
        properties: {
          type: { bsonType: "string", enum: ["Point"] },
          coordinates: { bsonType: "array" },
        },
      },
      taskIds: { bsonType: "array" },
      eta: { bsonType: ["date", "null"] },
      distanceKm: { bsonType: ["double", "int", "long", "decimal", "null"] },
      durationMin: { bsonType: ["double", "int", "long", "decimal", "null"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureIndex("vehicles", { code: 1 }, { unique: true });
ensureIndex("vehicles", { vehicleType: 1, isActive: 1 });

ensureIndex("routes", { date: 1, vehicleId: 1, version: 1 }, { unique: true });
ensureIndex("routes", { date: 1, vehicleType: 1, status: 1 });

ensureIndex("routestops", { routeId: 1, order: 1 }, { unique: true });
ensureIndex("routestops", { routeId: 1 });
ensureIndex("routestops", { location: "2dsphere" });

/* ------------------------------
 * 8) EVIDENCE (MinIO/S3)
 * Evidence -> evidences
 * ------------------------------ */

ensureCollection("evidences", {
  $jsonSchema: {
    bsonType: "object",
    required: ["ownerUserId", "s3Key"],
    properties: {
      ownerUserId: { bsonType: "objectId" },
      relatedTaskId: { bsonType: ["objectId", "null"] },
      relatedCaseId: { bsonType: ["objectId", "null"] },
      kind: { bsonType: "string", enum: ["PHOTO", "DOCUMENT"] },
      s3Key: { bsonType: "string" },
      mimeType: { bsonType: "string" },
      sizeBytes: { bsonType: ["double", "int", "long", "decimal"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureIndex("evidences", { s3Key: 1 }, { unique: true });
ensureIndex("evidences", { ownerUserId: 1, createdAt: -1 });
ensureIndex("evidences", { relatedTaskId: 1, createdAt: -1 });
ensureIndex("evidences", { relatedCaseId: 1, createdAt: -1 });

/* ------------------------------
 * 9) REWARDS + WALLET
 * RewardRate -> rewardrates
 * RewardClaim -> rewardclaims
 * WalletTransaction -> wallettransactions
 * ------------------------------ */

ensureCollection("rewardrates", {
  $jsonSchema: {
    bsonType: "object",
    required: ["category", "ratePerUnit"],
    properties: {
      category: { bsonType: "string" },
      ratePerUnit: { bsonType: ["double", "int", "long", "decimal"] },
      isActive: { bsonType: "bool" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("rewardclaims", {
  $jsonSchema: {
    bsonType: "object",
    required: ["userId", "category", "quantity", "status"],
    properties: {
      userId: { bsonType: "objectId" },
      category: { bsonType: "string" },
      quantity: { bsonType: ["double", "int", "long", "decimal"] },
      status: { bsonType: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
      proofEvidenceId: { bsonType: ["objectId", "null"] },
      amountCredit: { bsonType: ["double", "int", "long", "decimal"] },
      reviewedByUserId: { bsonType: ["objectId", "null"] },
      reviewedAt: { bsonType: ["date", "null"] },
      note: { bsonType: "string" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureCollection("wallettransactions", {
  $jsonSchema: {
    bsonType: "object",
    required: ["userId", "type", "amount"],
    properties: {
      userId: { bsonType: "objectId" },
      type: { bsonType: "string", enum: ["CREDIT", "DEBIT"] },
      amount: { bsonType: ["double", "int", "long", "decimal"] },
      reason: { bsonType: "string" },
      refType: { bsonType: "string" },
      refId: { bsonType: ["objectId", "null"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureIndex("rewardrates", { category: 1 }, { unique: true });
ensureIndex("rewardrates", { isActive: 1 });

ensureIndex("rewardclaims", { status: 1, createdAt: -1 });
ensureIndex("rewardclaims", { userId: 1, createdAt: -1 });
ensureIndex("rewardclaims", { reviewedByUserId: 1, reviewedAt: -1 });

ensureIndex("wallettransactions", { userId: 1, createdAt: -1 });
ensureIndex("wallettransactions", { refType: 1, refId: 1 });

/* ------------------------------
 * 10) BILLING: INVOICES
 * Invoice -> invoices
 * ------------------------------ */

ensureCollection("invoices", {
  $jsonSchema: {
    bsonType: "object",
    required: ["userId", "month", "total", "amountDue", "generatedAt"],
    properties: {
      userId: { bsonType: "objectId" },
      month: { bsonType: "string" }, // YYYY-MM
      status: { bsonType: "string", enum: ["DRAFT", "ISSUED", "PAID"] },
      items: { bsonType: "array" },
      total: { bsonType: ["double", "int", "long", "decimal"] },
      creditsApplied: { bsonType: ["double", "int", "long", "decimal"] },
      amountDue: { bsonType: ["double", "int", "long", "decimal"] },
      generatedAt: { bsonType: "date" },
      paidAt: { bsonType: ["date", "null"] },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureIndex("invoices", { userId: 1, month: 1 }, { unique: true });
ensureIndex("invoices", { month: 1, status: 1 });
ensureIndex("invoices", { userId: 1, status: 1, month: -1 });

/* ------------------------------
 * 11) AUDIT LOG
 * AuditLog -> auditlogs
 * ------------------------------ */

ensureCollection("auditlogs", {
  $jsonSchema: {
    bsonType: "object",
    required: ["action"],
    properties: {
      actorUserId: { bsonType: ["objectId", "null"] },
      action: { bsonType: "string" },
      entityType: { bsonType: "string" },
      entityId: { bsonType: ["objectId", "null"] },
      meta: { bsonType: "object" },
      ip: { bsonType: "string" },
      userAgent: { bsonType: "string" },
      createdAt: { bsonType: "date" },
      updatedAt: { bsonType: "date" },
    },
  },
});

ensureIndex("auditlogs", { actorUserId: 1, createdAt: -1 });
ensureIndex("auditlogs", { action: 1, createdAt: -1 });
ensureIndex("auditlogs", { entityType: 1, entityId: 1, createdAt: -1 });

/* ------------------------------
 * 12) VIEWS (dashboard-friendly)
 * These are read-only "SQL view" equivalents.
 * ------------------------------ */

// Open case counts by type
ensureView("vw_open_cases_by_type", "cases", [
  { $match: { isOpen: true } },
  { $group: { _id: "$type", count: { $sum: 1 } } },
  { $project: { _id: 0, type: "$_id", count: 1 } },
]);

// Top risky virtual bins (joins virtualbintwins -> virtualbins -> zones)
ensureView("vw_top_risky_virtual_bins", "virtualbintwins", [
  { $sort: { riskScore: -1, computedAt: -1 } },
  { $limit: 50 },
  {
    $lookup: {
      from: "virtualbins",
      localField: "virtualBinId",
      foreignField: "_id",
      as: "vb",
    },
  },
  { $unwind: { path: "$vb", preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: "zones",
      localField: "vb.zoneId",
      foreignField: "_id",
      as: "zone",
    },
  },
  { $unwind: { path: "$zone", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      _id: 0,
      riskScore: 1,
      computedAt: 1,
      vbName: "$vb.name",
      wardCode: "$zone.wardCode",
      zoneName: "$zone.name",
      avgFill: 1,
      maxFill: 1,
      pctOver80: 1,
      pctOver95: 1,
      offlinePct: 1,
    },
  },
]);

print(`\n=== Done: ${DB_NAME} initialized. ===\n`);
