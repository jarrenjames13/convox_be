import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { HttpExceptionFilter } from '../common/http-exception.filter';

/** Shared bootstrap settings used by the real server and HTTP E2E tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const origins = (
    config.get<string>('CORS_ORIGINS') ?? 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  process.env.CORS_ORIGINS = origins.join(',');
  app.use(helmet());
  app.enableCors({ origin: origins, credentials: true });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  if (config.get<string>('NODE_ENV') !== 'production') {
    const document = new DocumentBuilder()
      .setTitle('Convox Backend API')
      .setDescription('Convox Messenger conversation API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, document),
      { useGlobalPrefix: true },
    );
  }
}
