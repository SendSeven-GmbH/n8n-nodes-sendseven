import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IPollFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

/**
 * SendSeven API Base URL
 * Always use production URL for customer-facing integrations
 */
export const API_BASE_URL = 'https://api.sendseven.com/api/v1';

/**
 * Make an authenticated request to the SendSeven API
 *
 * @param this - n8n context (IExecuteFunctions, etc.)
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param endpoint - API endpoint (without base URL)
 * @param body - Request body for POST/PUT
 * @param query - Query parameters for GET
 * @returns API response data
 */
export async function sendSevenApiRequest(
	this: IExecuteFunctions | IWebhookFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	query: IDataObject = {},
): Promise<IDataObject | IDataObject[]> {
	const options: IHttpRequestOptions = {
		method,
		url: `${API_BASE_URL}${endpoint}`,
		qs: query,
		body,
		json: true,
	};

	// Remove empty body for GET requests
	if (method === 'GET' || Object.keys(body).length === 0) {
		delete options.body;
	}

	// Remove empty query params
	if (Object.keys(query).length === 0) {
		delete options.qs;
	}

	try {
		// Try OAuth2 first, fall back to API key
		const credentialType = await getCredentialType.call(this);
		return await this.helpers.httpRequestWithAuthentication.call(this, credentialType, options) as IDataObject | IDataObject[];
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			message: getErrorMessage(error),
		});
	}
}

/**
 * Make a paginated request to the SendSeven API
 * Automatically fetches all pages and combines results
 *
 * @param this - n8n context
 * @param endpoint - API endpoint
 * @param query - Query parameters
 * @param itemsKey - Key in response containing items (default: 'items')
 * @returns Combined array of all items
 */
export async function sendSevenApiRequestAllItems(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	endpoint: string,
	query: IDataObject = {},
	itemsKey: string = 'items',
): Promise<IDataObject[]> {
	const allItems: IDataObject[] = [];
	let page = 1;
	const pageSize = 100;
	let hasMore = true;

	while (hasMore) {
		const response = await sendSevenApiRequest.call(
			this,
			'GET',
			endpoint,
			{},
			{ ...query, page, page_size: pageSize },
		);

		const responseData = response as IDataObject;
		const items = (responseData[itemsKey] as IDataObject[]) || [];
		allItems.push(...items);

		// Check if there are more pages
		const pagination = responseData.pagination as IDataObject;
		if (pagination) {
			const currentPage = pagination.page as number;
			const totalPages = pagination.total_pages as number;
			hasMore = currentPage < totalPages;
		} else {
			hasMore = items.length === pageSize;
		}

		page++;

		// Safety limit to prevent infinite loops
		if (page > 100) {
			break;
		}
	}

	return allItems;
}

/**
 * Get the credential type being used (OAuth2 or API key)
 */
async function getCredentialType(
	this: IExecuteFunctions | IWebhookFunctions | IHookFunctions | ILoadOptionsFunctions | IPollFunctions,
): Promise<string> {
	// Check if OAuth2 credentials are configured
	try {
		await this.getCredentials('sendSevenOAuth2Api');
		return 'sendSevenOAuth2Api';
	} catch {
		// Fall back to API key
		return 'sendSevenApi';
	}
}

/**
 * Extract meaningful error message from API error response
 */
function getErrorMessage(error: unknown): string {
	const err = error as IDataObject;

	// Handle SendSeven API error format
	if (err.response) {
		const response = err.response as IDataObject;
		const body = response.body as IDataObject;
		if (body) {
			if (body.detail) {
				return String(body.detail);
			}
			if (body.message) {
				return String(body.message);
			}
		}
	}

	// Handle standard error
	if (err.message) {
		return String(err.message);
	}

	return 'An unknown error occurred';
}

/**
 * Validate that required fields are provided
 */
export function validateRequiredFields(
	node: IExecuteFunctions,
	fields: { [key: string]: unknown },
	required: string[],
): void {
	for (const field of required) {
		if (!fields[field]) {
			throw new NodeOperationError(
				node.getNode(),
				`The "${field}" field is required`,
			);
		}
	}
}

/**
 * Channel types available in SendSeven
 */
export const CHANNEL_TYPES = [
	{ name: 'WhatsApp', value: 'whatsapp' },
	{ name: 'Telegram', value: 'telegram' },
	{ name: 'SMS', value: 'sms' },
	{ name: 'Email', value: 'email' },
	{ name: 'Messenger', value: 'messenger' },
	{ name: 'Instagram', value: 'instagram' },
	{ name: 'Live Chat', value: 'live_chat' },
];

/**
 * Conversation status options
 */
export const CONVERSATION_STATUSES = [
	{ name: 'Open', value: 'open' },
	{ name: 'Closed', value: 'closed' },
	{ name: 'Pending', value: 'pending' },
];

/**
 * Webhook event types available in SendSeven
 */
export const WEBHOOK_EVENTS = [
	{ name: 'Message Received', value: 'message.received' },
	{ name: 'Message Sent', value: 'message.sent' },
	{ name: 'Message Status Updated', value: 'message.status_updated' },
	{ name: 'Conversation Created', value: 'conversation.created' },
	{ name: 'Conversation Closed', value: 'conversation.closed' },
	{ name: 'Contact Created', value: 'contact.created' },
	{ name: 'Contact Updated', value: 'contact.updated' },
	{ name: 'Ticket Created', value: 'ticket.created' },
	{ name: 'Ticket Closed', value: 'ticket.closed' },
	{ name: 'Campaign Sent', value: 'campaign.sent' },
];

/**
 * Format contact response for consistent output
 */
export function formatContactResponse(contact: IDataObject): IDataObject {
	return {
		id: contact.id,
		name: contact.name,
		firstName: contact.first_name,
		lastName: contact.last_name,
		email: contact.email,
		phone: contact.phone,
		company: contact.company,
		notes: contact.notes,
		customFields: contact.custom_fields,
		tags: contact.tags,
		createdAt: contact.created_at,
		updatedAt: contact.updated_at,
	};
}

/**
 * Format conversation response for consistent output
 */
export function formatConversationResponse(conversation: IDataObject): IDataObject {
	return {
		id: conversation.id,
		contactId: conversation.contact_id,
		contactName: conversation.contact_name || (conversation.contact as IDataObject)?.name,
		channelType: conversation.channel_type,
		channelId: conversation.channel_id,
		status: conversation.status,
		assignedToUserId: conversation.assigned_to_user_id,
		lastMessageAt: conversation.last_message_at,
		messageCount: conversation.message_count,
		unreadCount: conversation.unread_count,
		createdAt: conversation.created_at,
		updatedAt: conversation.updated_at,
	};
}

/**
 * Format message response for consistent output
 */
export function formatMessageResponse(message: IDataObject): IDataObject {
	return {
		id: message.id,
		conversationId: message.conversation_id,
		channelId: message.channel_id,
		direction: message.direction,
		messageType: message.message_type || message.type,
		text: message.text || message.content,
		status: message.status,
		to: message.to,
		from: message.from,
		hasAttachments: !!(message.attachments as IDataObject[])?.length,
		attachments: message.attachments,
		createdAt: message.created_at,
	};
}
