import { NextResponse } from "next/server";
import { getHousehold } from "@/lib/db/service";
import { interpretVoiceCommand } from "@/lib/ai/interpreter";
import { voiceInterpretRequestSchema } from "@/lib/validation/voice";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Malformed JSON body" },
        { status: 400 }
      );
    }

    const parseResult = voiceInterpretRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: parseResult.error.flatten(),
        },
        { status: 422 }
      );
    }

    const { transcript } = parseResult.data;

    // Fetch household context server-side (members and ingredients) for entity resolution
    let members: Array<{ id: string; name: string; relationship?: string | null }> = [];
    let ingredients: Array<{ id: string; name: string }> = [];

    try {
      const household = await getHousehold();
      members = household.members.map((m) => ({
        id: m.id,
        name: m.name,
        relationship: m.relationship,
      }));
      ingredients = household.inventory.map((i) => ({
        id: i.ingredient.id,
        name: i.ingredient.name,
      }));
    } catch (e) {
      console.warn("Could not load household context for voice interpreter:", e);
    }

    const { result, provider, model, fallbackUsed } = await interpretVoiceCommand(
      transcript,
      { members, ingredients }
    );

    return NextResponse.json({
      success: true,
      data: result,
      provider,
      model,
      fallbackUsed,
    });
  } catch (error) {
    console.error("Voice interpretation endpoint error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Interpretation failed",
      },
      { status: 500 }
    );
  }
}
