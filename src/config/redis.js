const IORedis = require('ioredis');
const env = require('./env');

let client;

function getRedisClient() {
  if (!client) {
  client = new IORedis({
  host: env.redis.host || "127.0.0.1",
  port: Number(env.redis.port || 6379),
  family: 4,
  maxRetriesPerRequest: null
});
  }
  return client;
}

module.exports = { getRedisClient };
