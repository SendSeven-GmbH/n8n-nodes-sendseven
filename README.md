# n8n-nodes-sendseven

This is an n8n community node for [SendSeven](https://sendseven.com) - a unified messaging API platform enabling multi-channel messaging through WhatsApp, Telegram, SMS, Email, Messenger, Instagram, and more.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

### npm Installation

```bash
npm install n8n-nodes-sendseven
```

### Manual Installation

1. Clone this repository
2. Run `npm install`
3. Run `npm run build`
4. Copy the `dist` folder to your n8n custom nodes directory

## Operations

### SendSeven Node (Actions)

#### Message
- **Send**: Send a message through any channel (WhatsApp, Telegram, SMS, Email, etc.)
  - Supports **attachments**: provide a comma-separated list of attachment UUIDs (from the Attachment resource) in the **Attachment IDs** field. These map to the `attachments` array of `POST /messages`. Raw URLs are not accepted — upload first.
  - **Multiple attachments are delivered as separate messages**, in the order listed, with the **Message Text** attached only to the first — except on an **Email** channel, where all attachments go out together as one email. Each attachment message is billed separately (the email exception is billed as one message). The output's new `relatedMessageIds` field lists the IDs of the additional messages (parts 2..N); it's empty for ordinary single-part sends.

#### Contact
- **Create**: Create a new contact
- **Update**: Update an existing contact (name, email, phone, avatar URL)
- **Get**: Get a contact by ID
- **Delete**: Delete a contact (GDPR delete — conversations anonymized, billing preserved)
- **Search**: Search contacts by name, email, or phone
- **Add Tag**: Add a tag to a contact
- **Remove Tag**: Remove a tag from a contact
- **Set Custom Field**: Set a custom field value on a contact. The **Custom Field** dropdown is populated from your tenant's field definitions (`GET /custom-fields`); the value is written via `POST /contacts/{id}/fields/{field_id}`.
- **Add Method**: Add a contact method (platform ID). Method types: `phone`, `email`, `whatsapp_id`, `telegram_id`, `messenger_id`, `instagram_id`. For `messenger_id`/`instagram_id` a **Channel** must be selected (these IDs are page-scoped).
- **Delete Method**: Delete a contact method by its method ID.

#### Conversation
- **Get**: Get a conversation by ID
- **Search**: Search conversations by contact, status, or channel type
- **Close**: Close a conversation
- **Assign**: Assign a conversation to a team member

#### List
- **Add Member**: Add (subscribe) a contact to a static or newsletter list — `POST /lists/{list_id}/members`. **Channel Type** is a required field (defaults to **Email**) so every workflow explicitly states which channel the subscription is for; it's ignored server-side for static lists. **Channel Type** = Telegram, Messenger, or Instagram additionally requires **Channel ID** (which bot/page). The same contact can subscribe to the same newsletter via multiple channels by running this operation once per channel.
- **Remove Member**: Remove (unsubscribe) a contact from a list — `DELETE /lists/{list_id}/members/{contact_id}`. Same **Channel Type** / **Channel ID** rules as Add Member; removes only the subscription for the specified channel.

Both operations work against static lists too (Channel Type is sent but ignored there). Dynamic lists cannot have members added/removed directly — their membership comes from segment conditions.

> **Note on the backend's `channel_type` default:** the SendSeven API has a deprecated fallback where a newsletter list add/remove with no `channel_type` defaults to `email` (kept indefinitely for old raw-HTTP callers, e.g. workflows built before this node had a List resource). This node never relies on that fallback — it always sends `channel_type` explicitly.

#### WhatsApp Template
- **Send**: Send a pre-approved WhatsApp template message. Provide **at least one recipient** (Contact ID is no longer mandatory):
  - **Contact ID** — a contact; uses its first WhatsApp method, phone as fallback.
  - **WhatsApp ID** — a phone number without a leading `+` (stripped automatically) or an alphanumeric WhatsApp ID; matches an existing contact or creates one (ideal for stateless integrations).
  - **Contact Method ID** (Additional Options) — target a specific WhatsApp number when a contact has several; must be a `whatsapp_id`-type method. If Contact ID is also set it must name the same contact.
  - **Conversation ID** (Additional Options) — send within an existing WhatsApp conversation.

  Additional Options also expose **Channel ID** (disambiguates a template referenced by NAME across channels, and selects the sending channel when only a WhatsApp ID is given), **Language** (Meta locale code such as `en`, `de`, `en_US`, `pt_BR` — needed only when a template name exists in multiple languages; auto-resolved from the contact's preferred language otherwise), **Header Media URL**, **Header Document Filename**, and **Variable Values (JSON)**.
- **List**: List available WhatsApp templates

#### Attachment
- **Upload**: Upload a binary file (from an incoming binary property such as the output of an HTTP/Read-Binary node) as a multipart `POST /attachments/upload`. Returns the attachment `id`.
- **Upload from URL**: Fetch a public http(s) URL server-side via `POST /attachments/from-url` and store it. Returns the attachment `id`. Note: the URL-fetch MIME allowlist is stricter than direct upload (images, mp4/mov/webm, common audio, pdf).

##### Sending a message with an attachment

Chain two nodes:

1. **Attachment → Upload** (or **Upload from URL**) — produces an attachment object whose `id` is the attachment UUID.
2. **Message → Send** — set the **Attachment IDs** field to an expression referencing the previous node's `id` (e.g. `{{ $json.id }}`), or a comma-separated list of several UUIDs. The node passes these into the `attachments` array of `POST /messages`, and the channel adapter renders them by content type (e.g. WhatsApp image/document, email attachment). Listing several UUIDs sends them as separate messages, in order, with the caption/text on the first — except on Email, where they're combined into one email with multiple attachments.

### SendSeven Trigger Node (Webhooks)

Listen for real-time events:

- **Message Received**: Triggers when a new inbound message is received
- **Message Sent**: Triggers when an outbound message is delivered
- **Message Delivered**: Triggers when message delivery is confirmed
- **Message Failed**: Triggers when a message fails to send
- **Message Read**: Triggers when a message read receipt is received
- **Email Received**: Triggers when an inbound email is received
- **Email Sent**: Triggers when an outbound email is sent
- **Email Delivered**: Triggers when an email delivery is confirmed
- **Email Bounced**: Triggers when an email bounces
- **Email Opened**: Triggers when an email is opened
- **Conversation Created**: Triggers when a new conversation starts
- **Conversation Closed**: Triggers when a conversation is closed
- **Conversation Assigned**: Triggers when a conversation is assigned to an agent
- **Conversation Reopened**: Triggers when a conversation is reopened
- **Contact Created**: Triggers when a new contact is created
- **Contact Updated**: Triggers when a contact is updated
- **Contact Deleted**: Triggers when a contact is deleted
- **Link Clicked**: Triggers when a tracked link is clicked
- **Campaign Sent**: Triggers when a campaign completes sending

## Authentication

This node supports two authentication methods:

### API Key (Recommended for most users)

1. Log in to your SendSeven account at https://app.sendseven.com
2. Navigate to **Settings > API Tokens**
3. Create a new API token with the required scopes
4. Copy the token (format: `s7_xxxxxxxxxxxx`)
5. In n8n, add a new credential of type "SendSeven API"
6. Paste your API token

### OAuth2 (For advanced integrations)

1. Log in to your SendSeven account
2. Navigate to **Settings > OAuth Apps**
3. Create a new OAuth application
4. Configure the redirect URI to match your n8n instance
5. In n8n, add a new credential of type "SendSeven OAuth2 API"
6. Complete the OAuth2 authorization flow

## Required Scopes

Different operations require different scopes:

| Operation | Required Scopes |
|-----------|-----------------|
| Send Message | `messages:create` |
| Upload Attachment | `messages:create` |
| Read Messages | `messages:read` |
| Create/Update Contact | `contacts:create`, `contacts:update` |
| Delete Contact / Add or Delete Method / Set Custom Field | `contacts:update` (delete: `contacts:delete`) |
| Read Contacts | `contacts:read` |
| Read Custom Field Definitions | `settings:read` |
| Manage Tags | `tags:read` |
| Read Conversations | `conversations:read` |
| Manage Conversations | `conversations:update` |
| Add/Remove List Member | `lists:update` |
| Webhooks | `webhooks:create`, `webhooks:read`, `webhooks:delete` |
| Knowledge Base | `knowledge_base:read` |
| Team Members | `team:read` |

## Example Workflows

### Send WhatsApp notification on new CRM lead

1. Add a trigger from your CRM (e.g., HubSpot, Salesforce)
2. Add SendSeven node with "WhatsApp Template > Send" operation
3. Map the lead data to template variables

### Log support conversations to spreadsheet

1. Add SendSeven Trigger with "Conversation Closed" event
2. Add Google Sheets node to append row
3. Map conversation data to spreadsheet columns

### Auto-respond to incoming messages

1. Add SendSeven Trigger with "Message Received" event
2. Add IF node to check message content
3. Add SendSeven node with "Message > Send" to reply

## Resources

- [SendSeven Documentation](https://docs.sendseven.com/guides/integrations/n8n)
- [SendSeven API Reference](https://api.sendseven.com/api/v1/docs)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)

## Support

- **Email**: dev@sendseven.com
- **Documentation**: https://docs.sendseven.com/guides/integrations/n8n
- **Status**: https://status.sendseven.com

## License

MIT License - see LICENSE file for details.

## Changelog

### 1.4.1

- **Fix (List → Remove Member)**: Channel ID (`listChannelId`) is now read and sent as `channel_id` on `DELETE /lists/{list_id}/members/{contact_id}` when Channel Type is Telegram, Messenger, or Instagram — it was previously collected in the UI but silently dropped, so the backend could not identify the correct channel-scoped subscription to remove. Mirrors the existing Add Member behavior.
- **Fix (OAuth2 credentials)**: Added the missing `lists:update` scope to the OAuth2 default scope string — required for both List → Add Member and List → Remove Member, as already documented in the Required Scopes table below.

### 1.4.0

- Added **List** resource with **Add Member** / **Remove Member** operations (`POST`/`DELETE /lists/{list_id}/members[/{contact_id}]`), fixing the case where n8n users had no first-class way to subscribe/unsubscribe a contact from a newsletter list and were forced onto the generic HTTP Request node (which previously 501'd on newsletter lists before a backend fix).
- **Channel Type** is a **required** field on both operations (options: Email/SMS/WhatsApp/Telegram/Messenger/Instagram; defaults to **Email**) — this node always sends it explicitly rather than relying on the backend's deprecated missing-`channel_type`-defaults-to-email fallback. **Channel ID** is additionally required (and only shown) when Channel Type is Telegram, Messenger, or Instagram (page/bot-scoped).
- Added `getLists` loadOptions dropdown (`GET /lists`).
- Purely additive — no existing resource, operation, or field changed. Existing workflows are unaffected.

### Unreleased — Multi-attachment fan-out (copy update, not yet republished)

- **Message → Send**: docs/descriptions no longer imply attachments beyond the first are dropped. `POST /messages` now fans out N attachments into N separate messages (in order, text on the first) instead of silently discarding parts 2..N — the **Attachment IDs** field's documented "comma-separated UUIDs" behavior is now actually true for more than one ID.
- **Additive response field**: `formatMessageResponse` now also returns `relatedMessageIds` (array of message IDs, parts 2..N, empty by default). No existing field changed or removed.
- **Billing note**: sending N attachments now creates N billable messages instead of 1 (except on an Email channel, which still sends one email with all attachments as MIME parts).
- No request-shape or client-side parsing changes — the comma-split logic already produced a flat UUID array, which is unaffected. Not yet published to npm.

### 1.2.4

- Republished from GitHub Actions with an npm **provenance** statement (required for n8n verified community node review). No functional changes from 1.2.3.
- Normalized `repository.url` to the `git+https://...git` form required for provenance verification.

### 1.2.0

- **BREAKING FIX (custom fields)**: Custom fields are no longer sent in the contact Create/Update body — the backend silently dropped them (they are not contact-body fields). The dead `Custom Fields` JSON option was removed from Contact → Create. Use the new **Contact → Set Custom Field** operation, which resolves the field definition via `GET /custom-fields` (loadOptions dropdown) and writes the value via `POST /contacts/{id}/fields/{field_id}`. **Action required:** any workflow that relied on the old `Custom Fields` create/update option must switch to Set Custom Field — the old option had no effect.
- Added **Attachment** resource:
  - **Upload** — binary input → multipart `POST /attachments/upload` (file part `file`, optional `message_id`).
  - **Upload from URL** — `POST /attachments/from-url` (stricter MIME allowlist).
  - Both return the attachment `id` for downstream use.
- **Message → Send**: added an **Attachment IDs** field (comma-separated attachment UUIDs) wired into the `attachments` array of `POST /messages`.
- Added **Contact → Delete** (`DELETE /contacts/{id}`, GDPR delete).
- Added **Contact → Add Method** / **Delete Method** (`POST`/`DELETE /contacts/{id}/methods`). Channel selection is shown conditionally and required for `messenger_id`/`instagram_id`.
- Added **Contact → Remove Tag** (`DELETE /contacts/{id}/tags/{tag_id}`).
- Added `getCustomFields` loadOptions helper and a `sendSevenApiRequestFormData` helper for authenticated multipart uploads.

### 1.1.0

- **BREAKING**: Webhook endpoint path changed from `/webhooks` to `/webhook-endpoints`
- **BREAKING**: Conversation close now uses POST (was PUT) with `notes` field (was `resolution_note`)
- **BREAKING**: Conversation assign now uses POST with user_id in URL path (was PUT with body)
- **BREAKING**: Removed `pending` conversation status (only `open` and `closed` remain)
- Added 3 message addressing modes: Recipient+Channel, Conversation ID, Contact+Channel
- Added `contact_methods` support for contact creation
- Updated contact fields: removed `firstName`, `lastName`, `company`, `notes`; added `contactMethods`, `language`, `isBlocked`
- Updated conversation fields: `assigned_user_id` (was `assigned_to_user_id`), added `needs_reply`, `is_live_chat`, `is_email`, `subject`; removed `message_count`, `unread_count`
- Updated contact update to only accept `name`, `email`, `phone`, `avatar_url`
- Added close options: `notes` and `summarize` fields
- Added conversation search filter: `needs_reply`
- Updated webhook events: added `message.delivered`, `message.failed`, `message.read`, `email.*`, `conversation.assigned`, `conversation.reopened`, `contact.deleted`, `link.clicked`; removed `message.status_updated`, `ticket.created`, `ticket.closed`
- Updated OAuth2 scopes: replaced `webhooks:update` with `webhooks:create`/`webhooks:delete`; added `knowledge_base:read`, `team:read`

### 1.0.0

- Initial release
- Actions: Send Message, Create/Update/Get/Search Contact, Add Tag, Get/Search Conversation, Close/Assign Conversation, Send WhatsApp Template
- Triggers: Message Received/Sent, Conversation Created/Closed, Contact Created/Updated, Ticket Created/Closed, Campaign Sent
- Authentication: API Key and OAuth2 support
