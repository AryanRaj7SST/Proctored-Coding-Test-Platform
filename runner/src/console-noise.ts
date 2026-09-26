/**
 * Console lines the sandbox itself causes. The student's page is the only
 * request ever served -- the sandbox has no network -- so Chrome logs every
 * blocked photo, font, stylesheet or script as
 * "Failed to load resource: net::ERR_...". Those are not errors in the
 * student's code, so the "No console errors" check must not count them.
 * Errors the student's code raises itself (exceptions, console.error) always
 * count.
 */
export function isSandboxNetworkNoise(text: string): boolean {
  return /^Failed to load resource: net::ERR_[A-Z_]+/.test(text);
}
