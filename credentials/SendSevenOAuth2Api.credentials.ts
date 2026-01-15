import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * SendSeven OAuth2 Credentials
 *
 * OAuth2 authentication for SendSeven.
 * Provides secure, token-based access with automatic refresh.
 *
 * Scopes available:
 * - messages:read, messages:send
 * - conversations:read, conversations:write
 * - contacts:read, contacts:create, contacts:write, contacts:delete
 * - tags:read, tags:write
 * - webhooks:read, webhooks:write
 * - channels:read
 */
export class SendSevenOAuth2Api implements ICredentialType {
	name = 'sendSevenOAuth2Api';
	displayName = 'SendSeven OAuth2 API';
	documentationUrl = 'https://sendseven.com/docs/api/oauth2';
	extends = ['oAuth2Api'];

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'authorizationCode',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: 'https://app.sendseven.com/oauth/consent',
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: 'https://api.sendseven.com/api/v1/oauth-apps/token',
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: 'messages:read messages:send conversations:read conversations:write contacts:read contacts:create contacts:write tags:read webhooks:read webhooks:write channels:read',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'body',
		},
	];
}
