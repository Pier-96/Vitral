export class AccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}

export type Membership = { userId: string; isCoach: boolean; clientId: string | null; coachId: string | null };

export function validateMembership(member: Membership) {
  if ((member.isCoach && member.coachId) || (member.clientId && !member.isCoach)) {
    throw new AccessError('Esta cuenta tiene roles incompatibles. Es necesario corregir la vinculación.', 409);
  }
}

// The subject is always the asesorado, for both participants in a relationship.
export function progressOwner(member: Membership, candidate: unknown, write = false): string {
  validateMembership(member);
  const owner = member.isCoach ? member.clientId : member.coachId ? member.userId : null;
  if (!owner || (write && !member.isCoach)) {
    throw new AccessError(write ? 'Solo el coach vinculado puede modificar el progreso.' : 'No tienes un asesoramiento vinculado.');
  }
  if (candidate !== undefined && candidate !== '' && candidate !== owner) {
    throw new AccessError('No tienes permiso para acceder a este progreso.');
  }
  return owner;
}
