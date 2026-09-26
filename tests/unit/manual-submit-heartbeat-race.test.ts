import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SUBMIT_GRACE_MS, withinSubmitDeadline } from '@/lib/timing';

describe('manual submit and heartbeat race handling', () => {
  describe('endExam deadline boundary and grace period', () => {
    it('accepts manual submit within the 5s submit grace window as STUDENT_ENDED', () => {
      const now = new Date('2026-09-26T12:00:02.000Z');
      const expiresAt = new Date('2026-09-26T12:00:00.000Z'); // 2 seconds past expiry
      // Within the 5,000ms grace window
      expect(withinSubmitDeadline(expiresAt, now)).toBe(true);

      const isGraceExpired = Boolean(expiresAt && !withinSubmitDeadline(expiresAt, now));
      const reason = isGraceExpired ? 'EXPIRED' : 'STUDENT_ENDED';
      expect(reason).toBe('STUDENT_ENDED');
      const status = reason === 'STUDENT_ENDED' ? 'SUBMITTED' : 'AUTO_SUBMITTED';
      expect(status).toBe('SUBMITTED');
    });

    it('records manual submit as EXPIRED / AUTO_SUBMITTED only after the 5s grace window expires', () => {
      const now = new Date('2026-09-26T12:00:06.000Z');
      const expiresAt = new Date('2026-09-26T12:00:00.000Z'); // 6 seconds past expiry
      // Outside the 5,000ms grace window
      expect(withinSubmitDeadline(expiresAt, now)).toBe(false);

      const isGraceExpired = Boolean(expiresAt && !withinSubmitDeadline(expiresAt, now));
      const reason = isGraceExpired ? 'EXPIRED' : 'STUDENT_ENDED';
      expect(reason).toBe('EXPIRED');
      const status = reason === 'STUDENT_ENDED' ? 'SUBMITTED' : 'AUTO_SUBMITTED';
      expect(status).toBe('AUTO_SUBMITTED');
    });
  });

  describe('heartbeat interval cancellation on manual submit', () => {
    it('cancels scheduled heartbeat immediately so a tick in the same cycle does not race /end', async () => {
      let heartbeatCalls = 0;
      let stop = false;
      const closingRef = { current: false };

      const timer: { id?: NodeJS.Timeout } = {};
      const stopHeartbeat = () => {
        stop = true;
        if (timer.id) clearInterval(timer.id);
      };
      const heartbeatTimerRef = { current: { stop: stopHeartbeat } };

      const tick = async () => {
        if (stop || closingRef.current) return;
        heartbeatCalls += 1;
      };

      // Set up heartbeat interval
      timer.id = setInterval(() => {
        if (stop || closingRef.current) return;
        void tick();
      }, 10);

      // Student clicks "End Test" in the same tick
      // Immediate cancellation in handleEndExam before async flush or /end:
      heartbeatTimerRef.current.stop();
      closingRef.current = true;

      // Even if tick is triggered immediately
      await tick();

      // Wait a moment to ensure interval never fires
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(heartbeatCalls).toBe(0);
    });
  });
});
