export const FACEBOOK_PAGE_CREDENTIAL_PROVIDER = Symbol(
  'FACEBOOK_PAGE_CREDENTIAL_PROVIDER',
);

export interface FacebookPageCredentials {
  metaPageId: string;
  accessToken: string;
  graphApiVersion: string;
}

export interface FacebookPageCredentialProvider {
  getCredentials(metaPageId: string): Promise<FacebookPageCredentials>;
}
