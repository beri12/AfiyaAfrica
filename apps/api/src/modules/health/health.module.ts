import { Controller, Get, HttpStatus, Inject, Module, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { Public } from '../../common/decorators/access';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REDIS } from '../redis/redis.module';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. */
  @Get()
  @Public()
  live() {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: dependencies reachable. Returns 503 when not ready. */
  @Get('ready')
  @Public()
  async ready(@Res({ passthrough: true }) res: Response) {
    const check = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return 'up' as const;
      } catch {
        return 'down' as const;
      }
    };
    const [database, redis] = await Promise.all([
      check(() => this.prisma.$queryRaw`SELECT 1`),
      check(() => this.redis.ping()),
    ]);
    const ok = database === 'up' && redis === 'up';
    if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status: ok ? 'ready' : 'degraded', checks: { database, redis } };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
