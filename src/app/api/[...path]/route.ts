import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import * as service from "@/lib/db/service";
import { db } from "@/lib/db";
import * as meals from "@/lib/meals/service";
import { resolveRecipe, resetRecipe } from "@/lib/recipes/resolver";
import {
  generateRecipe,
  saveGeneratedRecipe,
  discardDraft,
} from "@/lib/recipes/generator";
import { dateOnly } from "@/lib/validation/planning";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ path: string[] }> };
async function handler(req: Request, context: Context) {
  try {
    const { path } = await context.params;
    const [resource, id, customId] = path;
    const method = req.method;
    if (path.length > 3) throw new service.ApiError(404, "Endpoint not found");
    for (const part of path)
      z.string()
        .min(1)
        .max(128)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .parse(part);
    if (method !== "GET") {
      const origin = req.headers.get("origin");
      // Next may normalize req.url to an internal hostname. Compare the browser
      // Origin with the actual HTTP Host, not that internal URL.
      const requestUrl = new URL(req.url);
      const host = req.headers.get("host") ?? requestUrl.host;
      let sameOrigin = !origin;
      if (origin) {
        try {
          const browserOrigin = new URL(origin);
          sameOrigin =
            browserOrigin.host === host &&
            browserOrigin.protocol === requestUrl.protocol;
        } catch {
          sameOrigin = false;
        }
      }
      if (!sameOrigin)
        throw new service.ApiError(
          403,
          "Cross-origin mutations are not permitted",
        );
    }
    const body = async () => {
      try {
        return await req.json();
      } catch {
        throw new service.ApiError(400, "Malformed JSON body");
      }
    };
    let data: unknown;
    let status = 200;
    const endpoint = path.join("/");
    if (method === "GET" && endpoint === "recipes/resolve") {
      const query = z
        .object({ name: z.string().trim().min(1).max(120) })
        .strict()
        .parse(Object.fromEntries(new URL(req.url).searchParams));
      data = await resolveRecipe(query.name);
    } else if (method === "GET" && resource === "meals" && !customId) {
      const query = z
        .object({ date: dateOnly.optional() })
        .strict()
        .parse(Object.fromEntries(new URL(req.url).searchParams));
      data = id ? await meals.getMeal(id) : await meals.getMeals(query.date);
    } else if (
      method === "POST" &&
      [
        "recipes/generate",
        "recipes/generated/save",
        "recipes/generated/discard",
        "recipes/scale",
        "recipes/verify",
        "meals/recommend",
        "meals",
        "ingredients/check",
        "groceries/calculate",
      ].includes(endpoint)
    ) {
      const input = await body();
      switch (endpoint) {
        case "recipes/generate":
          data = await generateRecipe(input);
          break;
        case "recipes/generated/save":
          data = await saveGeneratedRecipe(input);
          status = 201;
          break;
        case "recipes/generated/discard":
          data = discardDraft(input);
          break;
        case "recipes/scale":
          data = await meals.scale(input);
          break;
        case "recipes/verify":
          data = await meals.verify(input);
          break;
        case "meals/recommend":
          data = await meals.recommend(input);
          break;
        case "meals":
          data = await meals.saveMeal(input);
          status = 201;
          break;
        default:
          data = await meals.checkIngredients(input);
      }
    } else if (
      method === "POST" &&
      resource === "recipes" &&
      id === "reset" &&
      customId
    ) {
      z.object({ confirmed: z.literal(true) })
        .strict()
        .parse(await body());
      data = await resetRecipe(customId);
    } else if (method === "GET") {
      if (resource === "household" && !id) data = await service.getHousehold();
      else if (resource === "members" && !customId)
        data = id ? await service.getMember(id) : await service.getMembers();
      else if (resource === "inventory" && !id)
        data = await service.getInventory();
      else if (resource === "recipes" && !customId)
        data = id ? await service.getRecipe(id) : await service.getRecipes();
      else if (resource === "activity" && !id)
        data = await service.getActivity();
      else if (resource === "ingredients" && !id)
        data = await db.ingredient.findMany({ orderBy: { name: "asc" } });
      else throw new service.ApiError(404, "Endpoint not found");
    } else if (resource === "members" && !customId) {
      if (method === "POST" && !id) {
        data = await service.saveMember(await body());
        status = 201;
      } else if (method === "PATCH" && id)
        data = await service.saveMember(await body(), id);
      else if (method === "DELETE" && id) data = await service.deleteMember(id);
      else throw new service.ApiError(405, "Method not allowed");
    } else if (resource === "inventory" && !customId) {
      if (method === "POST" && !id) {
        data = await service.saveInventory(await body());
        status = 201;
      } else if (method === "PATCH" && id)
        data = await service.saveInventory(await body(), id);
      else if (method === "DELETE" && id)
        data = await service.deleteInventory(id);
      else throw new service.ApiError(405, "Method not allowed");
    } else if (resource === "recipes" && id === "custom") {
      if (method === "POST" && !customId) {
        data = await service.saveRecipe(await body());
        status = 201;
      } else if (method === "PATCH" && customId)
        data = await service.saveRecipe(await body(), customId);
      else throw new service.ApiError(405, "Method not allowed");
    } else throw new service.ApiError(404, "Endpoint not found");
    return NextResponse.json({ data, error: null }, { status });
  } catch (error) {
    let status = 500,
      message = "An unexpected error occurred",
      details: unknown;
    if (error instanceof service.ApiError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 422;
      message = "Please check your input";
      details = error.flatten();
    } else if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code: unknown }).code === "string"
    ) {
      const code = (error as { code: string }).code;
      if (code === "P2002") {
        status = 409;
        message = "This ingredient or household recipe already exists";
      } else if (code === "P2025") {
        status = 404;
        message = "Record not found";
      }
    }
    if (status === 500) console.error(error);
    return NextResponse.json(
      { data: null, error: { message, details } },
      { status },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };
