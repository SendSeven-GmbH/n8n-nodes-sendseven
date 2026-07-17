import type { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

/**
 * SendSeven OAuth2 Credentials
 *
 * OAuth2 authentication for SendSeven.
 * Provides secure, token-based access with automatic refresh.
 *
 * Scopes available:
 * - messages:read, messages:create
 * - conversations:read, conversations:update
 * - contacts:read, contacts:create, contacts:update
 * - tags:read
 * - webhooks:create, webhooks:read, webhooks:delete
 * - channels:read
 * - knowledge_base:read
 * - team:read
 */
export class SendSevenOAuth2Api implements ICredentialType {
	name = 'sendSevenOAuth2Api';
	displayName = 'SendSeven OAuth2 API';
	documentationUrl = 'https://docs.sendseven.com/guides/integrations/n8n';
	icon: Icon = 'file:../nodes/SendSeven/sendseven.svg';
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
			default: 'messages:read messages:create conversations:read conversations:update contacts:read contacts:create contacts:update tags:read webhooks:create webhooks:read webhooks:delete channels:read knowledge_base:read team:read',
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
