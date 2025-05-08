import { Hono } from "@hono/hono";
import build from "./bundler.ts";
const app = new Hono();

const portEnv = Deno.env.get("PORT");
const port = portEnv ? +portEnv : 8000;
app.post("/*", async (c) => {
  try {
    return c.res = c.json(await build(await c.req.json()));
  } catch (e) {
    if (e instanceof Error) {
      return c.res = c.json({ error: e.message }, 500);
    }
    return c.res = c.json({ error: "Unknown error" }, 500);
  }
});

Deno.serve({
  handler: app.fetch,
  port,
});