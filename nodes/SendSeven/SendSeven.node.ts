import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	sendSevenApiRequest,
	sendSevenApiRequestAllItems,
	sendSevenApiRequestFormData,
	validateRequiredFields,
	formatContactResponse,
	formatConversationResponse,
	formatMessageResponse,
	CHANNEL_TYPES,
	CONVERSATION_STATUSES,
} from './GenericFunctions';

/**
 * SendSeven n8n Node
 *
 * Provides actions for SendSeven - a unified messaging API platform
 * enabling multi-channel messaging (WhatsApp, Telegram, SMS, Email, etc.)
 *
 * Actions:
 * - Send Message (3 addressing modes: recipient+channel, conversation_id, contact+channel; optional attachment UUIDs)
 * - Create Contact (with contact_methods support)
 * - Update Contact (name, email, phone, avatar_url only)
 * - Delete Contact (GDPR delete)
 * - Add Tag / Remove Tag to/from Contact
 * - Set Custom Field on Contact (two-step: GET /custom-fields -> POST /contacts/{id}/fields/{field_id})
 * - Add Method / Delete Method on Contact (platform IDs via /contacts/{id}/methods)
 * - Search Contacts
 * - Search Conversations
 * - Get Conversation
 * - Close Conversation (POST with notes/summarize)
 * - Assign Conversation (POST with user_id in URL)
 * - Send WhatsApp Template
 * - Upload Attachment (binary input -> multipart) / Upload Attachment from URL
 */
