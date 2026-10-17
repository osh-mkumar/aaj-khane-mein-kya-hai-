import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { rmSync } from "node:fs";
import { once } from "node:events";
const file = resolve(`prisma/test-http-${process.pid}.db`);
const env = {
  ...process.env,
  DATABASE_URL: `file:${file.replaceAll("\\", "/")}`,
  OPENAI_API_KEY: "",
  NEXT_TELEMETRY_DISABLED: "1",
};
const port = 3102,
  base = `http://127.0.0.1:${port}`;
let server;
let logs = "";
let checks = 0;
async function call(path, body, status = 200) {
  const response = await fetch(
    `${base}/api/${path}`,
    body
      ? {
          method: "POST",
          headers: { "content-type": "application/json", origin: base },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const json = await response.json();
  assert.equal(response.status, status, JSON.stringify(json));
  checks++;
  return json.data;
}
try {
  execFileSync(process.execPath, ["scripts/migrate.mjs"], {
    env,
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"],
    { env, stdio: "pipe" },
  );
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      const r = await fetch(`${base}/api/household`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs);
  for (const path of [
    "dashboard",
    "household",
    "inventory",
    "recipes",
    "meal-planner",
    "activity",
  ]) {
    assert.equal((await fetch(`${base}/${path}`)).status, 200);
    checks++;
  }
  const household = await call("household");
  assert.equal(household.members.length, 4);
  const stock = await call("inventory");
  assert.equal((await call("recipes")).length, 15);
  assert.equal(
    (await call("recipes/resolve?name=Tadka%20Dal")).recipe.id,
    "dal-tadka",
  );
  const father = household.members.find((m) => m.relationship === "Father");
  const daughter = household.members.find((m) => m.relationship === "Daughter");
  const date = "2026-10-16";
  const scaled = await call("recipes/scale", {
    recipeId: "paneer-bhurji",
    servings: 6,
  });
  assert.equal(
    scaled.ingredients.find((i) => i.ingredientId === "paneer").quantity,
    300,
  );
  const verify = await call("recipes/verify", {
    recipeId: "chicken-curry",
    memberIds: [daughter.id],
    date,
    mealType: "dinner",
  });
  assert.equal(verify.status, "REJECTED");
  const request = {
    memberIds: [father.id],
    date,
    mealType: "dinner",
    servings: 2,
    maxMinutes: 90,
    requestedDish: "Jeera Rice",
  };
  const recommendations = await call("meals/recommend", request);
  assert.ok(recommendations.menus.length);
  const menu = recommendations.menus[0];
  const dishes = menu.dishes.map((d) => ({
    recipeId: d.recipeId,
    servings: d.servings,
    memberIds: d.memberIds,
  }));
  const check = await call("ingredients/check", { dishes, date });
  assert.equal(check.status, "NEEDS_CONFIRMATION");
  assert.deepEqual(await call("groceries/calculate", { dishes, date }), check);
  const plan = await call(
    "meals",
    {
      request,
      dishes,
      stateVersion: menu.stateVersion,
      acknowledgeUncertainty: true,
    },
    201,
  );
  assert.ok(plan.snapshot.menu.inventory.ingredients.length);
  assert.equal(
    (await call(`meals/${plan.id}`)).snapshot.menu.dishes[0].recipeName,
    "Jeera Rice",
  );
  assert.equal((await call(`meals?date=${date}`)).length, 1);
  assert.deepEqual(await call("inventory"), stock);
  await call(
    "meals",
    {
      request,
      dishes,
      stateVersion: menu.stateVersion,
      acknowledgeUncertainty: true,
    },
    409,
  );
  await call(
    "recipes/generate",
    {
      dishName: "Unlisted test soup",
      memberIds: [father.id],
      date,
      mealType: "dinner",
      servings: 2,
      maxMinutes: 60,
    },
    503,
  );
  const wrongOrigin = await fetch(`${base}/api/meals/recommend`, {
    method: "POST",
    headers: {
      origin: "https://untrusted.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  assert.equal(wrongOrigin.status, 403);
  checks++;
  console.log(
    `Live HTTP smoke: ${checks} checks passed; isolated database only; no inventory deduction.`,
  );
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  rmSync(file, { force: true });
  rmSync(`${file}-journal`, { force: true });
}
