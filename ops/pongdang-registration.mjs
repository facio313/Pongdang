// Runs beside the existing domain bridge, using the installed central writer.
// Never import a second account database or grant access to another application.
const GROUPS = Object.freeze(['user', 'portfolio-v2', 'access-pongdang']);
const RESERVED = new Set(['anonymous-guest', 'local-operator']);

export class RegistrationError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

export function registrationInput(value) {
  const invalid = () => { throw new RegistrationError(400, 'INVALID_REGISTRATION_REQUEST'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 4
    || Object.keys(value).some(key => !['username', 'displayName', 'email', 'password'].includes(key))
    || Object.values(value).some(field => typeof field !== 'string' || /[\x00-\x1f\x7f]/.test(field))) invalid();
  const username = value.username.trim().toLowerCase();
  const email = value.email.trim().toLowerCase();
  const displayName = value.displayName.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(username) || RESERVED.has(username)
    || !displayName || displayName.length > 120 || email.length > 254
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || Array.from(value.password).length < 14 || Array.from(value.password).length > 128
    || !/[A-Z]/.test(value.password) || !/[a-z]/.test(value.password)
    || !/[0-9]/.test(value.password) || !/[\p{P}\p{S}]/u.test(value.password)) invalid();
  return { username, email, displayName, password: value.password };
}

/** The central serializer must accept the existing Pongdang grant contract.
 * The marker is mandatory: a bare legacy "user" group can expand to other apps. */
export async function registerPongdangAccount(input, { store, hashPassword, serializeUserDatabase, groupsForAssignment, signal }) {
  let data;
  try {
    data = registrationInput(input);
    const groups = groupsForAssignment('user', ['pongdang']);
    if (!Array.isArray(groups) || groups.length !== GROUPS.length
      || groups.some((group, index) => group !== GROUPS[index])) {
      throw new RegistrationError(503, 'SSO_REGISTRATION_UNAVAILABLE');
    }
    const current = await store.readVersioned();
    const assertAvailable = database => {
      if (Object.hasOwn(database.users, data.username)
        || Object.values(database.users).some(user => user.email.toLowerCase() === data.email)) {
        throw new RegistrationError(409, 'SSO_REGISTRATION_CONFLICT');
      }
    };
    assertAvailable(current.database);
    signal.throwIfAborted();
    await store.mutate({
      actor: 'pongdang-self-registration', action: 'register_pongdang_user',
      target: data.username, expectedRevision: current.revision,
      transform: async database => {
        signal.throwIfAborted();
        assertAvailable(database);
        // Hash inside the central store's lock, through its existing password
        // helper (stdin/PTY, never command arguments or environment variables).
        const digest = await hashPassword(data.password);
        if (typeof digest !== 'string' || !/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/.test(digest)) {
          throw new RegistrationError(503, 'SSO_REGISTRATION_UNAVAILABLE');
        }
        signal.throwIfAborted();
        database.users[data.username] = {
          disabled: false, displayname: data.displayName, password: digest,
          email: data.email, groups,
        };
        // Validate the complete candidate before the writer creates any backup
        // or commits. Never substitute a legacy role or broaden app access.
        serializeUserDatabase(database);
      },
    });
  } finally {
    if (data) data.password = '';
    if (input && typeof input === 'object') input.password = '';
  }
}
