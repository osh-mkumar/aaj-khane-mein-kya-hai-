import { NextResponse } from "next/server";
import { applyConfirmedVoiceActions } from "@/lib/db/voice-mutations";
import { voiceConfirmRequestSchema } from "@/lib/validation/voice";

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

    const parseResult = voiceConfirmRequestSchema.safeParse(body);
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

    const { actions, idempotencyKey, transcript, expectedStateVersion } = parseResult.data;

    const result = await applyConfirmedVoiceActions(actions, {
      idempotencyKey,
      transcript,
      expectedStateVersion,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Voice confirmation execution failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to apply confirmed actions",
      },
      { status: 500 }
    );
  }
}
