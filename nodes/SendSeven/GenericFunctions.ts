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
	ResourceMapperFields,
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
 * Make an authenticated multipart/form-data request to the SendSeven API
 *
 * Used for binary uploads (e.g. POST /attachments/upload). The file part
 * field name MUST be `file` to match the backend handler (File(...) at
 * attachments.py:331). An optional `message_id` string part is supported.
 *
 * @param this - n8n context
 * @param endpoint - API endpoint (without base URL)
 * @param file - the binary file to upload (buffer + filename + content type)
 * @param extraFields - optional string form fields (e.g. message_id)
 * @returns API response data (AttachmentUploadResponse)
 */
export async function sendSevenApiRequestFormData(
	this: IExecuteFunctions,
	endpoint: string,
	file: { buffer: Buffer; filename: string; contentType?: string },
	extraFields: IDataObject = {},
): Promise<IDataObject> {
	const formData = new FormData();
	const blob = new Blob([file.buffer], {
		type: file.contentType || 'application/octet-stream',
	});
	formData.append('file', blob, file.filename);

	for (const [key, value] of Object.entries(extraFields)) {
		if (value !== undefined && value !== null && value !== '') {
			formData.append(key, String(value));
		}
	}

	const options: IHttpRequestOptions = {
		method: 'POST',
		url: `${API_BASE_URL}${endpoint}`,
		body: formData,
	};

	try {
		const credentialType = await getCredentialType.call(this);
		return await this.helpers.httpRequestWithAuthentication.call(
			this,
			credentialType,
			options,
		) as IDataObject;
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
			// FastAPI 422 validation errors (e.g. contact custom fields) return
			// `detail` as a LIST of { loc, msg, type, ... } objects, not a
			// string — String(array) would otherwise render "[object Object]".
			// Join each item's own message instead. This is a generic fix (not
			// custom-field-specific); friendlier, name-resolved messages for
			// custom-field errors specifically come from
			// withCustomFieldErrorHandling() at the contact create/update/
			// setCustomField call sites, which runs before this fallback is hit.
			if (Array.isArray(body.detail)) {
				const messages = (body.detail as IDataObject[])
					.map((item) => (item.msg || item.message) as string | undefined)
					.filter((msg): msg is string => Boolean(msg));
				if (messages.length > 0) {
					return messages.join('; ');
				}
			}
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
];

/**
 * Channel types a contact can hold a LIST SUBSCRIPTION on (POST/DELETE
 * /lists/{list_id}/members). This is the `SubscriptionChannelType` enum on
 * the backend — a narrower set than CHANNEL_TYPES above (no `live_chat`,
 * adds no browser_push here either; matches the six types exposed in this
 * node's List resource UI).
 *
 * The backend added a TEMPORARY-looking back-compat default on 2026-08-19
 * (missing channel_type on a newsletter list add/remove -> defaults to
 * email) which has since been made an INDEFINITE deprecated fallback (no
 * removal date) — old raw-HTTP callers keep working forever. This node does
 * NOT rely on that fallback: `channel_type` is a REQUIRED field here
 * (default `email`), so every workflow built with this node always sends
 * the explicit value and demonstrates the current contract, independent of
 * whenever the backend eventually retires the fallback on its own schedule.
 */
export const SUBSCRIPTION_CHANNEL_TYPES = [
	{ name: 'Email', value: 'email' },
	{ name: 'SMS', value: 'sms' },
	{ name: 'WhatsApp', value: 'whatsapp' },
	{ name: 'Telegram', value: 'telegram' },
	{ name: 'Messenger', value: 'messenger' },
	{ name: 'Instagram', value: 'instagram' },
];

/**
 * Subscription channel types that are page/bot-scoped and therefore require
 * a `channel_id` (which bot/page) on list add/remove — mirrors the backend's
 * `SCOPED_CHANNEL_TYPES` in `subscription_service.py`. WhatsApp and SMS are
 * NOT scoped for subscriptions (unlike WhatsApp's page-scoped BSUID contact
 * method elsewhere in this node).
 */
export const SCOPED_SUBSCRIPTION_CHANNEL_TYPES = ['telegram', 'messenger', 'instagram'];

/**
 * Webhook event types available in SendSeven
 */
export const WEBHOOK_EVENTS = [
	{ name: 'Message Received', value: 'message.received' },
	{ name: 'Message Sent', value: 'message.sent' },
	{ name: 'Message Delivered', value: 'message.delivered' },
	{ name: 'Message Failed', value: 'message.failed' },
	{ name: 'Message Read', value: 'message.read' },
	{ name: 'Email Received', value: 'email.received' },
	{ name: 'Email Sent', value: 'email.sent' },
	{ name: 'Email Delivered', value: 'email.delivered' },
	{ name: 'Email Bounced', value: 'email.bounced' },
	{ name: 'Email Opened', value: 'email.opened' },
	{ name: 'Conversation Created', value: 'conversation.created' },
	{ name: 'Conversation Closed', value: 'conversation.closed' },
	{ name: 'Conversation Assigned', value: 'conversation.assigned' },
	{ name: 'Conversation Reopened', value: 'conversation.reopened' },
	{ name: 'Conversation Transcript Created', value: 'conversation.transcript.created' },
	{ name: 'Contact Created', value: 'contact.created' },
	{ name: 'Contact Updated', value: 'contact.updated' },
	{ name: 'Contact Deleted', value: 'contact.deleted' },
	{ name: 'Contact Subscribed', value: 'contact.subscribed' },
	{ name: 'Contact Unsubscribed', value: 'contact.unsubscribed' },
	{ name: 'Link Clicked', value: 'link.clicked' },
	{ name: 'Team Chat Message Created (Channels Only - No DM Event)', value: 'team_chat.message.created' },
];

/**
 * Format contact response for consistent output
 */
export function formatContactResponse(contact: IDataObject): IDataObject {
	return {
		id: contact.id,
		name: contact.name,
		email: contact.email,
		phone: contact.phone,
		avatarUrl: contact.avatar_url,
		language: contact.language,
		isBlocked: contact.is_blocked,
		contactMethods: contact.contact_methods,
		customFields: contact.custom_fields,
		tags: contact.tags,
		lastContactedAt: contact.last_contacted_at,
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
		contactName: (conversation.contact as IDataObject)?.name,
		channelType: conversation.channel_type,
		channelId: conversation.channel_id,
		status: conversation.status,
		subject: conversation.subject,
		assignedUserId: conversation.assigned_user_id,
		needsReply: conversation.needs_reply,
		isLiveChat: conversation.is_live_chat,
		isEmail: conversation.is_email,
		contactMethodId: conversation.contact_method_id,
		lastMessageAt: conversation.last_message_at,
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
		// Additive: when more than one attachment was sent, POST /messages fans out into
		// N messages (one attachment each, caption/text on the first). This message resource
		// is always the first part; relatedMessageIds lists parts 2..N in wire order. Empty/
		// undefined for ordinary single-part sends. See README "Sending a message with an
		// attachment" for the fan-out behavior.
		relatedMessageIds: message.related_message_ids,
		createdAt: message.created_at,
	};
}

/**
 * ==================== CONTACT CUSTOM FIELDS ====================
 *
 * Shared helpers for the `customFields`/`customFieldsUpdate` resourceMapper
 * parameters (Create/Update Contact) and the legacy `setCustomField`
 * operation's Field dropdown + friendly 422 handling.
 *
 * Definitions come from `GET /custom-fields?active_only=true&page=&page_size=`
 * (page_size max 100, default 20 — sendSevenApiRequestAllItems already
 * paginates through every page):
 *   { items: [{ id, key, name, field_type, options, required, is_active,
 *               description, display_order }], pagination }
 * `active_only` defaults to true server-side; we still pass it explicitly
 * and filter client-side on `is_active !== false` as a defensive backstop
 * (also covers an old backend that doesn't recognize `active_only` at all
 * and would otherwise list inactive fields too).
 *
 * `field_type` enum (backend `app/models/custom_field.py FieldType`, all
 * lowercase): text, number, boolean, date, datetime, select, multiselect,
 * email, phone, url, location, collection.
 *
 * Keying convention: the resourceMapper's field `id` is the custom field
 * DEFINITION id (not `key`) — per the backend contract, connectors MUST
 * send definition ids, which stay stable across field renames.
 *
 * See claude_docs/agents/integrations-architect/memory/custom-fields-dynamic-mapping-scoping.md
 * for the full cross-platform type-mapping table this was derived from.
 */

/**
 * backend field_type -> n8n-workflow FieldType (n8n-workflow 2.26.2). There
 * is no dedicated multiselect FieldType, so multiselect and collection both
 * map to 'array' (rendered as a JSON editor by the resourceMapper UI).
 */
export const CUSTOM_FIELD_N8N_TYPE_MAP: Record<string, string> = {
	text: 'string',
	number: 'number',
	boolean: 'boolean',
	date: 'dateTime',
	datetime: 'dateTime',
	select: 'options',
	multiselect: 'array',
	email: 'string',
	phone: 'string',
	url: 'url',
	location: 'string',
	collection: 'array',
};

/**
 * Fetch every active custom field definition (paginated).
 */
export async function fetchActiveCustomFieldDefinitions(
	context: IExecuteFunctions | ILoadOptionsFunctions,
): Promise<IDataObject[]> {
	const definitions = await sendSevenApiRequestAllItems.call(context, '/custom-fields', {
		active_only: true,
	});
	return definitions.filter((def) => def.is_active !== false);
}

/**
 * Build the `ResourceMapperFields` schema for the `customFields`/
 * `customFieldsUpdate` parameters — one `ResourceMapperField` per active
 * custom field definition. Registered under `methods.resourceMapping` in
 * SendSeven.node.ts (NOT `methods.loadOptions` — different n8n mechanism).
 *
 * `ResourceMapperField` has no `description` property, so type/format/
 * option hints are folded into `displayName` instead.
 */
export async function getCustomFieldMapperFields(
	context: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	let definitions: IDataObject[];
	try {
		definitions = await fetchActiveCustomFieldDefinitions(context);
	} catch {
		// Don't break the node's parameter UI if definitions aren't reachable
		// (e.g. during initial credential setup) — just show no fields.
		return { fields: [] };
	}

	const fields = definitions
		.slice()
		.sort((a, b) => ((a.display_order as number) || 0) - ((b.display_order as number) || 0))
		.map((def) => {
			const fieldType = def.field_type as string;
			const n8nType = CUSTOM_FIELD_N8N_TYPE_MAP[fieldType] || 'string';

			const hints: string[] = [`type: ${fieldType}`];
			const options = def.options as string[] | undefined;
			if ((fieldType === 'select' || fieldType === 'multiselect') && Array.isArray(options) && options.length > 0) {
				hints.push(`options: ${options.join(', ')}`);
			}
			if (def.description) hints.push(def.description as string);

			const field: IDataObject = {
				id: def.id as string,
				displayName: `${def.name as string} (${hints.join(' — ')})`,
				defaultMatch: false,
				canBeUsedToMatch: false,
				required: false,
				display: true,
				type: n8nType,
			};

			if (fieldType === 'select' && Array.isArray(options)) {
				field.options = options.map((opt) => ({ name: opt, value: opt }));
			}

			return field;
		});

	return { fields } as unknown as ResourceMapperFields;
}

/**
 * Convert a resourceMapper's runtime `.value` object (or a single
 * `{fieldId: value}` pair from the legacy `setCustomField` operation) into
 * the `{<definition_id>: value}` map the backend's bulk `custom_fields`
 * contract expects.
 *
 * Convention (matches the Zapier connector's lib/customFields.js
 * collectCustomFieldsFromInputData): the backend treats `null`, `''` and
 * `[]` as ALL meaning "clear this field" on update, and n8n — like Zapier —
 * commonly emits `''`/empty for resourceMapper fields the user never
 * touched, not just ones they explicitly blanked. We can't tell those apart
 * here, so blank/empty is always OMITTED (leave untouched); only a genuine
 * `null` (e.g. produced by an expression) is passed through as an explicit
 * clear. Deliberate clearing for the legacy single-field operation is done
 * via its own "Clear Field Instead" boolean, which calls this with an
 * explicit `null`.
 */
export function collectCustomFieldsFromMapperValue(
	value: IDataObject | null | undefined,
): IDataObject {
	const customFields: IDataObject = {};
	if (!value) return customFields;

	for (const [fieldId, raw] of Object.entries(value)) {
		if (raw === undefined) continue;
		if (raw === '') continue;
		if (Array.isArray(raw) && raw.length === 0) continue;
		customFields[fieldId] = raw;
	}
	return customFields;
}

/**
 * Known custom-field validation error codes (backend `custom_field.<code>`
 * 422 detail entries). Mirrors the Zapier connector's KNOWN_CODES.
 */
const CUSTOM_FIELD_ERROR_CODES = new Set([
	'unknown_field',
	'duplicate_field',
	'invalid_type',
	'invalid_format',
	'not_an_option',
	'out_of_range',
	'too_long',
	'too_many_fields',
]);

interface CustomFieldIssue {
	fieldId?: string;
	code: string;
	message?: string;
}

/**
 * Try to parse a SendSeven custom-field validation error (422) out of a
 * thrown error. Returns null if the error doesn't look like this shape
 * (caller should then just rethrow the original, unmodified).
 *
 * Confirmed 422 shape (backend-api-expert, final contract):
 *   { detail: [{ loc, msg, type: "custom_field.<code>", code, field
 *                 (the id we sent), field_id, field_key, field_type }] }
 * For `unknown_field`, `field_id`/`field_key` are null (the id we sent
 * doesn't resolve to a definition), so we fall back to `field` — exactly
 * the id we sent — to identify which of our inputs it was. Values are
 * never echoed by the backend.
 */
function parseCustomFieldIssues(error: unknown): CustomFieldIssue[] | null {
	const err = error as IDataObject;
	const response = err.response as IDataObject | undefined;
	const body = response?.body as IDataObject | undefined;
	const detail = body?.detail;
	if (!Array.isArray(detail)) return null;

	const issues = (detail as IDataObject[])
		.map((item) => {
			const rawCode = (item.code || item.type) as string | undefined;
			// `type` is namespaced as "custom_field.<code>" per the confirmed
			// shape; `code` is already bare. Normalize both.
			const code = rawCode && rawCode.startsWith('custom_field.')
				? rawCode.slice('custom_field.'.length)
				: rawCode;
			if (!code || !CUSTOM_FIELD_ERROR_CODES.has(code)) return null;
			const fieldId = (item.field_id ?? item.field) as string | undefined;
			const issue: CustomFieldIssue = { fieldId, code, message: (item.msg || item.message) as string | undefined };
			return issue;
		})
		.filter((issue): issue is CustomFieldIssue => issue !== null);

	return issues.length > 0 ? issues : null;
}

/**
 * Wrap a contact create/update/setCustomField API call: on a 422 that looks
 * like a custom-field validation error, replace the thrown error with a
 * friendly per-field NodeOperationError, resolving definition ids back to
 * names via a fresh fetch (never echoing the submitted value). Any other
 * error — including a failed name-resolution fetch — is rethrown unchanged.
 *
 * Mirrors the Zapier connector's withCustomFieldErrorHandling /
 * raiseFriendlyCustomFieldError (lib/customFields.js).
 */
export async function withCustomFieldErrorHandling<T>(
	context: IExecuteFunctions,
	itemIndex: number,
	fn: () => Promise<T>,
): Promise<T> {
	try {
		return await fn();
	} catch (error) {
		const issues = parseCustomFieldIssues(error);
		if (!issues) throw error;

		let idToName: Record<string, string> = {};
		try {
			const definitions = await fetchActiveCustomFieldDefinitions(context);
			idToName = Object.fromEntries(
				definitions.map((def) => [def.id as string, def.name as string]),
			);
		} catch {
			// best-effort only — fall back to raw ids below
		}

		const lines = issues.map((issue) => {
			const label = (issue.fieldId && idToName[issue.fieldId]) || `custom field ${issue.fieldId ?? ''}`.trim();
			switch (issue.code) {
				case 'unknown_field':
					return `Custom field "${label}" no longer exists in SendSeven — remove it from this step or re-select it.`;
				case 'invalid_type':
					return `The value for custom field "${label}" doesn't match its type in SendSeven — check the mapped value.`;
				case 'not_an_option':
					return `The value for custom field "${label}" isn't one of its allowed options in SendSeven — re-select a valid option.`;
				case 'duplicate_field':
					return `Custom field "${label}" was submitted more than once — check your mapping for a duplicate.`;
				case 'invalid_format':
					return `The value for custom field "${label}" isn't in the format SendSeven expects (e.g. a date, email, or URL) — check the mapped value.`;
				case 'out_of_range':
					return `The value for custom field "${label}" is out of the allowed range in SendSeven.`;
				case 'too_long':
					return `The value for custom field "${label}" is too long for SendSeven.`;
				case 'too_many_fields':
					return 'Too many custom fields were submitted at once (SendSeven allows at most 200 per request).';
				default:
					return `Custom field "${label}": ${issue.message ?? issue.code}`;
			}
		});

		throw new NodeOperationError(context.getNode(), lines.join(' '), { itemIndex });
	}
}
