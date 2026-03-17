/*
-Flow of the redis
import redis in create client
-initialize client
if client is there then we simply return else 
- we create client inside client we pass url which is docker redis port location
- second is socket we try to reconnect through exponentialish backoff not hit it time after time again
- so retries *100, 3000 means it i will try say 1 *100 100ms, 200ms 300ms the most delay it can have is 3000ms caps at 
-then if it still fails we print the message and return the delay  which is calculated above else
-we do client.on(connect, ()=> print connect msg)
- await client.connect()
- return client

now since getRedis client is async we have to await it before we can use the client it is annoying to just repeat it again 
and again so when we do redis.get the proxy intercepts that and instead of looking for a get property it returns the function
-meaning await getRedisClient() directly for us and then calls .get() on real client
--its like a receptionist that just provides us a clear connection directly else we'd have to use 
--await getRedisClient() everytime everywhere
*/

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

//proxy so callers can do redis.get(), redis.set() etc.
//without awaiting getRedisClient() everytime
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
