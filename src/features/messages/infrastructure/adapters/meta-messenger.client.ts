import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import { ApplicationException } from '../../../../core/common/application.exception';
import { FACEBOOK_PAGE_CREDENTIAL_PROVIDER } from '../../../facebook-pages/application/facebook-page-credentials.port';
import type { FacebookPageCredentialProvider } from '../../../facebook-pages/application/facebook-page-credentials.port';
import type {
  MessengerClient,
  SendTextMessageInput,
  SendTextMessageResult,
} from '../../application/messenger-client.port';

@Injectable()
export class MetaMessengerClient implements MessengerClient {
  constructor(
    @Inject(FACEBOOK_PAGE_CREDENTIAL_PROVIDER)
    private readonly credentials: FacebookPageCredentialProvider,
  ) {}

  async sendTextMessage(
    input: SendTextMessageInput,
  ): Promise<SendTextMessageResult> {
    const credentials = await this.credentials.getCredentials(input.metaPageId);
    try {
      const response = await axios.post<{
        recipient_id?: string;
        message_id?: string;
      }>(
        `https://graph.facebook.com/${credentials.graphApiVersion}/${credentials.metaPageId}/messages`,
        {
          recipient: { id: input.recipientPsid },
          messaging_type: 'RESPONSE',
          message: { text: input.text },
        },
        { params: { access_token: credentials.accessToken }, timeout: 10_000 },
      );
      if (!response.data.message_id)
        throw new Error('Meta did not return a message id.');
      return {
        recipientId: response.data.recipient_id ?? input.recipientPsid,
        messageId: response.data.message_id,
      };
    } catch {
      throw new ApplicationException(
        'FACEBOOK_SEND_FAILED',
        'Facebook Messenger could not send the reply.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
