import crypto from 'node:crypto';

// Short prefixed id, e.g. newId('run') -> 'run_1a2b3c4d5e6f'.
export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}
