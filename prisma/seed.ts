// Snak'r database seed — idempotent, safe to run on every container start.
//
// Seeds two things and never clobbers state on re-run:
//   1. Default global Settings (registration closed; optional default quota).
//   2. The initial ADMIN user (only when no admin exists yet).
//
// Run via `prisma db seed` (configured in package.json -> prisma.seed) which
// executes `tsx prisma/seed.ts`. The plaintext admin password is NEVER logged.

import { PrismaClient, Role } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

// OWASP argon2id floor (brief section c). Bump memoryCost on capable hosts.
const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

async function seedSettings(): Promise<void> {
  // Registration is closed by default; an admin opens it later from the UI.
  // update:{} makes this a no-op once the row exists, so an admin-changed value
  // is never reset by a subsequent seed.
  await prisma.setting.upsert({
    where: { key: 'registration_open' },
    update: {},
    create: { key: 'registration_open', value: 'false' },
  });

  const defaultQuota = process.env.DEFAULT_QUOTA_BYTES?.trim();
  if (defaultQuota) {
    await prisma.setting.upsert({
      where: { key: 'default_quota_bytes' },
      update: {},
      create: { key: 'default_quota_bytes', value: defaultQuota },
    });
  }
}

async function seedAdmin(): Promise<void> {
  // Guard: if ANY admin already exists, do nothing. This keeps a rotated admin
  // password intact across restarts and prevents accidental re-provisioning.
  if ((await prisma.user.count({ where: { role: Role.ADMIN } })) > 0) return;

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL and ADMIN_PASSWORD are required to seed the first-boot admin account',
    );
  }
  const displayName = process.env.ADMIN_NAME?.trim() || null;

  const passwordHash = await hash(password, ARGON2_OPTS);

  await prisma.user.upsert({
    where: { email },
    // update:{} — never overwrite an existing account's (possibly rotated) password.
    update: {},
    create: {
      email,
      passwordHash,
      displayName,
      role: Role.ADMIN,
      // Force a password change on first login of the seeded default credentials.
      mustChangePw: true,
    },
  });

  // Confirmation only — the email is not a secret; the password is never logged.
  console.log(`Seeded initial admin account for ${email}.`);
}

async function main(): Promise<void> {
  await seedSettings();
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
