const BinId = require("../models/BinId");

// -------------------------
// helpers (local to controller)
// -------------------------
const DEFAULT_PREFIX = "BIN-";
const DEFAULT_PAD = 6;

function makeRange(start, end) {
  const s = Number(start);
  const e = Number(end);
  if (!Number.isInteger(s) || !Number.isInteger(e)) throw new Error("start/end must be integers");
  if (s <= 0 || e <= 0) throw new Error("start/end must be > 0");
  if (s > e) throw new Error("start must be <= end");
  const out = [];
  for (let i = s; i <= e; i++) out.push(i);
  return out;
}

function toCode(num, prefix = DEFAULT_PREFIX, pad = DEFAULT_PAD) {
  const n = Number(num);
  if (!Number.isInteger(n) || n <= 0) throw new Error("bin number must be positive integer");
  return `${prefix}${String(n).padStart(pad, "0")}`;
}

function parseNumberFromCode(code, prefix = DEFAULT_PREFIX) {
  if (!code?.startsWith(prefix)) throw new Error("Invalid prefix");
  const raw = code.slice(prefix.length);
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Invalid numeric part");
  return n;
}

// -------------------------
// CRUD: list
// GET /api/admin/binids?page=1&limit=50&assigned=true/false&q=BIN-0001
// -------------------------
exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const skip = (page - 1) * limit;

    const q = String(req.query.q || "").trim();
    const assigned = req.query.assigned;

    const filter = {};
    if (q) filter.code = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (assigned === "true") filter.isAssigned = true;
    if (assigned === "false") filter.isAssigned = false;

    const [items, total] = await Promise.all([
      BinId.find(filter).sort({ code: 1 }).skip(skip).limit(limit).lean(),
      BinId.countDocuments(filter),
    ]);

    res.json({ ok: true, data: { items, total, page, limit } });
  } catch (e) {
    next(e);
  }
};

// -------------------------
// CRUD: create single
// POST /api/admin/binids
// Body: { code?: "BIN-000010", number?: 10, prefix?, pad?, notes? }
// -------------------------
exports.createOne = async (req, res, next) => {
  try {
    const { code, number, prefix = DEFAULT_PREFIX, pad = DEFAULT_PAD, notes = "" } = req.body || {};

    const finalCode = code || toCode(number, prefix, pad);

    const created = await BinId.create({ code: finalCode, notes });
    res.status(201).json({ ok: true, data: created });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ ok: false, message: "BinId already exists" });
    next(e);
  }
};

// -------------------------
// DELETE single
// DELETE /api/admin/binids/:id
// -------------------------
exports.deleteOne = async (req, res, next) => {
  try {
    const deleted = await BinId.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ ok: false, message: "Not found" });
    res.json({ ok: true, data: deleted });
  } catch (e) {
    next(e);
  }
};

// -------------------------
// Bulk generate by range
// POST /api/admin/binids/generate-range
// Body: { start: 1, end: 100, prefix?: "BIN-", pad?: 6, notes?: "" }
// Creates only missing IDs, skips existing.
// -------------------------
exports.generateRange = async (req, res, next) => {
  try {
    const { start, end, prefix = DEFAULT_PREFIX, pad = DEFAULT_PAD, notes = "" } = req.body || {};

    const nums = makeRange(start, end);
    const codes = nums.map((n) => toCode(n, prefix, pad));

    const existing = await BinId.find({ code: { $in: codes } }, { code: 1 }).lean();
    const existingSet = new Set(existing.map((x) => x.code));

    const docs = codes
      .filter((c) => !existingSet.has(c))
      .map((c) => ({ code: c, notes }));

    if (docs.length === 0) {
      return res.json({
        ok: true,
        data: { created: 0, skipped: codes.length, start, end, prefix, pad },
      });
    }

    // ordered:false => safe if concurrency creates duplicates
    const inserted = await BinId.insertMany(docs, { ordered: false });

    res.status(201).json({
      ok: true,
      data: { created: inserted.length, skipped: codes.length - inserted.length, start, end, prefix, pad },
    });
  } catch (e) {
    // insertMany bulk errors can happen when some codes already inserted concurrently
    if (e?.writeErrors) {
      const created = e?.result?.result?.nInserted ?? 0;
      return res.status(201).json({ ok: true, data: { created, note: "Some IDs already existed" } });
    }
    next(e);
  }
};

// -------------------------
// Bulk delete by range
// DELETE /api/admin/binids/delete-range
// Body: { start: 1, end: 100, prefix?: "BIN-", pad?: 6 }
// -------------------------
exports.deleteRange = async (req, res, next) => {
  try {
    const { start, end, prefix = DEFAULT_PREFIX, pad = DEFAULT_PAD } = req.body || {};

    const nums = makeRange(start, end);
    const codes = nums.map((n) => toCode(n, prefix, pad));

    const result = await BinId.deleteMany({ code: { $in: codes } });

    res.json({ ok: true, data: { deleted: result.deletedCount || 0, start, end, prefix, pad } });
  } catch (e) {
    next(e);
  }
};

// -------------------------
// Delete by code range (optional, if admin gives BIN-000010 to BIN-000050)
// DELETE /api/admin/binids/delete-code-range
// Body: { startCode: "BIN-000010", endCode: "BIN-000050", prefix? }
// -------------------------
exports.deleteCodeRange = async (req, res, next) => {
  try {
    const { startCode, endCode, prefix = DEFAULT_PREFIX } = req.body || {};
    const s = parseNumberFromCode(startCode, prefix);
    const e = parseNumberFromCode(endCode, prefix);
    if (s > e) return res.status(400).json({ ok: false, message: "startCode must be <= endCode" });

    // this deletes using regex match is messy; better to convert to numeric range:
    // If you store num in schema, you can do:
    // await BinId.deleteMany({ num: { $gte: s, $lte: e } })
    // For now we build code list:
    const pad = String(startCode.slice(prefix.length)).length; // infer pad length from input
    const nums = makeRange(s, e);
    const codes = nums.map((n) => toCode(n, prefix, pad));

    const result = await BinId.deleteMany({ code: { $in: codes } });
    res.json({ ok: true, data: { deleted: result.deletedCount || 0, startCode, endCode } });
  } catch (e) {
    next(e);
  }
};
