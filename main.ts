import { Hono } from "@hono/hono";
import build from "./bundler.ts";
const app = new Hono();

app.post("/*", async (c) => {
  console.log("REQUEST");
  return c.res = c.json(await build(await c.req.json()));
});

Deno.serve(app.fetch);