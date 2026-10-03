/**
 * AutoApply background workers
 */

import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'path';
import { createDiscoveryProcessor, DiscoveryProcessor } from './processors/discovery.processor';
import { createDiscoverySweepScheduler, DiscoverySweepScheduler } from './scheduler/discovery-sweep.scheduler';
import { ApplicationWorkers, createApplicationWorkers } from './processors/application.processor';

const projectRoot = resolve(__dirname, '../../../');
loadEnv({ path: resolve(projectRoot, 'apps/api/.env') });
loadEnv({ path: resolve(projectRoot, '.env') });

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const prisma = new PrismaClient();
let processor: DiscoveryProcessor | undefined;
let scheduler: DiscoverySweepScheduler | undefined;
let applicationWorkers: ApplicationWorkers | undefined;
let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.allSettled([
    processor?.stop(),
    scheduler?.stop(),
    applicationWorkers?.stop(),
  ]);
  await prisma.$disconnect();
}

async function bootstrap() {
  console.log('AutoApply discovery worker starting...');
  try {
    await prisma.$connect();
    processor = createDiscoveryProcessor(redisUrl, prisma);
    await processor.start();
    scheduler = createDiscoverySweepScheduler(redisUrl);
    await scheduler.start();
    applicationWorkers = createApplicationWorkers(redisUrl, prisma);
    await applicationWorkers.start();
    console.log('Discovery and application workers are running');
  } catch (error) {
    console.error('Discovery worker startup failed:', error);
    await shutdown();
    process.exitCode = 1;
  }
}

process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

bootstrap();
