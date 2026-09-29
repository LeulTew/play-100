/**
 * Waits until a sign-in would be newer than a deletion the server stored at `deletedAt`.
 *
 * The rules let a session resume a deleted online copy only when its `auth_time` is later than the deletion
 * (firestore.rules, headResume: `auth_time * 1000 > before.updatedAt`). Auth records `auth_time` in whole seconds, while
 * the deletion's server time has milliseconds, so a sign-in in the same second as the deletion counts as older and is
 * refused. This waits until the next whole second after the stored deletion time, which the Auth emulator's clock, on
 * this machine, has then also reached: a fixed wait could be too short or needlessly long.
 */
export async function untilSignInNewerThan(deletedAt: { toMillis(): number }): Promise<void> {
  const nextSecond = Math.floor(deletedAt.toMillis() / 1000) * 1000 + 1000;
  // A few milliseconds more, for the separate processes reading the same clock in turn.
  const wait = nextSecond - Date.now() + 20;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}
