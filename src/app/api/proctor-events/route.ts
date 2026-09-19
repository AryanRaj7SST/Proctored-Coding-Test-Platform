import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isProctorEventType } from "@/lib/proctor";

export async function POST(request: Request) {
  const session = await auth();
  // TODO: Validate the signed-in student, exam membership, and payload.
  void session;
  const body = (await request.json()) as { type?: string };
  if (!body.type || !isProctorEventType(body.type)) return NextResponse.json({ error: "Invalid proctor event" }, { status: 400 });
  // TODO: Persist the event. Counts must be derived from the database, not client state.
  return NextResponse.json({ accepted: true });
}
