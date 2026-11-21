import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

export default function globalSetup(): void {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgresql://afyalink:afyalink_dev@localhost:5432/afyalink_test?schema=public';
  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
