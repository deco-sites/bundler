import { Hono } from "@hono/hono";
import build from "./bundler.ts";
const app = new Hono();

const portEnv = Deno.env.get("PORT");
const port = portEnv ? +portEnv : 8000;
app.post("/*", async (c) => {
  return c.res = c.json(await build(await c.req.json()));
});

Deno.serve({
  handler: app.fetch,
  port,
});