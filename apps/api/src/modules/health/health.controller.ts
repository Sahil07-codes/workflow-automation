import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '@/common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  health() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
    };
  }

  @Get('ready')
  @Public()
  @HttpCode(HttpStatus.OK)
  readiness() {
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  @Public()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return {
      alive: true,
      timestamp: new Date().toISOString(),
    };
  }
}
