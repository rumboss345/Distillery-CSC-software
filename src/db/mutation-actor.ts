/** Role of the user performing a production mutation (SQLite locally, PostgreSQL on the server). */
let actorRole: string | null = null;

export function setMutationActorRole(role: string | null): void {
  actorRole = role;
}

export function getMutationActorRole(): string | null {
  return actorRole;
}
