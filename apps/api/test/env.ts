// Loaded before each integration test file. Uses a dedicated test database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://afyalink:afyalink_dev@localhost:5432/afyalink_test?schema=public';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-definitely-long-enough-123';
process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.COOKIE_SECURE = 'false';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.WORKERS_ENABLED = 'false';
process.env.AI_BASE_URL = '';
process.env.AI_API_KEY = '';
process.env.AI_MODEL = '';
process.env.SMTP_HOST = '';
process.env.SMS_PROVIDER = '';
