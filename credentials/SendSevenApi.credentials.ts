import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

/**
 * SendSeven API Key Credentials
 *
 * Simple API key authentication for SendSeven.
 * API keys can be created at https://app.sendseven.com/settings/api-tokens
 *
 * Token format: s7_<32_hex_chars> (also supports legacy msgapi_ prefix)
 */
export class SendSevenApi implements ICredentialType {
	name = 'sendSevenApi';
	displayName = 'SendSeven API';
	documentationUrl = 'https://sendseven.com/docs/api/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Your SendSeven API token. Create one at Settings > API Tokens in your SendSeven account.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.sendseven.com/api/v1',
			url: '/oauth-apps/userinfo',
			method: 'GET',
		},
	};
}
