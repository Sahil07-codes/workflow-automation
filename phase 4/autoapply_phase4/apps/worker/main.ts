import { PrismaClient } from '@prisma/client';
import { createDiscoveryProcessor } from './src/processors/discovery.processor';
import { createDiscoverySweepScheduler } from './src/scheduler/discovery-sweep.scheduler';
import { createDiscoveryQueue } from './src/queues/discovery.queue';

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const sweepInterval = parseInt(process.env.DISCOVERY_SWEEP_INTERVAL_HOURS || '4', 10);

/**
 * Start discovery worker and scheduler
 * Processes jobs from discovery queue and periodically triggers sweeps
 */
async function main() {
  console.log('🚀 Starting AutoApply Phase 4 Worker...\n');

  try {
    // Initialize processor
    console.log('📦 Starting discovery processor...');
    const processor = createDiscoveryProcessor(redisUrl, prisma, 5);
    await processor.start();

    // Initialize scheduler
    console.log(`⏰ Starting discovery scheduler (sweep every ${sweepInterval}h)...\n`);
    const scheduler = createDiscoverySweepScheduler(redisUrl, prisma, sweepInterval);
    await scheduler.start();

    // Print status
    const stats = await scheduler.getStats();
    console.log('✅ Worker ready\n');
    console.log('📊 Status:');
    console.log(`   Scheduler running: ${stats.isRunning}`);
    console.log(`   Next sweep: ${stats.nextSweep?.toISOString()}`);

    // Graceful shutdown
    const handleShutdown = async (signal: string) => {
      console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
      await processor.stop();
      await scheduler.stop();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error) {
    console.error('❌ Worker startup failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
