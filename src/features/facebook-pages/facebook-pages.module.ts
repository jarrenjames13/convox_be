import { Module } from '@nestjs/common';
import { FACEBOOK_PAGE_CREDENTIAL_PROVIDER } from './application/facebook-page-credentials.port';
import { FacebookPagesService } from './application/facebook-pages.service';
import { PAGES_REPOSITORY } from './application/pages-repository.port';
import { EnvFacebookPageCredentialProvider } from './infrastructure/adapters/env-facebook-page-credential.provider';
import { PrismaPagesRepository } from './infrastructure/persistence/prisma-pages.repository';
import { FacebookPagesController } from './presentation/http/facebook-pages.controller';

@Module({
  controllers: [FacebookPagesController],
  providers: [
    FacebookPagesService,
    PrismaPagesRepository,
    EnvFacebookPageCredentialProvider,
    { provide: PAGES_REPOSITORY, useExisting: PrismaPagesRepository },
    {
      provide: FACEBOOK_PAGE_CREDENTIAL_PROVIDER,
      useExisting: EnvFacebookPageCredentialProvider,
    },
  ],
  exports: [FacebookPagesService, FACEBOOK_PAGE_CREDENTIAL_PROVIDER],
})
export class FacebookPagesModule {}
