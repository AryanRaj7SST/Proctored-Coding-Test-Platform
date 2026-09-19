import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  // TODO: Validate the session and role for this API route.
  void session;
  return NextResponse.json({ questions: [] });
}

export async function POST() {
  const session = await auth();
  // TODO: Validate ADMIN role, request schema, and persist the question with hidden testSpec server-side.
  void session;
  return NextResponse.json({ message: "TODO: create question" }, { status: 501 });
}
