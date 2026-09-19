import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST() {
  const session = await auth();
  // TODO: Validate the student session, exam/attempt state, and persist the submission.
  void session;
  return NextResponse.json({ message: "TODO: submit attempt" }, { status: 501 });
}
