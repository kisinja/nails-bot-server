# ELJIKA AI WhatsApp Business Assistant

> A multi-tenant WhatsApp automation platform for service businesses, combining conversational AI, appointment scheduling, payment initiation, and human handoff.

[![Node.js](https://img.shields.io/badge/Node.js-ESM-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Groq](https://img.shields.io/badge/AI-Groq-F55036)](https://groq.com/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Cloud_API-25D366?logo=whatsapp&logoColor=white)](https://developers.facebook.com/docs/whatsapp/cloud-api/)

ELJIKA AI connects Meta's WhatsApp Cloud API to a tenant-aware backend that can understand customer requests, check real availability, hold appointments, request M-Pesa payments through Paystack, persist conversations, and escalate uncertain or sensitive cases to a human team.

## Highlights

- **Multi-tenant architecture**: routes each webhook by Meta's `phone_number_id` instead of assuming one shared WhatsApp account.
- **Conversational booking**: Groq tool calling resolves services, appointment types, dates, times, and customer details.
- **Conflict-safe scheduling**: availability checks account for business hours, open days, notice periods, technicians, service duration, house-call travel buffers, active holds, and confirmed appointments.
- **Temporary booking holds**: unpaid slots can be held for a configurable period and are replaced if the customer creates another hold.
- **M-Pesa payment initiation**: creates a Paystack mobile-money charge and confirms the booking only after a signed `charge.success` webhook.
- **Persistent memory**: PostgreSQL stores businesses, WhatsApp accounts, customers, conversations, messages, services, and bookings.
- **Human escalation**: pauses AI responses, records the reason and summary, alerts a configured owner on WhatsApp, and automatically resumes after three hours.
- **Business-specific AI instructions**: each tenant can override its assistant's rules without changing application code.
- **Onboarding workflow**: an interactive CLI provisions a business, services, WhatsApp credentials, hours, pricing, staff capacity, and escalation settings.
- **Operational endpoints**: health check and tenant-scoped booking administration.

## How It Works

```text
Customer WhatsApp
       |
       v
Meta WhatsApp Cloud API webhook
       |
       v
Express webhook server
       |
       +--> Resolve tenant by phone_number_id
       +--> Load customer and conversation history
       +--> Build a tenant-specific Groq system prompt
       +--> Execute AI function tools
              |
              +--> Check availability
              +--> Create/hold a booking
              +--> Escalate to a human
       |
       v
PostgreSQL / Prisma
       |
       +--> Paystack creates an M-Pesa charge
       +--> Signed Paystack webhook confirms the booking
       +--> WhatsApp confirmation is sent to the customer
```

## Features in Detail

### AI customer support

- Groq-hosted `openai/gpt-oss-20b` model
- Structured function/tool calling
- Tenants receive a system prompt containing their services, prices, location, hours, calendar, booking policy, and custom instructions
- The latest 16 conversation messages are loaded for context
- Both user and assistant messages are persisted
- Rate-limit responses are parsed and retried with an appropriate delay
- Safe fallback responses are sent when the AI provider is unavailable

### Booking engine

- Date and time validation
- Business timezone handling using Africa/Nairobi without DST ambiguity
- Configurable open days, opening/closing times, slot increments, and minimum notice
- Multiple simultaneous technicians
- Combined duration calculations for multi-service appointments
- House-call fees and travel-time buffers
- Concurrent active booking and hold awareness
- Automatic replacement of an existing unpaid hold for the same customer
- Tenant-scoped booking queries and availability checks

### Multi-tenancy and data isolation

- A WhatsApp account belongs to exactly one business
- Meta webhook payloads map to businesses through `phone_number_id`
- Customers and conversations are unique per `(businessId, phone)` or `(businessId, customerId)`
- Every booking, customer, conversation, and WhatsApp lookup is scoped to a business
- A short in-memory tenant configuration cache reduces database reads
- Credentials are resolved by the WhatsApp service and are not passed to the AI

### Payments

- Paystack M-Pesa Charge API integration
- Paystack's signed raw webhook payload is validated with HMAC-SHA512
- Successful payments confirm the booking and notify the customer on WhatsApp
- Booking metadata ties payment events to the correct tenant and booking
- Test-mode support allows charging Paystack's designated test MSISDN

### Human handoff

- Escalations stop automatic replies for the affected conversation
- Reasons and summaries are stored with escalation timestamps
- The business owner receives a WhatsApp alert when `ownerPhone` is configured
- Escalated conversations automatically resume AI handling after three hours
- Human-resolution behavior is available for administrative workflows

## Technology Stack

| Layer | Technology |
| --- | --- |
| Runtime | Node.js, ES modules |
| API server | Express 4 |
| Database | PostgreSQL |
| ORM | Prisma 7 with `@prisma/adapter-pg` |
| AI | Groq OpenAI-compatible chat completions API |
| Messaging | Meta WhatsApp Cloud API |
| Payments | Paystack Charge API and webhooks |
| Environment | `dotenv` |
| HTTP | Axios |
| Logging | Morgan |
| Time handling | Nairobi timezone helpers with UTC date calculations |

## Project Structure

```text
src/
  index.js                 Express app, middleware, health and admin routes
  db.js                    Prisma/PostgreSQL connection
  config/business.js       Tenant-specific Groq system prompt builder
  routes/
    webhook.js             Meta WhatsApp verification and message webhook
    paystackWebhook.js     Signed payment confirmation webhook
  services/
    businesses.js          Tenant resolution and credential lookup
    bookings.js            Availability, holds, totals and booking lifecycle
    customers.js           Customer and conversation persistence
    escalation.js          Human handoff and auto-resume
    groq.js                AI loop, tool calling and message context
    payments.js            Paystack M-Pesa charge initiation
    tools.js               AI tool definitions and execution
    whatsapp.js            WhatsApp Cloud API delivery
prisma/
  schema.prisma            Multi-tenant relational schema
  migrations/              Versioned database migrations
  seed.js                  Example tenant seed data
scripts/
  onboard-business.js      Interactive tenant onboarding CLI
```

## Prerequisites

- Node.js 18 or newer
- PostgreSQL database
- A Meta app with WhatsApp Cloud API enabled
- A WhatsApp test or production phone number
- Groq API key
- Paystack account and secret key (for payment confirmation)
- Public HTTPS URL for webhook endpoints in production, such as Render, Railway, Fly.io, or a reverse proxy

## Environment Variables

Copy `.env.example` to `.env`, then configure:

```dotenv
DATABASE_URL=postgresql://user:password@host:5432/database

GROQ_API_KEY=your_groq_api_key
WHATSAPP_TOKEN=your_default_or_admin_meta_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WEBHOOK_VERIFY_TOKEN=a_private_random_verification_string

PAYSTACK_SECRET_KEY=your_paystack_secret_key
PAYSTACK_TEST_MODE=false

ADMIN_KEY=a_long_random_admin_secret
PORT=3000

# Optional seed/onboarding example values
GLOW_NAILS_PHONE_NUMBER_ID=your_phone_number_id
GLOW_NAILS_WHATSAPP_TOKEN=your_meta_access_token
TEST_BEAUTY_PHONE_NUMBER_ID=another_phone_number_id
TEST_BEAUTY_WHATSAPP_TOKEN=another_meta_access_token
```

`WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are retained for compatibility and configuration examples. Live tenant messages resolve each number's credentials from PostgreSQL.

## Installation

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, the copy command is:

```powershell
Copy-Item .env.example .env
```

Configure PostgreSQL and the required environment variables before starting the application.

## Database Setup

Generate the Prisma client and apply migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

For local schema development:

```bash
npx prisma migrate dev
```

Explore the data with:

```bash
npx prisma studio
```

An optional seed creates two demonstration businesses:

```bash
npx prisma db seed
```

## Running Locally

```bash
npm start
```

Development mode with Node watch:

```bash
npm run dev
```

The server defaults to port `3000`.

## Onboarding a Business

The interactive onboarding CLI creates a complete tenant record:

```bash
node scripts/onboard-business.js
```

It collects:

- Business name, location, currency, timezone, and hours
- Open days and time range
- Slot increments, minimum notice, and staff capacity
- House-call fee and travel buffer
- Booking hold duration
- Service names, prices, and durations
- Business-specific assistant instructions
- Human escalation phone number
- Meta phone number ID and access token

The new tenant is resolved immediately by `phone_number_id`; no server restart or redeployment is required.

## Webhook Configuration

### Meta WhatsApp webhook

1. Open the WhatsApp configuration page for your Meta app.
2. Set the callback URL to `https://your-domain/webhook`.
3. Set `WEBHOOK_VERIFY_TOKEN` to the same private value used in `.env`.
4. Subscribe to the `messages` field.
5. Confirm that the WhatsApp Business Account's phone number ID is stored in the matching `WhatsAppAccount` row.

Meta deliveries are acknowledged with HTTP 200 before AI and database processing so the platform does not retry slow requests.

### Paystack webhook

1. Register `https://your-domain/webhook/paystack` as the Paystack webhook URL.
2. Set `PAYSTACK_SECRET_KEY` in `.env`.
3. Keep `PAYSTACK_TEST_MODE=false` for live M-Pesa charges.
4. The endpoint validates HMAC-SHA512 signatures using the raw request body before confirming a charge.

## API Surface

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/` | Application status message |
| `GET` | `/health` | Lightweight health check, returns `200 OK` |
| `GET` | `/webhook` | Meta webhook verification |
| `POST` | `/webhook` | Incoming WhatsApp messages and status updates |
| `POST` | `/webhook/paystack` | Signed Paystack payment notifications |
| `GET` | `/admin/bookings?key=...&businessId=...` | List bookings for one tenant |

The admin endpoint requires the tenant's `businessId` and the server's `ADMIN_KEY`. Do not expose `ADMIN_KEY` in client applications.

## Booking Lifecycle

1. The assistant asks for services, booking type, date, and time.
2. It calls `check_availability` before proposing or confirming a slot.
3. The customer reviews and confirms a summary.
4. `create_booking` performs a fresh availability check.
5. A booking is created with `pending_payment` status and a configured hold expiry.
6. Paystack starts an M-Pesa charge.
7. A signed `charge.success` webhook verifies the payment event and confirms the booking.
8. The customer receives a WhatsApp confirmation.

If payment cannot be initiated, the booking remains temporarily held so a retry or operational recovery can be performed without immediately releasing the slot.

## Data Model

The relational schema models:

- **Business**: operations, location, timezone, hours, capacity, fees, hold settings, and custom AI instructions
- **WhatsAppAccount**: tenant-to-`phone_number_id` routing and outbound credentials
- **Service**: tenant-specific prices and durations
- **Customer**: phone identity scoped to one business
- **Conversation**: persistent customer conversation and escalation state
- **Message**: ordered user, assistant, or tool messages
- **Booking**: service snapshot, address, date, time, duration, price, hold expiry, and confirmation state

Full field definitions are in [`prisma/schema.prisma`](prisma/schema.prisma).

## Security and Production Considerations

- Store environment secrets in the deployment platform's secret manager
- Use distinct WhatsApp tokens per tenant and rotate compromised credentials
- Restrict admin endpoints with strong authentication rather than exposing a key-based query parameter
- Configure Paystack webhook allowlisting and signature validation
- Put the public webhook behind an HTTPS reverse proxy
- Add database, payment, and provider rate limiting for public traffic
- Monitor failed webhook, Groq, WhatsApp, and Paystack operations
- Implement payment retries and reconciliation before relying on the system for revenue
- Move WhatsApp credentials and other provider secrets to a dedicated secret store for higher-scale deployments
- Add authentication and authorization for an operations dashboard
- Add automated migrations and backups to the deployment pipeline
- Restrict webhook processing logs to avoid exposing customer phone numbers and message content

## Suggested Role Demonstration

This repository demonstrates:

- Backend API and webhook development
- Multi-tenant SaaS architecture and tenant isolation
- Relational data modeling and Prisma/PostgreSQL usage
- AI tool/function calling and prompt engineering
- Third-party API integrations
- Payment event verification
- Background-safe webhook acknowledgment patterns
- Scheduling and concurrency-aware business logic
- Conversation persistence and human handoff workflows
- Environment-based configuration and operational scripting
- CLI-driven tenant provisioning

## Known MVP Limitations

- Non-text WhatsApp messages are currently logged and skipped
- No complete admin UI or role-based dashboard is included yet
- Paystack's test mode uses a designated test phone number
- Failed payment-start operations do not yet have an automatic retry worker
- Conversation history is limited to the latest 16 persisted messages per request
- Token and secret storage is database/environment based rather than a dedicated secrets manager
- Meta and Paystack events do not yet have a separate persisted event/reconciliation log

## Troubleshooting

### No business resolves for a WhatsApp message

- Confirm the payload `phone_number_id` exists in `WhatsAppAccount.phoneNumberId`
- Confirm the phone number belongs to the intended business
- Restart the process if you need tenant cache data to invalidate faster

### Meta reports a webhook verification failure

- Confirm the callback URL ends in `/webhook`
- Confirm `WEBHOOK_VERIFY_TOKEN` exactly matches the value entered in Meta
- Confirm the server is publicly reachable over HTTPS

### M-Pesa payment does not confirm

- Confirm `PAYSTACK_SECRET_KEY` is correct
- Confirm `/webhook/paystack` is registered publicly
- Check that the request contains the `x-paystack-signature` header
- Confirm booking metadata contains both `businessId` and `bookingId`
- Confirm the server is returning HTTP 200 promptly

### Database or Prisma fails to start

- Confirm `DATABASE_URL` uses a valid PostgreSQL connection string
- Run `npx prisma generate`
- Apply migrations with `npx prisma migrate deploy`

## License

Add your preferred license before publishing this repository publicly.
