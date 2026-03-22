const { createClient } = require("redis");

let client;

const getRedisClient = async () => {
  if (client) return client;

  client = createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error("[Redis] Max reconnect attempts reached");
          return new Error("Redis max retries exceeded");
        }
        const delay = Math.min(retries * 100, 3000);
        console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})`);
        return delay;
      },
    },
  });

  client.on("error", (err) =>
    console.error("[Redis] Client error:", err.message),
  );
  client.on("connect", () => console.log("[Redis] Connected"));

  await client.connect();
  return client;
};

const redisProxy = new Proxy(
  {},
  {
    get(_, method) {
      return async (...args) => {
        const c = await getRedisClient();
        return c[method](...args);
      };
    },
  },
);

module.exports = redisProxy;