export class SendSeven implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SendSeven',
		name: 'sendSeven',
		icon: 'file:sendseven.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send messages, manage contacts, and handle conversations via SendSeven',
		defaults: {
			name: 'SendSeven',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'sendSevenApi',
				required: false,
				displayOptions: {
					show: {
						authentication: ['apiKey'],
					},
				},
			},
			{
				name: 'sendSevenOAuth2Api',
				required: false,
				displayOptions: {
					show: {
						authentication: ['oAuth2'],
					},
				},
			},
		],
		properties: [
			// Authentication type selector
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: [
					{
						name: 'API Key',
						value: 'apiKey',
					},
					{
						name: 'OAuth2',
						value: 'oAuth2',
					},
				],
				default: 'apiKey',
			},
			// Resource selector
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Message',
						value: 'message',
					},
					{
						name: 'Contact',
						value: 'contact',
					},
					{
						name: 'Conversation',
						value: 'conversation',
					},
					{
						name: 'WhatsApp Template',
						value: 'whatsappTemplate',
					},
					{
						name: 'Attachment',
						value: 'attachment',
					},
				],
				default: 'message',
			},
			// Message operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['message'],
					},
				},
				options: [
					{
						name: 'Send',
						value: 'send',
						description: 'Send a message through a channel',
						action: 'Send a message',
					},
				],
				default: 'send',
			},
			// Contact operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['contact'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						description: 'Create a new contact',
						action: 'Create a contact',
					},
					{
						name: 'Update',
						value: 'update',
						description: 'Update an existing contact',
						action: 'Update a contact',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Get a contact by ID',
						action: 'Get a contact',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Search for contacts',
						action: 'Search contacts',
					},
					{
						name: 'Delete',
						value: 'delete',
						description: 'Delete a contact (GDPR delete)',
						action: 'Delete a contact',
					},
					{
						name: 'Add Tag',
						value: 'addTag',
						description: 'Add a tag to a contact',
						action: 'Add tag to contact',
					},
					{
						name: 'Remove Tag',
						value: 'removeTag',
						description: 'Remove a tag from a contact',
						action: 'Remove tag from contact',
					},
					{
						name: 'Set Custom Field',
						value: 'setCustomField',
						description: 'Set a custom field value on a contact',
						action: 'Set custom field on contact',
					},
					{
						name: 'Add Method',
						value: 'addMethod',
						description: 'Add a contact method (platform ID) to a contact',
						action: 'Add method to contact',
					},
					{
						name: 'Delete Method',
						value: 'deleteMethod',
						description: 'Delete a contact method from a contact',
						action: 'Delete method from contact',
					},
				],
				default: 'create',
			},
			// Conversation operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['conversation'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Get a conversation by ID',
						action: 'Get a conversation',
					},
					{
						name: 'Search',
						value: 'search',
						description: 'Search for conversations',
						action: 'Search conversations',
					},
					{
						name: 'Close',
						value: 'close',
						description: 'Close a conversation',
						action: 'Close a conversation',
					},
					{
						name: 'Assign',
						value: 'assign',
						description: 'Assign a conversation to a user',
						action: 'Assign a conversation',
					},
				],
				default: 'get',
			},
			// WhatsApp Template operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
					},
				},
				options: [
					{
						name: 'Send',
						value: 'send',
						description: 'Send a WhatsApp template message',
						action: 'Send WhatsApp template',
					},
					{
						name: 'List',
						value: 'list',
						description: 'List available WhatsApp templates',
						action: 'List WhatsApp templates',
					},
				],
				default: 'send',
			},
			// Attachment operations
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['attachment'],
					},
				},
				options: [
					{
						name: 'Upload',
						value: 'upload',
						description: 'Upload a binary file as an attachment',
						action: 'Upload an attachment',
					},
					{
						name: 'Upload from URL',
						value: 'uploadFromUrl',
						description: 'Fetch a public URL and store it as an attachment',
						action: 'Upload an attachment from URL',
					},
				],
				default: 'upload',
			},

			// ==================== MESSAGE FIELDS ====================
			{
				displayName: 'Addressing Mode',
				name: 'addressingMode',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
					},
				},
				options: [
					{
						name: 'Recipient + Channel',
						value: 'recipientChannel',
						description: 'Send to a recipient identifier via a specific channel',
					},
					{
						name: 'Conversation ID',
						value: 'conversationId',
						description: 'Reply to an existing conversation',
					},
					{
						name: 'Contact ID + Channel',
						value: 'contactChannel',
						description: 'Send to a contact via a specific channel',
					},
				],
				default: 'recipientChannel',
				description: 'How to address the message recipient',
			},
			{
				displayName: 'Channel',
				name: 'channelId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getChannels',
				},
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
						addressingMode: ['recipientChannel', 'contactChannel'],
					},
				},
				default: '',
				required: true,
				description: 'Select the messaging channel (WhatsApp, Telegram, SMS, etc.)',
			},
			{
				displayName: 'Recipient',
				name: 'to',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
						addressingMode: ['recipientChannel'],
					},
				},
				default: '',
				required: true,
				description: 'Recipient identifier (phone number for WhatsApp/SMS, email for Email)',
				placeholder: '+1234567890',
			},
			{
				displayName: 'Conversation ID',
				name: 'messageConversationId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
						addressingMode: ['conversationId'],
					},
				},
				default: '',
				required: true,
				description: 'The conversation ID to reply to (recipient is resolved automatically)',
			},
			{
				displayName: 'Contact ID',
				name: 'messageContactId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
						addressingMode: ['contactChannel'],
					},
				},
				default: '',
				required: true,
				description: 'The contact ID to send the message to',
			},
			{
				displayName: 'Message Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
					},
				},
				default: '',
				required: true,
				description: 'The message content to send',
			},
			{
				displayName: 'Attachment IDs',
				name: 'attachments',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['message'],
						operation: ['send'],
					},
				},
				default: '',
				description:
					'Comma-separated attachment UUIDs (from the Attachment resource). Each must be a valid attachment ID, not a raw URL.',
				placeholder: '550e8400-e29b-41d4-a716-446655440000, ...',
			},

			// ==================== CONTACT FIELDS ====================
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: [
							'get',
							'update',
							'delete',
							'addTag',
							'removeTag',
							'setCustomField',
							'addMethod',
							'deleteMethod',
						],
					},
				},
				default: '',
				required: true,
				description: 'The unique ID of the contact',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update'],
					},
				},
				default: '',
				description: 'Full name of the contact',
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update', 'search'],
					},
				},
				default: '',
				description: 'Email address of the contact',
				placeholder: 'john@example.com',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create', 'update', 'search'],
					},
				},
				default: '',
				description: 'Phone number in international format',
				placeholder: '+1234567890',
			},
			{
				displayName: 'Search Query',
				name: 'searchQuery',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['search'],
					},
				},
				default: '',
				description: 'Search contacts by name',
			},
			{
				displayName: 'Tag',
				name: 'tagId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTags',
				},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['addTag', 'removeTag'],
					},
				},
				default: '',
				required: true,
				description: 'Select the tag to add to or remove from the contact',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Contact Methods',
						name: 'contactMethods',
						type: 'json',
						default: '[]',
						description: 'Contact methods as JSON array, e.g. [{"method_type": "whatsapp_id", "value": "1234567890"}]',
					},
				],
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFieldsUpdate',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['update'],
					},
				},
				options: [
					{
						displayName: 'Avatar URL',
						name: 'avatarUrl',
						type: 'string',
						default: '',
						description: 'URL of the contact avatar image',
					},
				],
			},
			// ---- Set Custom Field ----
			{
				displayName: 'Custom Field',
				name: 'customFieldId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCustomFields',
				},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['setCustomField'],
					},
				},
				default: '',
				required: true,
				description: 'Select the custom field definition to set',
			},
			{
				displayName: 'Value',
				name: 'customFieldValue',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['setCustomField'],
					},
				},
				default: '',
				description: 'The value to set for the custom field (type depends on the field definition)',
			},
			// ---- Add Method ----
			{
				displayName: 'Method Type',
				name: 'methodType',
				type: 'options',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['addMethod'],
					},
				},
				options: [
					{ name: 'Phone', value: 'phone' },
					{ name: 'Email', value: 'email' },
					{ name: 'WhatsApp ID', value: 'whatsapp_id' },
					{ name: 'Telegram ID', value: 'telegram_id' },
					{ name: 'Messenger ID', value: 'messenger_id' },
					{ name: 'Instagram ID', value: 'instagram_id' },
				],
				default: 'phone',
				required: true,
				description: 'The type of contact method to add',
			},
			{
				displayName: 'Value',
				name: 'methodValue',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['addMethod'],
					},
				},
				default: '',
				required: true,
				description: 'The method value (phone number, email, or platform ID)',
			},
			{
				displayName: 'Channel',
				name: 'methodChannelId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getChannels',
				},
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['addMethod'],
						methodType: ['messenger_id', 'instagram_id'],
					},
				},
				default: '',
				required: true,
				description: 'Channel this page-scoped method belongs to (required for Messenger/Instagram IDs)',
			},
			// ---- Delete Method ----
			{
				displayName: 'Method ID',
				name: 'methodId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['deleteMethod'],
					},
				},
				default: '',
				required: true,
				description: 'The unique ID of the contact method to delete',
			},

			// ==================== CONVERSATION FIELDS ====================
			{
				displayName: 'Conversation ID',
				name: 'conversationId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['get', 'close', 'assign'],
					},
				},
				default: '',
				required: true,
				description: 'The unique ID of the conversation',
			},
			{
				displayName: 'User',
				name: 'userId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getUsers',
				},
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['assign'],
					},
				},
				default: '',
				required: true,
				description: 'Select the user to assign the conversation to',
			},
			{
				displayName: 'Close Options',
				name: 'closeOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['close'],
					},
				},
				options: [
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						typeOptions: {
							rows: 3,
						},
						default: '',
						description: 'Optional closure notes',
					},
					{
						displayName: 'Summarize',
						name: 'summarize',
						type: 'boolean',
						default: false,
						description: 'Whether to generate an AI summary of the conversation',
					},
				],
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['conversation'],
						operation: ['search'],
					},
				},
				options: [
					{
						displayName: 'Contact ID',
						name: 'contactId',
						type: 'string',
						default: '',
						description: 'Filter by contact ID',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: CONVERSATION_STATUSES,
						default: '',
						description: 'Filter by conversation status',
					},
					{
						displayName: 'Channel Type',
						name: 'channelType',
						type: 'options',
						options: CHANNEL_TYPES,
						default: '',
						description: 'Filter by channel type',
					},
					{
						displayName: 'Needs Reply',
						name: 'needsReply',
						type: 'boolean',
						default: false,
						description: 'Whether to filter for conversations that need a reply',
					},
				],
			},

			// ==================== WHATSAPP TEMPLATE FIELDS ====================
			{
				displayName: 'WhatsApp Channel',
				name: 'waChannelId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getWhatsAppChannels',
				},
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
						operation: ['send', 'list'],
					},
				},
				default: '',
				required: true,
				description: 'Select the WhatsApp Business channel',
			},
			{
				displayName: 'Contact ID',
				name: 'templateContactId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
						operation: ['send'],
					},
				},
				default: '',
				required: false,
				description:
					'The contact to send the template to (uses its first WhatsApp method, phone as fallback). Optional: provide at least ONE recipient — Contact ID, WhatsApp ID, Contact Method ID (in Additional Options), or Conversation ID (in Additional Options). Use the Contact resource Search/Create to obtain an ID.',
			},
			{
				displayName: 'WhatsApp ID',
				name: 'templateWhatsappId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
						operation: ['send'],
					},
				},
				default: '',
				description:
					'Send straight to a phone number (without a leading "+", which is stripped automatically) OR an alphanumeric WhatsApp ID. An existing contact is matched, or a new one is created. Great for stateless integrations. Alternative to Contact ID.',
			},
			{
				displayName: 'Template',
				name: 'templateName',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getWhatsAppTemplates',
					loadOptionsDependsOn: ['waChannelId'],
				},
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
						operation: ['send'],
					},
				},
				default: '',
				required: true,
				description: 'Select the WhatsApp template to send',
			},
			{
				displayName: 'Template Variables',
				name: 'templateVariables',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
						operation: ['send'],
					},
				},
				default: {},
				placeholder: 'Add Variable',
				description:
					'Positional template variable values ({{1}}, {{2}}, ...). Sent in order as variable_values. For NAMED templates, use the Additional Options -> Variable Values (JSON) field instead.',
				options: [
					{
						name: 'variables',
						displayName: 'Variables',
						values: [
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description: 'Variable value',
							},
						],
					},
				],
			},
			{
				displayName: 'Additional Options',
				name: 'templateAdditionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
						operation: ['send'],
					},
				},
				options: [
					{
						displayName: 'Channel ID',
						name: 'channelId',
						type: 'string',
						default: '',
						description:
							'Disambiguates a template referenced by NAME when it exists on multiple channels; also selects the sending channel when only a WhatsApp ID is given. Must not conflict with the template\'s own channel (the API rejects a mismatch). Leave empty to let the first matching channel win.',
					},
					{
						displayName: 'Contact Method ID',
						name: 'contactMethodId',
						type: 'string',
						default: '',
						description:
							'Target a SPECIFIC WhatsApp number when a contact has several. Must be a whatsapp_id-type contact method. Pins both the recipient number and its contact; if Contact ID is also set it must name the same contact. Alternative to Contact ID / WhatsApp ID.',
					},
					{
						displayName: 'Conversation ID',
						name: 'conversationId',
						type: 'string',
						default: '',
						description:
							'Send within an existing WhatsApp conversation (must be a WhatsApp conversation). Alternative to the other recipient fields.',
					},
					{
						displayName: 'Header Document Filename',
						name: 'headerDocumentFilename',
						type: 'string',
						default: '',
						description:
							'Filename shown to the recipient for DOCUMENT-header templates (e.g. "invoice.pdf"). Used together with Header Media URL.',
					},
					{
						displayName: 'Header Media URL',
						name: 'headerMediaUrl',
						type: 'string',
						default: '',
						description:
							'Header media for IMAGE/VIDEO/DOCUMENT templates. Accepts an attachment ID (UUID) or an https URL.',
					},
					{
						displayName: 'Language',
						name: 'language',
						type: 'string',
						default: '',
						description:
							'Meta language/locale code (e.g. en, de, en_US, pt_BR). Needed only when a template NAME exists in multiple languages. If omitted, the API auto-resolves from the recipient contact\'s preferred language and errors if it cannot.',
					},
					{
						displayName: 'Variable Values (JSON)',
						name: 'variableValuesJson',
						type: 'json',
						default: '',
						description:
							'Advanced: override variable_values with a raw JSON object for NAMED templates, e.g. {"first_name": "John"}. Takes precedence over the positional Template Variables above.',
					},
				],
			},

			// ==================== ATTACHMENT FIELDS ====================
			{
				displayName: 'Input Binary Field',
				name: 'binaryPropertyName',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['attachment'],
						operation: ['upload'],
					},
				},
				default: 'data',
				required: true,
				description: 'Name of the binary property containing the file to upload',
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['attachment'],
						operation: ['uploadFromUrl'],
					},
				},
				default: '',
				required: true,
				description:
					'Public http(s) URL to fetch. Allowed types are stricter than direct upload (images, mp4/mov/webm, common audio, pdf).',
				placeholder: 'https://example.com/file.pdf',
			},
			{
				displayName: 'Additional Fields',
				name: 'attachmentAdditionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['attachment'],
						operation: ['upload', 'uploadFromUrl'],
					},
				},
				options: [
					{
						displayName: 'Filename',
						name: 'filename',
						type: 'string',
						default: '',
						description: 'Override the filename for the stored attachment',
					},
					{
						displayName: 'Message ID',
						name: 'messageId',
						type: 'string',
						default: '',
						description: 'Optional message ID to associate the upload with (upload only)',
						displayOptions: {
							show: {
								'/operation': ['upload'],
							},
						},
					},
				],
			},

			// ==================== OPTIONS ====================
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				displayOptions: {
					show: {
						resource: ['contact', 'conversation', 'whatsappTemplate'],
						operation: ['search', 'list'],
					},
				},
				default: false,
				description: 'Whether to return all results or only up to a limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				displayOptions: {
					show: {
						resource: ['contact', 'conversation', 'whatsappTemplate'],
						operation: ['search', 'list'],
						returnAll: [false],
					},
				},
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				default: 50,
				description: 'Max number of results to return',
			},
		],
	};

	methods = {
		loadOptions: {
			/**
			 * Get all channels for dropdown
			 */
			async getChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const channels = await sendSevenApiRequestAllItems.call(this, '/channels');
				return channels.map((channel) => ({
					name: (channel.name as string) || `${channel.channel_type} - ${channel.identifier || channel.id}`,
					value: channel.id as string,
				}));
			},

			/**
			 * Get WhatsApp channels only
			 */
			async getWhatsAppChannels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const channels = await sendSevenApiRequestAllItems.call(this, '/channels');
				return channels
					.filter((c) => c.channel_type === 'whatsapp')
					.map((channel) => ({
						name: (channel.name as string) || `WhatsApp - ${channel.identifier || channel.id}`,
						value: channel.id as string,
					}));
			},

			/**
			 * Get tags for dropdown
			 */
			async getTags(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const tags = await sendSevenApiRequestAllItems.call(this, '/tags');
				return tags.map((tag) => ({
					name: tag.name as string,
					value: tag.id as string,
				}));
			},

			/**
			 * Get custom field definitions for dropdown
			 */
			async getCustomFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const fields = await sendSevenApiRequestAllItems.call(this, '/custom-fields');
				return fields.map((field) => ({
					name: `${field.name as string} (${field.key as string})`,
					value: field.id as string,
				}));
			},

			/**
			 * Get users for assignment dropdown
			 */
			async getUsers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const users = await sendSevenApiRequestAllItems.call(this, '/users');
				return users.map((user) => ({
					name: `${user.name || user.email}`,
					value: user.id as string,
				}));
			},

			/**
			 * Get WhatsApp templates
			 */
			async getWhatsAppTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const channelId = this.getCurrentNodeParameter('waChannelId') as string;
				let endpoint = '/whatsapp-templates';
				if (channelId) {
					endpoint += `?channel_id=${channelId}`;
				}

				const response = await sendSevenApiRequest.call(this, 'GET', endpoint);
				// GET /whatsapp-templates returns { templates, total, channel_id, status_filter }
				const templates = (response as IDataObject).templates as IDataObject[] || response as IDataObject[];

				// Group templates by name, show only approved
				const templateMap = new Map<string, string[]>();
				templates
					.filter((t) => t.status === 'APPROVED')
					.forEach((t) => {
						const name = t.name as string;
						const existing = templateMap.get(name);
						if (existing) {
							existing.push(t.language as string);
						} else {
							templateMap.set(name, [t.language as string]);
						}
					});

				return Array.from(templateMap.entries()).map(([name, languages]) => ({
					name: `${name} (${languages.join(', ')})`,
					value: name,
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject | IDataObject[] = {};

				// ==================== MESSAGE ====================
				if (resource === 'message') {
					if (operation === 'send') {
						const addressingMode = this.getNodeParameter('addressingMode', i, 'recipientChannel') as string;
						const text = this.getNodeParameter('text', i) as string;

						const body: IDataObject = { text };

						const attachmentsRaw = this.getNodeParameter('attachments', i, '') as string;
						if (attachmentsRaw) {
							const attachmentIds = attachmentsRaw
								.split(',')
								.map((id) => id.trim())
								.filter((id) => id.length > 0);
							if (attachmentIds.length > 0) {
								body.attachments = attachmentIds;
							}
						}

						if (addressingMode === 'recipientChannel') {
							const channelId = this.getNodeParameter('channelId', i) as string;
							const to = this.getNodeParameter('to', i) as string;
							validateRequiredFields(this, { channelId, to, text }, ['channelId', 'to', 'text']);
							body.channel_id = channelId;
							body.to = to;
						} else if (addressingMode === 'conversationId') {
							const conversationId = this.getNodeParameter('messageConversationId', i) as string;
							validateRequiredFields(this, { conversationId, text }, ['conversationId', 'text']);
							body.conversation_id = conversationId;
						} else if (addressingMode === 'contactChannel') {
							const channelId = this.getNodeParameter('channelId', i) as string;
							const contactId = this.getNodeParameter('messageContactId', i) as string;
							validateRequiredFields(this, { channelId, contactId, text }, ['channelId', 'contactId', 'text']);
							body.channel_id = channelId;
							body.contact_id = contactId;
						}

						responseData = await sendSevenApiRequest.call(this, 'POST', '/messages', body);
						responseData = formatMessageResponse(responseData as IDataObject);
					}
				}

				// ==================== CONTACT ====================
				else if (resource === 'contact') {
					if (operation === 'create') {
						const email = this.getNodeParameter('email', i, '') as string;
						const phone = this.getNodeParameter('phone', i, '') as string;

						if (!email && !phone) {
							throw new Error('Either email or phone is required to create a contact');
						}

						const body: IDataObject = {};
						const name = this.getNodeParameter('name', i, '') as string;
						if (name) body.name = name;
						if (email) body.email = email;
						if (phone) body.phone = phone;

						const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						if (additionalFields.contactMethods) {
							body.contact_methods = typeof additionalFields.contactMethods === 'string'
								? JSON.parse(additionalFields.contactMethods)
								: additionalFields.contactMethods;
						}
						// NOTE: custom_fields are NOT settable on the contact body (backend silently
						// drops them). Use the dedicated "Set Custom Field" operation instead.

						responseData = await sendSevenApiRequest.call(this, 'POST', '/contacts', body);
						responseData = formatContactResponse(responseData as IDataObject);
					}

					else if (operation === 'update') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						validateRequiredFields(this, { contactId }, ['contactId']);

						const body: IDataObject = {};
						const name = this.getNodeParameter('name', i, '') as string;
						const email = this.getNodeParameter('email', i, '') as string;
						const phone = this.getNodeParameter('phone', i, '') as string;

						if (name) body.name = name;
						if (email) body.email = email;
						if (phone) body.phone = phone;

						const additionalFields = this.getNodeParameter('additionalFieldsUpdate', i, {}) as IDataObject;
						if (additionalFields.avatarUrl) body.avatar_url = additionalFields.avatarUrl;

						responseData = await sendSevenApiRequest.call(this, 'PUT', `/contacts/${contactId}`, body);
						responseData = formatContactResponse(responseData as IDataObject);
					}

					else if (operation === 'get') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						validateRequiredFields(this, { contactId }, ['contactId']);

						responseData = await sendSevenApiRequest.call(this, 'GET', `/contacts/${contactId}`);
						responseData = formatContactResponse(responseData as IDataObject);
					}

					else if (operation === 'search') {
						const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
						const query: IDataObject = {};

						const searchQuery = this.getNodeParameter('searchQuery', i, '') as string;
						const email = this.getNodeParameter('email', i, '') as string;
						const phone = this.getNodeParameter('phone', i, '') as string;

						// GET /contacts supports only a single `search` param (no `email`/`phone`
						// filters — FastAPI silently drops unknown query params). Funnel the most
						// specific value into `search` (precedence: search > email > phone).
						const searchValue = searchQuery || email || phone;
						if (searchValue) query.search = searchValue;

						if (returnAll) {
							responseData = await sendSevenApiRequestAllItems.call(this, '/contacts', query);
						} else {
							const limit = this.getNodeParameter('limit', i, 50) as number;
							query.page_size = limit;
							const response = await sendSevenApiRequest.call(this, 'GET', '/contacts', {}, query);
							responseData = (response as IDataObject).items as IDataObject[] || response;
						}

						responseData = (responseData as IDataObject[]).map(formatContactResponse);
					}

					else if (operation === 'addTag') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						const tagId = this.getNodeParameter('tagId', i) as string;

						validateRequiredFields(this, { contactId, tagId }, ['contactId', 'tagId']);

						responseData = await sendSevenApiRequest.call(
							this,
							'POST',
							`/contacts/${contactId}/tags/${tagId}`,
						);
						responseData = {
							success: true,
							contactId,
							tagId,
							message: 'Tag added successfully',
						};
					}

					else if (operation === 'removeTag') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						const tagId = this.getNodeParameter('tagId', i) as string;

						validateRequiredFields(this, { contactId, tagId }, ['contactId', 'tagId']);

						responseData = await sendSevenApiRequest.call(
							this,
							'DELETE',
							`/contacts/${contactId}/tags/${tagId}`,
						);
						responseData = {
							success: true,
							contactId,
							tagId,
							message: 'Tag removed successfully',
						};
					}

					else if (operation === 'delete') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						validateRequiredFields(this, { contactId }, ['contactId']);

						responseData = await sendSevenApiRequest.call(
							this,
							'DELETE',
							`/contacts/${contactId}`,
						);
					}

					else if (operation === 'setCustomField') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						const fieldId = this.getNodeParameter('customFieldId', i) as string;
						const value = this.getNodeParameter('customFieldValue', i, '') as string;

						validateRequiredFields(this, { contactId, fieldId }, ['contactId', 'fieldId']);

						responseData = await sendSevenApiRequest.call(
							this,
							'POST',
							`/contacts/${contactId}/fields/${fieldId}`,
							{ value },
						);
					}

					else if (operation === 'addMethod') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						const methodType = this.getNodeParameter('methodType', i) as string;
						const value = this.getNodeParameter('methodValue', i) as string;

						validateRequiredFields(
							this,
							{ contactId, methodType, value },
							['contactId', 'methodType', 'value'],
						);

						const body: IDataObject = { method_type: methodType, value };

						if (methodType === 'messenger_id' || methodType === 'instagram_id') {
							const channelId = this.getNodeParameter('methodChannelId', i, '') as string;
							validateRequiredFields(this, { channelId }, ['channelId']);
							body.channel_id = channelId;
						}

						responseData = await sendSevenApiRequest.call(
							this,
							'POST',
							`/contacts/${contactId}/methods`,
							body,
						);
					}

					else if (operation === 'deleteMethod') {
						const contactId = this.getNodeParameter('contactId', i) as string;
						const methodId = this.getNodeParameter('methodId', i) as string;

						validateRequiredFields(this, { contactId, methodId }, ['contactId', 'methodId']);

						responseData = await sendSevenApiRequest.call(
							this,
							'DELETE',
							`/contacts/${contactId}/methods/${methodId}`,
						);
					}
				}

				// ==================== CONVERSATION ====================
				else if (resource === 'conversation') {
					if (operation === 'get') {
						const conversationId = this.getNodeParameter('conversationId', i) as string;
						validateRequiredFields(this, { conversationId }, ['conversationId']);

						responseData = await sendSevenApiRequest.call(this, 'GET', `/conversations/${conversationId}`);
						responseData = formatConversationResponse(responseData as IDataObject);
					}

					else if (operation === 'search') {
						const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
						const query: IDataObject = {};

						if (filters.contactId) query.contact_id = filters.contactId;
						if (filters.status) query.status = filters.status;
						if (filters.needsReply) query.needs_reply = filters.needsReply;
						// NOTE: GET /conversations has NO `channel_type` filter (FastAPI drops
						// unknown query params). When a Channel Type filter is set we fetch and
						// filter client-side below instead of sending a no-op query param.

						if (returnAll) {
							responseData = await sendSevenApiRequestAllItems.call(this, '/conversations', query);
						} else {
							const limit = this.getNodeParameter('limit', i, 50) as number;
							query.page_size = limit;
							const response = await sendSevenApiRequest.call(this, 'GET', '/conversations', {}, query);
							responseData = (response as IDataObject).items as IDataObject[] || response;
						}

						// Client-side channel_type filter (backend cannot filter on it).
						if (filters.channelType) {
							responseData = (responseData as IDataObject[]).filter(
								(c) => c.channel_type === filters.channelType,
							);
						}

						responseData = (responseData as IDataObject[]).map(formatConversationResponse);
					}

					else if (operation === 'close') {
						const conversationId = this.getNodeParameter('conversationId', i) as string;
						validateRequiredFields(this, { conversationId }, ['conversationId']);

						const closeOptions = this.getNodeParameter('closeOptions', i, {}) as IDataObject;
						const body: IDataObject = {};
						if (closeOptions.notes) body.notes = closeOptions.notes;
						if (closeOptions.summarize !== undefined) body.summarize = closeOptions.summarize;

						responseData = await sendSevenApiRequest.call(
							this,
							'POST',
							`/conversations/${conversationId}/close`,
							body,
						);
						responseData = formatConversationResponse(responseData as IDataObject);
					}

					else if (operation === 'assign') {
						const conversationId = this.getNodeParameter('conversationId', i) as string;
						const userId = this.getNodeParameter('userId', i) as string;

						validateRequiredFields(this, { conversationId, userId }, ['conversationId', 'userId']);

						responseData = await sendSevenApiRequest.call(
							this,
							'POST',
							`/conversations/${conversationId}/assign/${userId}`,
						);
						responseData = formatConversationResponse(responseData as IDataObject);
					}
				}

				// ==================== WHATSAPP TEMPLATE ====================
				else if (resource === 'whatsappTemplate') {
					if (operation === 'send') {
						const contactId = this.getNodeParameter('templateContactId', i, '') as string;
						const whatsappId = this.getNodeParameter('templateWhatsappId', i, '') as string;
						const templateName = this.getNodeParameter('templateName', i) as string;
						const variablesData = this.getNodeParameter('templateVariables', i, {}) as IDataObject;
						const additionalOptions = this.getNodeParameter('templateAdditionalOptions', i, {}) as IDataObject;

						const contactMethodId = (additionalOptions.contactMethodId as string) || '';
						const conversationId = (additionalOptions.conversationId as string) || '';

						// Template name/UUID is always required.
						validateRequiredFields(this, { templateName }, ['templateName']);

						// At least ONE recipient must be provided (contact_id is no longer required).
						if (!contactId && !contactMethodId && !whatsappId && !conversationId) {
							throw new NodeOperationError(
								this.getNode(),
								'Provide at least one recipient: Contact, Contact Method ID, WhatsApp ID, or Conversation ID',
								{ itemIndex: i },
							);
						}

						// Build the SendTemplateRequest body.
						// The dedicated send endpoint takes variable_values (List|Dict),
						// NOT the deprecated Meta-style `content` wrapper on POST /messages.
						// Each recipient/selector field is included ONLY when non-empty.
						const body: IDataObject = {};

						if (contactId) {
							body.contact_id = contactId;
						}
						if (contactMethodId) {
							body.contact_method_id = contactMethodId;
						}
						if (whatsappId) {
							body.whatsapp_id = whatsappId;
						}
						if (conversationId) {
							body.conversation_id = conversationId;
						}

						// Optional channel/language selectors for NAME-referenced templates.
						if (additionalOptions.channelId) {
							body.channel_id = additionalOptions.channelId as string;
						}
						if (additionalOptions.language) {
							body.language = additionalOptions.language as string;
						}

						// Positional variables -> ordered list of strings.
						const variables = (variablesData.variables as IDataObject[]) || [];
						if (variables.length > 0) {
							body.variable_values = variables.map((v) => String(v.value));
						}

						// Advanced JSON override (for NAMED templates) wins over positional.
						if (additionalOptions.variableValuesJson) {
							const raw = additionalOptions.variableValuesJson;
							body.variable_values = typeof raw === 'string' ? JSON.parse(raw) : raw;
						}

						if (additionalOptions.headerMediaUrl) {
							body.header_media_url = additionalOptions.headerMediaUrl as string;
						}
						if (additionalOptions.headerDocumentFilename) {
							body.header_document_filename = additionalOptions.headerDocumentFilename as string;
						}

						// Template name (or DB UUID) goes in the path; URL-encode for safety.
						responseData = await sendSevenApiRequest.call(
							this,
							'POST',
							`/whatsapp-templates/${encodeURIComponent(templateName)}/send`,
							body,
						);
						responseData = {
							...(responseData as IDataObject),
							templateName,
							variablesSent: variables.length,
						};
					}

					else if (operation === 'list') {
						const channelId = this.getNodeParameter('waChannelId', i) as string;
						const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;

						let endpoint = '/whatsapp-templates';
						if (channelId) {
							endpoint += `?channel_id=${channelId}`;
						}

						if (returnAll) {
							// GET /whatsapp-templates envelope key is `templates`, not `items`.
							responseData = await sendSevenApiRequestAllItems.call(this, endpoint, {}, 'templates');
						} else {
							const limit = this.getNodeParameter('limit', i, 50) as number;
							const response = await sendSevenApiRequest.call(
								this,
								'GET',
								endpoint,
								{},
								{ page_size: limit },
							);
							responseData = (response as IDataObject).templates as IDataObject[] || response;
						}
					}
				}

				// ==================== ATTACHMENT ====================
				else if (resource === 'attachment') {
					if (operation === 'upload') {
						const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
						const additionalFields = this.getNodeParameter('attachmentAdditionalFields', i, {}) as IDataObject;

						const binaryData = this.helpers.assertBinaryData(i, binaryPropertyName);
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);

						const filename = (additionalFields.filename as string) || binaryData.fileName || 'file';

						const extraFields: IDataObject = {};
						if (additionalFields.messageId) {
							extraFields.message_id = additionalFields.messageId as string;
						}

						responseData = await sendSevenApiRequestFormData.call(
							this,
							'/attachments/upload',
							{ buffer, filename, contentType: binaryData.mimeType },
							extraFields,
						);
					}

					else if (operation === 'uploadFromUrl') {
						const fileUrl = this.getNodeParameter('fileUrl', i) as string;
						const additionalFields = this.getNodeParameter('attachmentAdditionalFields', i, {}) as IDataObject;

						validateRequiredFields(this, { fileUrl }, ['fileUrl']);

						const body: IDataObject = { url: fileUrl };
						if (additionalFields.filename) {
							body.filename = additionalFields.filename as string;
						}

						responseData = await sendSevenApiRequest.call(
							this,
							'POST',
							'/attachments/from-url',
							body,
						);
					}
				}

				// Add response to return data
				if (Array.isArray(responseData)) {
					returnData.push(...responseData.map((item) => ({ json: item })));
				} else if (responseData) {
					returnData.push({ json: responseData });
				}

			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
