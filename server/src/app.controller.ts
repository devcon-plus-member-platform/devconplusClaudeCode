import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Root landing route — served at `/` (excluded from the /api prefix in main.ts). */
  @Get()
  root(): { name: string; status: string; health: string } {
    return {
      name: this.appService.getHello(),
      status: 'ok',
      health: '/api/health',
    };
  }

  /** Liveness probe for CloudWatch / nginx upstream health checks. */
  @Get('health')
  health(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
