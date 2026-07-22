import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

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
		subtitle: '={{$parameter["event"]}}',
		description: 'Send and receive WhatsApp Business API, Instagram, Telegram, Email etc. messages in a unified API',
		defaults: {
			name: 'SendSeven Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
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
					const response = await sendSevenApiRequest.call(this, 'GET', '/webhook-endpoints');
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
					// A genuine 404 means the webhook-endpoints resource was not found
					// (no existing subscription) — safe to report "does not exist" so a
					// new one is created. Any other error (auth failure, API down, etc.)
					// must be surfaced; otherwise n8n proceeds to create() and registers a
					// duplicate webhook on every activation.
					const err = error as IDataObject;
					const httpCode = err.httpCode || err.statusCode;
					if (String(httpCode) === '404') {
						return false;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject, {
						message: 'Failed to check existing SendSeven webhook subscriptions',
						description:
							'SendSeven could not be queried for existing webhook subscriptions. The API token may be invalid or missing the "webhooks:read" scope, or the API may be unreachable. Resolve this before activating the workflow to avoid duplicate webhook registrations.',
					});
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
					const response = await sendSevenApiRequest.call(this, 'POST', '/webhook-endpoints', body);
					const responseData = response as IDataObject;

					// Store webhook ID and secret for later
					const webhookData = this.getWorkflowStaticData('node');
					webhookData.webhookId = responseData.webhook_id || responseData.id;
					webhookData.secretKey = responseData.secret_key;

					return true;
				} catch (error) {
					// Surface the real reason the subscription could not be created
					// (e.g. 403 missing `webhooks:create` scope, or the backend rejecting
					// a non-public/localhost webhook URL) instead of silently failing.
					throw new NodeApiError(this.getNode(), error as JsonObject, {
						message: 'Failed to register SendSeven webhook subscription',
						description:
							'SendSeven could not create the webhook subscription. Common causes: the API token is missing the "webhooks:create" scope, or the n8n webhook URL is not publicly reachable (localhost/private URLs are rejected — expose n8n with a public URL or tunnel).',
					});
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
					await sendSevenApiRequest.call(this, 'DELETE', `/webhook-endpoints/${webhookId}`);
				} catch (error) {
					// 404 is fine - webhook may have already been deleted
					const err = error as IDataObject;
					const httpCode = err.httpCode || err.statusCode;
					if (String(httpCode) !== '404') {
						// Surface real removal failures (e.g. 403 missing `webhooks:delete`
						// scope) so a dangling subscription doesn't keep delivering events.
						throw new NodeApiError(this.getNode(), error as JsonObject, {
							message: 'Failed to remove SendSeven webhook subscription',
							description:
								'SendSeven could not delete the webhook subscription. The API token may be missing the "webhooks:delete" scope. The subscription may keep delivering events until removed.',
						});
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

		// --- SendSeven webhook verification handshake ---
		// Immediately after a webhook endpoint is created, SendSeven POSTs a
		// one-time verification challenge to the registered URL (NOT HMAC-signed):
		//   header  X-Sendseven-Event: verification
		//   body    { "type": "sendseven_verification", "challenge": "<32hex>", ... }
		// The subscriber MUST reply with HTTP status EXACTLY 200 and a JSON body
		// { "challenge": "<the same challenge>" }. A non-200 status (201/204) FAILS
		// verification and the endpoint never activates (no events are ever delivered).
		// We answer it here, before any event-type matching, and emit no workflow data
		// (a verification ping is not a real event).
		const verificationHeader = (req.headers['x-sendseven-event'] as string) || '';
		const isVerification =
			body.type === 'sendseven_verification' || verificationHeader === 'verification';
		if (isVerification) {
			const res = this.getResponseObject();
			res.status(200).json({ challenge: body.challenge });
			return {
				noWebhookResponse: true,
			};
		}

		// Validate event type matches.
		// SendSeven's delivered webhook envelope keys the event on the top-level
		// `type` field (NOT `event`). Falling back to `body.event` keeps the node
		// resilient if the envelope shape ever changes.
		const receivedEvent = (body.type || body.event) as string;
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
			case 'message.delivered':
			case 'message.failed':
			case 'message.read': {
				const message = data.message as IDataObject || {};
				const contact = data.contact as IDataObject || {};
				const conversation = data.conversation as IDataObject || {};

				formattedData = {
					id: message.id || body.event_id,
					event: receivedEvent,
					message: formatMessageResponse(message),
					contact: contact.id ? formatContactResponse(contact) : null,
					conversation: conversation.id ? formatConversationResponse(conversation) : null,
					timestamp: (body.created_at || body.timestamp),
				};
				break;
			}

			case 'conversation.created':
			case 'conversation.closed':
			case 'conversation.assigned':
			case 'conversation.reopened': {
				const conversation = data.conversation as IDataObject || data;
				const contact = data.contact as IDataObject || {};

				formattedData = {
					id: conversation.id || body.event_id,
					event: receivedEvent,
					conversation: formatConversationResponse(conversation),
					contact: contact.id ? formatContactResponse(contact) : null,
					timestamp: (body.created_at || body.timestamp),
				};
				break;
			}

			case 'contact.created':
			case 'contact.updated':
			case 'contact.deleted': {
				const contact = data.contact as IDataObject || data;

				formattedData = {
					id: contact.id || body.event_id,
					event: receivedEvent,
					contact: formatContactResponse(contact),
					timestamp: (body.created_at || body.timestamp),
				};
				break;
			}

			case 'email.received':
			case 'email.sent':
			case 'email.delivered':
			case 'email.bounced':
			case 'email.opened': {
				const email = data.email as IDataObject || {};
				const contact = data.contact as IDataObject || {};
				const conversation = data.conversation as IDataObject || {};

				formattedData = {
					id: email.id || body.event_id,
					event: receivedEvent,
					email,
					contact: contact.id ? formatContactResponse(contact) : null,
					conversation: conversation.id ? formatConversationResponse(conversation) : null,
					timestamp: (body.created_at || body.timestamp),
				};
				break;
			}

			case 'conversation.transcript.created': {
				// Transcript export finished — surface the download URL and metadata
				// so a downstream node (e.g. HTTP Request) can fetch the PDF/ZIP and
				// store it elsewhere. NOTE: `downloadUrl` is a short-lived signed URL;
				// if the workflow runs after it expires, re-fetch a fresh URL via
				// `pollUrl` (GET /conversations/{id}/transcript/{job_id}).
				const conversation = data.conversation as IDataObject || {};

				formattedData = {
					id: (data.job_id as string) || body.event_id,
					event: receivedEvent,
					jobId: data.job_id,
					conversationId: data.conversation_id,
					contactId: data.contact_id,
					format: data.format,
					downloadUrl: data.download_url,
					downloadUrlExpiresAt: data.download_url_expires_at,
					downloadUrlExpiresInMinutes: data.download_url_expires_in_minutes,
					pollUrl: data.poll_url,
					filename: data.filename,
					conversation: conversation.id ? formatConversationResponse(conversation) : null,
					timestamp: (body.created_at || body.timestamp),
				};
				break;
			}

			case 'link.clicked': {
				formattedData = {
					id: body.event_id,
					event: receivedEvent,
					data,
					timestamp: (body.created_at || body.timestamp),
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
					timestamp: (body.created_at || body.timestamp),
				};
				break;
			}

			default:
				// Pass through unknown events with raw data
				formattedData = {
					id: body.event_id,
					event: receivedEvent,
					data,
					timestamp: (body.created_at || body.timestamp),
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
