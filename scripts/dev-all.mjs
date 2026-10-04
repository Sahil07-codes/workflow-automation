import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();
const apiEnvPath = resolve(root, 'apps/api/.env');

if (!existsSync(apiEnvPath)) {
  console.error(
    'Local API settings are missing. Copy .env.example to apps/api/.env, add a valid local JWT key pair, then run pnpm run dev:all again.',
  );
  process.exit(1);
}

const apiEnv = readEnvFile(apiEnvPath);
const envValue = (key) => process.env[key] ?? apiEnv[key];
const nodeEnvironment = envValue('NODE_ENV') ?? 'development';
if (nodeEnvironment === 'production') {
  console.error('The local launcher refuses to run with NODE_ENV=production.');
  process.exit(1);
}

assertLocalService('DATABASE_URL', envValue('DATABASE_URL'), ['postgres:', 'postgresql:']);
assertLocalService('REDIS_URL', envValue('REDIS_URL'), ['redis:', 'rediss:']);
assertLocalService('S3_ENDPOINT', envValue('S3_ENDPOINT'), ['http:']);

process.env.VITE_API_BASE_URL ??= 'http://localhost:3000/v1';

await run('docker compose up -d --wait');
await run('pnpm --filter @autoapply/api exec prisma migrate deploy --schema prisma/schema.prisma');

console.log('\nLocal AutoApply services are starting:');
console.log('  Customer app: http://localhost:5173');
console.log('  Admin app:    http://localhost:5180');
console.log('  API:          http://localhost:3000/v1');
console.log('\nPress Ctrl+C to stop the app processes. Docker services remain running.\n');

await run(
  'pnpm exec concurrently --kill-others --names "API,Worker,Client,Admin" --prefix-colors "blue,magenta,green,yellow" ' +
    '"pnpm --filter @autoapply/api dev" ' +
    '"pnpm --filter @autoapply/worker dev" ' +
    '"npm --prefix frontend run dev" ' +
    '"npm --prefix frontend/admin-console run dev"',
);

function readEnvFile(filePath) {
  const values = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match || match[2].startsWith('#')) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function assertLocalService(name, value, allowedProtocols) {
  if (!value) {
    console.error(`${name} is missing from apps/api/.env.`);
    process.exit(1);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    console.error(`${name} must be a valid local service URL.`);
    process.exit(1);
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!allowedProtocols.includes(url.protocol) || !localHosts.has(url.hostname)) {
    console.error(
      `${name} must point to a local service. The local launcher will not migrate or connect to a remote service.`,
    );
    process.exit(1);
  }
}

function run(command) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, {
      cwd: root,
      env: process.env,
      shell: true,
      stdio: 'inherit',
    });
    child.once('error', rejectRun);
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(
          new Error(
            `Command failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}: ${command}`,
          ),
        );
      }
    });
  });
}
