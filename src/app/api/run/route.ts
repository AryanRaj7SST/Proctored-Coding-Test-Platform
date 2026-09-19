import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runInRunner } from "@/lib/runner-client";

export async function POST(request: Request) {
  const session = await auth();
  // TODO: Validate the signed-in student/session and exam permissions.
  void session;

  const body = (await request.json()) as { html?: string; css?: string; js?: string; questionId?: string };
  if (!body.html || !body.css || !body.js || !body.questionId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const question = await prisma.question.findUnique({ where: { id: body.questionId }, select: { testSpec: true } });
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  // TODO: Verify the attempt/exam and role before forwarding code.
  // TODO: Never include testSpec in a response to the browser.
  const result = await runInRunner({ html: body.html, css: body.css, js: body.js, testSpec: question.testSpec });
  return NextResponse.json(result);
}
