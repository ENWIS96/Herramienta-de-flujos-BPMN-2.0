let counter = 0;

export function generateId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}`;
}

export function resetIdCounter(): void {
  counter = 0;
}

export function ensureId(existing: string | undefined, prefix: string): string {
  return existing && existing.trim().length > 0 ? existing : generateId(prefix);
}
