import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 4000;

  await app.listen(port);
  console.log(`Backend listening on http://localhost:${port}`);
}

void bootstrap();
