import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './core/config/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  app.enableShutdownHooks();
  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
  new Logger('Bootstrap').log(`Backend listening on port ${port}`);
}
void bootstrap().catch(() => {
  new Logger('Bootstrap').error(
    'Backend startup failed. Check service connectivity and environment configuration.',
  );
  process.exitCode = 1;
});
