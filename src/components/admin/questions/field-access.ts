import type { RawObject } from './test-body';

/** Read/write helpers for the loose builder objects. */

export const readString = (o: RawObject, key: string): string => {
  const v = o[key];
  return typeof v === 'string' ? v : '';
};

export const readNumber = (o: RawObject, key: string): string => {
  const v = o[key];
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
};

/** Set (or, for undefined, remove) one key, returning a new object. */
export function withKey(o: RawObject, key: string, value: unknown): RawObject {
  const next = { ...o };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** Number input value -> stored value ('' removes the key so the validator can flag it). */
export const parseNumberInput = (value: string): number | undefined =>
  value === '' ? undefined : Number(value);
