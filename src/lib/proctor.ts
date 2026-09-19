import type { ProctorEventType } from "@prisma/client";

export function isProctorEventType(value: string): value is ProctorEventType {
  return ["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "PASTE", "COPY", "HEARTBEAT_LOST"].includes(value);
}

// TODO: Persist proctor events in a transaction and derive counts from PostgreSQL.
