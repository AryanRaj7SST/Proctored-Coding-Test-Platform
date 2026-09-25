'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog, Select } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { apiPatch, ApiError } from '@/lib/api';

type Role = 'STUDENT' | 'ADMIN';

interface Change {
  role?: Role;
  active?: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
}

/**
 * Role and account access for one user. Every change is confirmed, goes
 * through the administrator-only PATCH /api/users/[id] (which also refuses
 * self-demotion and removing the last administrator) and is audited.
 * Your own row is read-only here.
 */
export function UserAccessControls({
  user,
  isSelf,
}: {
  user: { id: string; email: string; role: Role; active: boolean };
  isSelf: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState<Change | null>(null);
  const [busy, setBusy] = React.useState(false);

  const askRole = (role: Role) => {
    if (role === user.role) return;
    setPending(
      role === 'ADMIN'
        ? {
            role,
            title: 'Make this person an administrator?',
            message: `${user.email} will be able to manage questions, tests, results and every account, including yours.`,
            confirmLabel: 'Make administrator',
            danger: true,
          }
        : {
            role,
            title: 'Remove administrator access?',
            message: `${user.email} becomes a student on their next request.`,
            confirmLabel: 'Make student',
            danger: true,
          },
    );
  };

  const askActive = () =>
    setPending(
      user.active
        ? {
            active: false,
            title: 'Deactivate this account?',
            message: `${user.email} is signed out on their next request and cannot sign in again until reactivated. Their results are kept.`,
            confirmLabel: 'Deactivate',
            danger: true,
          }
        : {
            active: true,
            title: 'Reactivate this account?',
            message: `${user.email} will be able to sign in again.`,
            confirmLabel: 'Reactivate',
            danger: false,
          },
    );

  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await apiPatch(`/api/users/${user.id}`, {
        ...(pending.role ? { role: pending.role } : {}),
        ...(pending.active !== undefined ? { active: pending.active } : {}),
      });
      toast.push(`${user.email} updated.`, 'success');
      setPending(null);
      router.refresh();
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Could not update that account.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (isSelf) return <span className="text-xs text-slate-500">You</span>;

  return (
    <div className="flex items-center gap-2">
      <Select
        value={user.role}
        onChange={(e) => askRole(e.target.value as Role)}
        className="h-7 w-28 text-xs"
        aria-label={`Role for ${user.email}`}
      >
        <option value="STUDENT">Student</option>
        <option value="ADMIN">Admin</option>
      </Select>
      <button
        type="button"
        onClick={askActive}
        className={
          user.active ? 'text-xs text-rose-400 hover:underline' : 'text-xs text-brand-300 hover:underline'
        }
      >
        {user.active ? 'Deactivate' : 'Reactivate'}
      </button>
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title ?? ''}
        message={pending?.message ?? ''}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        danger={pending?.danger}
        busy={busy}
        onConfirm={() => void apply()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
