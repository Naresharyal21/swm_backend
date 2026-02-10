// const mongoose = require('mongoose');
// const env = require('../config/env');

// async function connectMongo() {
//   mongoose.set('strictQuery', true);
//   await mongoose.connect(env.mongoUri);
//   return mongoose.connection;
// }

// module.exports = { connectMongo };


//atlas connecting,
const mongoose = require("mongoose");
const env = require("../config/env");

async function connectMongo() {
  mongoose.set("strictQuery", true);

  // USE_ATLAS=false => local, USE_ATLAS=true => atlas
  const useAtlas = String(process.env.USE_ATLAS || "false").toLowerCase() === "true";

  // Prefer explicit env vars (safe). Fallback to existing env.mongoUri.
  const localUri = process.env.MONGO_URI_LOCAL || "mongodb://127.0.0.1:27017/smartwaste";
  const atlasUri = process.env.MONGO_URI_ATLAS;

  const uri = useAtlas ? atlasUri : localUri;

  if (!uri) {
    throw new Error(
      "Missing Mongo URI. Set MONGO_URI_ATLAS in .env (and optionally MONGO_URI_LOCAL)."
    );
  }

  await mongoose.connect(uri);
  console.log("✅ Mongo connected:", useAtlas ? "ATLAS" : "LOCAL", "DB =", mongoose.connection.name);

  return mongoose.connection;
}

module.exports = { connectMongo };
