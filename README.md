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

#### Contact
- **Create**: Create a new contact
- **Update**: Update an existing contact
- **Get**: Get a contact by ID
- **Search**: Search contacts by name, email, or phone
- **Add Tag**: Add a tag to a contact

#### Conversation
- **Get**: Get a conversation by ID
- **Search**: Search conversations by contact, status, or channel type
- **Close**: Close a conversation
- **Assign**: Assign a conversation to a team member

#### WhatsApp Template
- **Send**: Send a pre-approved WhatsApp template message
- **List**: List available WhatsApp templates

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
| Read Messages | `messages:read` |
| Create/Update Contact | `contacts:create`, `contacts:update` |
| Read Contacts | `contacts:read` |
| Manage Tags | `tags:read` |
| Read Conversations | `conversations:read` |
| Manage Conversations | `conversations:update` |
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

- [SendSeven Documentation](https://sendseven.com/docs)
- [SendSeven API Reference](https://api.sendseven.com/api/v1/docs)
- [n8n Community Nodes](https://docs.n8n.io/integrations/community-nodes/)

## Support

- **Email**: dev@sendseven.com
- **Documentation**: https://sendseven.com/docs
- **Status**: https://status.sendseven.com

## License

MIT License - see LICENSE file for details.

## Changelog

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
