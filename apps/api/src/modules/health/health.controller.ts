import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';

@Controller()
export class HealthController {
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  apiInfo() {
    return {
      name: 'AutoApply API',
      status: 'ok',
      version: '0.1.0',
      health: '/v1/health',
      readiness: '/v1/health/ready',
      liveness: '/v1/health/live',
    };
  }

  @Get('health')
  @Public()
  @HttpCode(HttpStatus.OK)
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  }

  @Get('health/ready')
  @Public()
  @HttpCode(HttpStatus.OK)
  readiness() {
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/live')
  @Public()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  }
}
