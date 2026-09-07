const invitationKey = 'gp-pending-invitation';

// Keep the invitation across OAuth even when the configured callback drops the query.
export function pendingInvitation(search: string, storage: Pick<Storage, 'getItem' | 'setItem'>): string | null {
  const token = new URLSearchParams(search).get('invite');
  if (token) { storage.setItem(invitationKey, token); return token; }
  return storage.getItem(invitationKey);
}

export function clearInvitation(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(invitationKey);
}
