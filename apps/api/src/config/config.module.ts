import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from './env';

/** Typed accessor over validated environment variables. */
export class AppConfig {
  constructor(private readonly env: Env) {}
  get<K extends keyof Env>(key: K): Env[K] {
    return this.env[key];
  }
  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }
}

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true })],
  providers: [
    {
      provide: AppConfig,
      // NestConfigModule has already loaded .env into process.env and validated it.
      inject: [ConfigService],
      useFactory: () => new AppConfig(validateEnv(process.env)),
    },
  ],
  exports: [AppConfig],
})
export class ConfigModule {}
