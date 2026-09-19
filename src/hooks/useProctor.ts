"use client";
import { useEffect } from "react";

export function useProctor(onViolation: (type: "TAB_HIDDEN" | "WINDOW_BLUR") => void) {
  useEffect(() => {
    const handleVisibility = () => { if (document.visibilityState === "hidden") onViolation("TAB_HIDDEN"); };
    const handleBlur = () => onViolation("WINDOW_BLUR");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    // TODO: Debounce related browser events and avoid duplicate violation records.
    // TODO: Send server-backed proctor events rather than keeping counts in client state.
    return () => { document.removeEventListener("visibilitychange", handleVisibility); window.removeEventListener("blur", handleBlur); };
  }, [onViolation]);
}
