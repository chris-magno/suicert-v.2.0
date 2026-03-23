import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDeterministicZkSalt } from "@/lib/auth/zk-salt";

export async function GET() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const salt = getDeterministicZkSalt(userId);
    return NextResponse.json({ ok: true, salt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve deterministic salt";
    return NextResponse.json({ ok: false, error: message }, { status: 501 });
  }
}
