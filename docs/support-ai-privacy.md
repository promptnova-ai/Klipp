# Klipp support assistant: privacy and operations

## Current architecture

- The client app authenticates with Supabase and invokes the `support-chat` Edge Function with its user JWT.
- The function validates the JWT and verifies that the conversation belongs to the authenticated client.
- Client messages are written through the user-scoped Supabase client. The service-role client is used only inside the Edge Function to persist assistant/system replies and update the verified conversation.
- Knowledge retrieval is restricted to published `support_knowledge_articles` rows and uses PostgreSQL Spanish full-text search. This is lexical retrieval, not vector/embedding search.
- If the model is unavailable, no relevant published article exists, or the issue requires human review, the case is routed to the support inbox.
- The admin inbox is protected by the `support.manage` permission. Case status changes and staff replies are recorded in the admin audit log.
- The platform owner receives an in-app notification for new cases and follow-up messages on cases awaiting human attention.

## Data minimization

When an AI provider is configured, the Edge Function sends:
- The current user message after pattern-based redaction.
- The service name, booking status and scheduled time for the client's own linked booking, when available.
- A small set of published knowledge articles.

It does not send:
- Conversation history.
- Client or professional names, email addresses or phone numbers from profile records.
- Full addresses, landmarks, GPS coordinates or location history.
- Identity documents, payout details, card data or payment-provider reconciliation fields.
- Other customers' or professionals' booking data.

Pattern-based redaction is a safeguard, not a guarantee. The client UI warns users not to submit passwords, OTPs, identity documents, complete addresses or bank/card details.

## Provider configuration

The Edge Function reads server-side secrets:
- `OPENAI_API_KEY`
- `OPENAI_SUPPORT_MODEL`

Set them only in Supabase Edge Function Secrets. Never use an `EXPO_PUBLIC_*` variable for an AI provider key and never commit secrets to Git.

The request uses `store: false`. This is not a promise of zero provider-side retention. Before production activation, confirm the provider's current data-processing terms, retention controls, regional requirements and the wording in Klipp's privacy notice.

If either secret is missing, or no relevant published knowledge article is found, the function falls back to human support instead of inventing an answer.

## Human escalation

Safety, professional-conduct and payment cases are escalated. Refunds, compensation, cancellations and other financial or booking decisions are never approved by the model. The admin must review the case and record a resolution note before closing it.

## Deployment status

The migrations and Edge Function have been applied to Klipp QA Sandbox only. The main Supabase project has not been changed by this work. Do not enable the production client flow until the migrations are reviewed/applied, provider configuration is approved, and authenticated end-to-end tests pass.
