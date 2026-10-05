import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApplicationException } from '../../../../core/common/application.exception';
import {
  FacebookPageCredentialProvider,
  FacebookPageCredentials,
} from '../../application/facebook-page-credentials.port';

@Injectable()
export class EnvFacebookPageCredentialProvider implements FacebookPageCredentialProvider {
  constructor(private readonly config: ConfigService) {}

  getCredentials(metaPageId: string): Promise<FacebookPageCredentials> {
    const configuredPageId = this.config.get<string>('META_PAGE_ID')?.trim();
    const accessToken = this.config
      .get<string>('META_PAGE_ACCESS_TOKEN')
      ?.trim();
    if (!configuredPageId || !accessToken || metaPageId !== configuredPageId) {
      throw new ApplicationException(
        'FACEBOOK_PAGE_NOT_CONFIGURED',
        'Facebook Page credentials are not configured for this Page.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return Promise.resolve({
      metaPageId: configuredPageId,
      accessToken,
      graphApiVersion:
        this.config.get<string>('META_GRAPH_API_VERSION') ?? 'v26.0',
    });
  }
}
