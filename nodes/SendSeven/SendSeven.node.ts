import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import {
	sendSevenApiRequest,
	sendSevenApiRequestAllItems,
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
 * - Send Message
 * - Create Contact
 * - Update Contact
 * - Add Tag to Contact
 * - Search Contacts
 * - Search Conversations
 * - Get Conversation
 * - Send WhatsApp Template
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
						name: 'Add Tag',
						value: 'addTag',
						description: 'Add a tag to a contact',
						action: 'Add tag to contact',
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

			// ==================== MESSAGE FIELDS ====================
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
					},
				},
				default: '',
				required: true,
				description: 'Recipient identifier (phone number for WhatsApp/SMS, email for Email)',
				placeholder: '+1234567890',
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

			// ==================== CONTACT FIELDS ====================
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['contact'],
						operation: ['get', 'update', 'addTag'],
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
						operation: ['addTag'],
					},
				},
				default: '',
				required: true,
				description: 'Select the tag to add to the contact',
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
						operation: ['create', 'update'],
					},
				},
				options: [
					{
						displayName: 'First Name',
						name: 'firstName',
						type: 'string',
						default: '',
						description: 'First name of the contact',
					},
					{
						displayName: 'Last Name',
						name: 'lastName',
						type: 'string',
						default: '',
						description: 'Last name of the contact',
					},
					{
						displayName: 'Company',
						name: 'company',
						type: 'string',
						default: '',
						description: 'Company or organization name',
					},
					{
						displayName: 'Notes',
						name: 'notes',
						type: 'string',
						typeOptions: {
							rows: 3,
						},
						default: '',
						description: 'Internal notes about the contact',
					},
					{
						displayName: 'Custom Fields',
						name: 'customFields',
						type: 'json',
						default: '{}',
						description: 'Custom field values as JSON',
					},
				],
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
				displayName: 'Recipient Phone',
				name: 'recipientPhone',
				type: 'string',
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
						operation: ['send'],
					},
				},
				default: '',
				required: true,
				description: 'Recipient phone number with country code',
				placeholder: '+1234567890',
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
				displayName: 'Language',
				name: 'templateLanguage',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getTemplateLanguages',
					loadOptionsDependsOn: ['waChannelId', 'templateName'],
				},
				displayOptions: {
					show: {
						resource: ['whatsappTemplate'],
						operation: ['send'],
					},
				},
				default: 'en',
				description: 'Select the template language',
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
				description: 'Template variable values ({{1}}, {{2}}, etc.)',
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
				const templates = (response as IDataObject).items as IDataObject[] || response as IDataObject[];

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

			/**
			 * Get available languages for a template
			 */
			async getTemplateLanguages(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const channelId = this.getCurrentNodeParameter('waChannelId') as string;
				const templateName = this.getCurrentNodeParameter('templateName') as string;

				if (!templateName) {
					return [{ name: 'English', value: 'en' }];
				}

				let endpoint = '/whatsapp-templates';
				if (channelId) {
					endpoint += `?channel_id=${channelId}`;
				}

				const response = await sendSevenApiRequest.call(this, 'GET', endpoint);
				const templates = (response as IDataObject).items as IDataObject[] || response as IDataObject[];

				const languages = templates
					.filter((t) => t.name === templateName && t.status === 'APPROVED')
					.map((t) => ({
						name: t.language as string,
						value: t.language as string,
					}));

				return languages.length > 0 ? languages : [{ name: 'English', value: 'en' }];
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
						const channelId = this.getNodeParameter('channelId', i) as string;
						const to = this.getNodeParameter('to', i) as string;
						const text = this.getNodeParameter('text', i) as string;

						validateRequiredFields(this, { channelId, to, text }, ['channelId', 'to', 'text']);

						const body: IDataObject = {
							channel_id: channelId,
							to,
							text,
						};

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
						if (additionalFields.firstName) body.first_name = additionalFields.firstName;
						if (additionalFields.lastName) body.last_name = additionalFields.lastName;
						if (additionalFields.company) body.company = additionalFields.company;
						if (additionalFields.notes) body.notes = additionalFields.notes;
						if (additionalFields.customFields) {
							body.custom_fields = typeof additionalFields.customFields === 'string'
								? JSON.parse(additionalFields.customFields)
								: additionalFields.customFields;
						}

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

						const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
						if (additionalFields.firstName) body.first_name = additionalFields.firstName;
						if (additionalFields.lastName) body.last_name = additionalFields.lastName;
						if (additionalFields.company) body.company = additionalFields.company;
						if (additionalFields.notes) body.notes = additionalFields.notes;
						if (additionalFields.customFields) {
							body.custom_fields = typeof additionalFields.customFields === 'string'
								? JSON.parse(additionalFields.customFields)
								: additionalFields.customFields;
						}

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

						if (searchQuery) query.search = searchQuery;
						if (email) query.email = email;
						if (phone) query.phone = phone;

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
						if (filters.channelType) query.channel_type = filters.channelType;

						if (returnAll) {
							responseData = await sendSevenApiRequestAllItems.call(this, '/conversations', query);
						} else {
							const limit = this.getNodeParameter('limit', i, 50) as number;
							query.page_size = limit;
							const response = await sendSevenApiRequest.call(this, 'GET', '/conversations', {}, query);
							responseData = (response as IDataObject).items as IDataObject[] || response;
						}

						responseData = (responseData as IDataObject[]).map(formatConversationResponse);
					}

					else if (operation === 'close') {
						const conversationId = this.getNodeParameter('conversationId', i) as string;
						validateRequiredFields(this, { conversationId }, ['conversationId']);

						responseData = await sendSevenApiRequest.call(
							this,
							'PUT',
							`/conversations/${conversationId}/close`,
						);
						responseData = formatConversationResponse(responseData as IDataObject);
					}

					else if (operation === 'assign') {
						const conversationId = this.getNodeParameter('conversationId', i) as string;
						const userId = this.getNodeParameter('userId', i) as string;

						validateRequiredFields(this, { conversationId, userId }, ['conversationId', 'userId']);

						responseData = await sendSevenApiRequest.call(
							this,
							'PUT',
							`/conversations/${conversationId}/assign`,
							{ user_id: userId },
						);
						responseData = formatConversationResponse(responseData as IDataObject);
					}
				}

				// ==================== WHATSAPP TEMPLATE ====================
				else if (resource === 'whatsappTemplate') {
					if (operation === 'send') {
						const channelId = this.getNodeParameter('waChannelId', i) as string;
						const to = this.getNodeParameter('recipientPhone', i) as string;
						const templateName = this.getNodeParameter('templateName', i) as string;
						const templateLanguage = this.getNodeParameter('templateLanguage', i, 'en') as string;
						const variablesData = this.getNodeParameter('templateVariables', i, {}) as IDataObject;

						validateRequiredFields(this, { channelId, to, templateName }, ['channelId', 'to', 'templateName']);

						// Build template content
						const content: IDataObject = {
							type: 'template',
							template: {
								name: templateName,
								language: {
									code: templateLanguage,
								},
							},
						};

						// Add variables if provided
						const variables = (variablesData.variables as IDataObject[]) || [];
						if (variables.length > 0) {
							(content.template as IDataObject).components = [
								{
									type: 'body',
									parameters: variables.map((v) => ({
										type: 'text',
										text: String(v.value),
									})),
								},
							];
						}

						const body: IDataObject = {
							to,
							channel_id: channelId,
							content,
						};

						responseData = await sendSevenApiRequest.call(this, 'POST', '/messages', body);
						responseData = {
							...formatMessageResponse(responseData as IDataObject),
							templateName,
							templateLanguage,
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
							responseData = await sendSevenApiRequestAllItems.call(this, endpoint);
						} else {
							const limit = this.getNodeParameter('limit', i, 50) as number;
							const response = await sendSevenApiRequest.call(
								this,
								'GET',
								endpoint,
								{},
								{ page_size: limit },
							);
							responseData = (response as IDataObject).items as IDataObject[] || response;
						}
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
