import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';

import {
	sendSevenApiRequest,
	formatContactResponse,
	formatConversationResponse,
	formatMessageResponse,
	WEBHOOK_EVENTS,
} from './GenericFunctions';

/**
 * SendSeven Trigger Node
 *
 * Webhook-based trigger node for SendSeven events.
 * Automatically subscribes/unsubscribes to webhook events.
 *
 * Events:
 * - Message Received
 * - Message Sent
 * - Conversation Created
 * - Conversation Closed
 * - Contact Created
 * - Contact Updated
 * - Ticket Created
 */
export class SendSevenTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SendSeven Trigger',
		name: 'sendSevenTrigger',
		icon: 'file:sendseven.svg',
		group: ['trigger'],
		version: 1,
		description: 'Triggers when SendSeven events occur (messages, conversations, contacts)',
		defaults: {
			name: 'SendSeven Trigger',
		},
		inputs: [],
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
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
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
			// Event selector
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: WEBHOOK_EVENTS,
				default: 'message.received',
				required: true,
				description: 'The event to listen for',
			},
		],
	};

	webhookMethods = {
		default: {
			/**
			 * Check if webhook exists
			 */
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const event = this.getNodeParameter('event') as string;

				try {
					// Fetch existing webhooks
					const response = await sendSevenApiRequest.call(this, 'GET', '/webhooks');
					const webhooks = (response as IDataObject).items as IDataObject[] || response as IDataObject[];

					// Check if webhook already exists for this URL and event
					const existingWebhook = webhooks.find((webhook) => {
						const url = webhook.url as string;
						const events = webhook.subscribed_events as string[];
						return url === webhookUrl && events?.includes(event);
					});

					if (existingWebhook) {
						// Store webhook ID for later use
						const webhookData = this.getWorkflowStaticData('node');
						webhookData.webhookId = existingWebhook.id;
						return true;
					}

					return false;
				} catch (error) {
					return false;
				}
			},

			/**
			 * Create webhook subscription
			 */
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const event = this.getNodeParameter('event') as string;
				const workflowId = this.getWorkflow().id;

				const body: IDataObject = {
					name: `n8n Workflow ${workflowId}: ${event}`,
					url: webhookUrl,
					subscribed_events: [event],
				};

				try {
					const response = await sendSevenApiRequest.call(this, 'POST', '/webhooks', body);
					const responseData = response as IDataObject;

					// Store webhook ID and secret for later
					const webhookData = this.getWorkflowStaticData('node');
					webhookData.webhookId = responseData.webhook_id || responseData.id;
					webhookData.secretKey = responseData.secret_key;

					return true;
				} catch (error) {
					return false;
				}
			},

			/**
			 * Delete webhook subscription
			 */
			async delete(this: IHookFunctions): Promise<boolean> {
				const webhookData = this.getWorkflowStaticData('node');
				const webhookId = webhookData.webhookId as string;

				if (!webhookId) {
					// No webhook to delete
					return true;
				}

				try {
					await sendSevenApiRequest.call(this, 'DELETE', `/webhooks/${webhookId}`);
				} catch (error) {
					// 404 is fine - webhook may have already been deleted
					const err = error as IDataObject;
					if ((err.httpCode || err.statusCode) !== 404) {
						return false;
					}
				}

				// Clean up stored data
				delete webhookData.webhookId;
				delete webhookData.secretKey;

				return true;
			},
		},
	};

	/**
	 * Process incoming webhook data
	 */
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const body = this.getBodyData() as IDataObject;
		const event = this.getNodeParameter('event') as string;

		// Validate event type matches
		const receivedEvent = body.event as string;
		if (receivedEvent !== event) {
			// Ignore events that don't match
			return {
				noWebhookResponse: true,
			};
		}

		// Optional: Verify webhook signature
		const webhookData = this.getWorkflowStaticData('node');
		const secretKey = webhookData.secretKey as string;
		if (secretKey) {
			const signature = req.headers['x-sendseven-signature'] as string;
			if (signature) {
				// Note: In production, implement proper HMAC verification
				// const isValid = verifySignature(body, signature, secretKey);
			}
		}

		// Extract and format the data based on event type
		const data = body.data as IDataObject || {};
		let formattedData: IDataObject;

		switch (receivedEvent) {
			case 'message.received':
			case 'message.sent':
			case 'message.status_updated': {
				const message = data.message as IDataObject || {};
				const contact = data.contact as IDataObject || {};
				const conversation = data.conversation as IDataObject || {};

				formattedData = {
					id: message.id || body.event_id,
					event: receivedEvent,
					message: formatMessageResponse(message),
					contact: contact.id ? formatContactResponse(contact) : null,
					conversation: conversation.id ? formatConversationResponse(conversation) : null,
					timestamp: body.timestamp,
				};
				break;
			}

			case 'conversation.created':
			case 'conversation.closed': {
				const conversation = data.conversation as IDataObject || data;
				const contact = data.contact as IDataObject || {};

				formattedData = {
					id: conversation.id || body.event_id,
					event: receivedEvent,
					conversation: formatConversationResponse(conversation),
					contact: contact.id ? formatContactResponse(contact) : null,
					timestamp: body.timestamp,
				};
				break;
			}

			case 'contact.created':
			case 'contact.updated': {
				const contact = data.contact as IDataObject || data;

				formattedData = {
					id: contact.id || body.event_id,
					event: receivedEvent,
					contact: formatContactResponse(contact),
					timestamp: body.timestamp,
				};
				break;
			}

			case 'ticket.created':
			case 'ticket.closed': {
				const ticket = data.ticket as IDataObject || data;
				const conversation = data.conversation as IDataObject || {};
				const contact = data.contact as IDataObject || {};

				formattedData = {
					id: ticket.id || body.event_id,
					event: receivedEvent,
					ticket: {
						id: ticket.id,
						status: ticket.status,
						summary: ticket.summary,
						conversationId: ticket.conversation_id || conversation.id,
						assignedToUserId: ticket.assigned_to_user_id,
						createdAt: ticket.created_at,
						closedAt: ticket.closed_at,
					},
					conversation: conversation.id ? formatConversationResponse(conversation) : null,
					contact: contact.id ? formatContactResponse(contact) : null,
					timestamp: body.timestamp,
				};
				break;
			}

			case 'campaign.sent': {
				const campaign = data.campaign as IDataObject || data;

				formattedData = {
					id: campaign.id || body.event_id,
					event: receivedEvent,
					campaign: {
						id: campaign.id,
						name: campaign.name,
						type: campaign.type,
						status: campaign.status,
						sentCount: campaign.sent_count,
						deliveredCount: campaign.delivered_count,
						failedCount: campaign.failed_count,
						sentAt: campaign.sent_at,
					},
					timestamp: body.timestamp,
				};
				break;
			}

			default:
				// Pass through unknown events with raw data
				formattedData = {
					id: body.event_id,
					event: receivedEvent,
					data,
					timestamp: body.timestamp,
					raw: body,
				};
		}

		return {
			workflowData: [
				[{ json: formattedData }],
			],
		};
	}
}
