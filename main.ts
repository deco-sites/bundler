import { Hono } from "@hono/hono";
import build from "./bundler.ts";
const app = new Hono();

app.post("/*", async (c) => {
  return c.json(await build(await c.req.json()));
});

Deno.serve(app.fetch);