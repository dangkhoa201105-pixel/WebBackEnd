# Backend operations

## Scheduled library worker

Run the worker as a separate process from the Next.js web server:

```powershell
npm run worker:library
```

It checks reservation expirations, expires online rentals, forfeits overdue physical-rental deposits, and creates due-soon/overdue notifications immediately at startup and then every 60 seconds. When explicitly enabled and fully configured, it also reconciles expired PayOS links, cancels them at PayOS before releasing reserved stock, and records successful payments missed by the webhook. Configure `LIBRARY_WORKER_INTERVAL_SECONDS` to an integer from 10 to 3600. Keep one worker instance active; state changes and notification upserts are stored in PostgreSQL, so restarting the worker is safe. The online reader checks the due time directly, so access is denied at expiry even if the worker is not running. The worker is required to persist the online `EXPIRED` state and offline deposit forfeiture in the background. Stop it with Ctrl+C or the process manager's graceful `SIGTERM`.

Worker output is newline-delimited JSON and never includes credentials, tokens, or notification contents.

## Integration tests

Run unit tests and the optional PostgreSQL integration tests:

```powershell
npm test
```

Catalog validation tests run without a database. The reservation-expiry, reservation-transaction, and concurrent-copy-claim tests require `TEST_DATABASE_URL` to point to a separate disposable PostgreSQL database with the current migrations applied.

For this project, the local PostgreSQL test database can be prepared and tested with PowerShell:

```powershell
npm run test:integration:local
```

This command verifies `DATABASE_URL` points to local `booknest`, checks that the PostgreSQL role has `CREATEDB`, creates a uniquely named disposable database, applies migrations, runs the test suite, terminates only connections to that generated database, and drops it. It refuses remote hosts or a database with another name. Never point `.env` at production for this command. The suite also leaves fixture cleanup in `finally` blocks in case the process is interrupted before database cleanup.

## Postman API verification

Import [BookNest.postman_collection.json](../postman/BookNest.postman_collection.json) into Postman. Set the collection variables `customerPassword` and `adminPassword` to the seeded demo passwords or to dedicated test-account passwords. Run the requests in collection order with the local application available at `baseUrl`. Postman's cookie jar carries the HttpOnly session cookie between requests; the collection does not store or manually expose JWTs.

The collection exercises health checks, catalog filtering, customer/admin authentication, session listing, loan and return, reservation creation and cancellation, reading profiles, security alerts, and inventory history. Loan, reservation, and return requests create demo records; use a disposable demo database if you want a clean repeatable presentation.

## Service-layer example

The reservation HTTP route now delegates its business transaction to `src/lib/services/reservation-service.ts`. That service owns the book/loan eligibility checks, FIFO promotion, stock synchronization, notification, and audit log; the route remains responsible for authentication, input parsing, HTTP status codes, and error mapping. A PostgreSQL integration test checks that these related writes commit together and that the database's active-reservation constraint rejects a duplicate.

## Online reading access

Renting has separate online ebook and offline physical-book modes. Both are fixed seven-day demo rentals:

- Online rental charges 70% of the book's configured sale price. It does not consume a physical copy. Reading API access is denied as soon as the due date is reached; the worker then marks the rental `EXPIRED`.
- Offline rental charges a net 60% of the configured sale price and collects 100% up front as a simulated deposit. Staff record the physical return at `/staff/loans`; an on-time return records a simulated 40% refund. An overdue return forfeits the deposit, and the worker persists forfeiture once the due date passes. A lost book forfeits the full deposit; existing damage fees may still apply.
- No extension is offered for new fixed-term rental packages.
- A purchase grants permanent reading access only after the order is confirmed and marked paid. Pending cash/PayOS orders do not grant access.
- Online renters and buyers can find entitled books in `/account/library` and open `/books/{bookId}/read`. Offline rentals do not grant online reading access. The server rechecks entitlement whenever the private reading API is requested; the page also refreshes access periodically while open.
- Admins add authorized plain-text ebook content on `/admin/books/{bookId}`. Seed books do not include full text. The content is not returned by the public catalog or loan/reservation APIs.

The browser must receive text to display it, so this is access control, not DRM: an authorized reader can still copy content while access is active. Only upload or enter text that BookNest is licensed to distribute.

## PayOS payment integration

PayOS currently does **not** provide a separate sandbox. Creating a checkout link and paying it uses the live payment service and can move real money. The application never enables PayOS by default, and automated tests do not call the PayOS API.

Only set these values in a local ignored environment file such as `.env.local` after you are ready to use live payments. Never paste credentials into chat or commit them:

```dotenv
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
PAYOS_RETURN_URL=http://localhost:3000/account/history?payment=success
PAYOS_CANCEL_URL=http://localhost:3000/account/history?payment=cancel
PAYOS_MAX_PAYMENT_AMOUNT_VND=
PAYOS_REAL_PAYMENTS_ENABLED=false
PAYOS_REAL_PAYMENTS_CONFIRMATION=
```

To intentionally enable live payments, set `PAYOS_REAL_PAYMENTS_ENABLED=true`, set `PAYOS_REAL_PAYMENTS_CONFIRMATION=I_UNDERSTAND_REAL_PAYMENTS`, and choose an appropriate `PAYOS_MAX_PAYMENT_AMOUNT_VND` cap. The cap must be at least the total of the order you intend to pay; it limits real payments and is not a sandbox amount. Production return/cancel URLs must use HTTPS. Restart the application after changing environment settings. Disabling new checkout requests does not revoke links already issued by PayOS; those links expire after 30 minutes.

### Automatic demo payment (no real money)

1. Sign in, choose **Mua sách · quyền đọc vô thời hạn (mô phỏng)** on an in-stock sale item, and confirm.
2. The normal order transaction decrements sale stock, records the inventory movement, and marks the simulated payment paid. No provider, merchant secret, or transfer is involved.
3. Open `/account/history` to see the order with payment method **Mô phỏng** and status **Đã thanh toán**. Open `/account/library` for its permanent reading entitlement; a reader opens only after an admin adds ebook content.

### Optional live PayOS flow

Live PayOS is a separate opt-in API flow, not the automatic demo flow. When explicitly enabled and configured, send `POST /api/orders` with `paymentMethod: "PAYOS"`, a list of `bookId`/`quantity` items, and an `Idempotency-Key`; it returns a checkout URL. Use `POST /api/orders/{id}/checkout` to retry creating a link. Register `https://<your-public-https-domain>/api/payments/payos/webhook` in the PayOS channel settings. Do not treat the browser return URL as proof of payment; only the signed webhook or server-side PayOS reconciliation marks an order paid. Start `npm run worker:library` so expired unpaid links are canceled before the app releases their reserved stock.

`GET /api/payments/payos/status` reports `{ "ready": false }` until credentials, URLs, the payment cap, and both explicit live-payment flags are valid. The endpoint never returns secret values. The simulated demo checkout remains available separately and never contacts PayOS.

Example request body:

```json
{
  "paymentMethod": "PAYOS",
  "items": [{ "bookId": "<book-id>", "quantity": 1 }]
}
```

Test the disabled-by-default behavior first: without the explicit enable and confirmation settings, the API returns `503` and does not create an order or contact PayOS. Do not describe this integration as sandbox-tested; a live end-to-end payment requires a real transaction.

## OpenAPI

The generated API contract is available from the running application at:

```text
GET /api/openapi
```

Import that JSON URL into Postman or Swagger Editor. The specification derives its server URL from the incoming request.

Catalog query filters:

| Parameter | Meaning |
| --- | --- |
| `q` | Search title and author |
| `category` | Exact category name |
| `page`, `limit` | Page number and page size (maximum 50) |
| `minPrice`, `maxPrice` | Inclusive daily rental price bounds |
| `availableOnly` | Only books with at least one copy available |
| `sort` | `featured`, `newest`, `price_asc`, `price_desc`, or `title` |

## Request diagnostics

API requests receive an `x-request-id` response header. When a critical transaction fails, the API response includes that identifier and structured server logs record the request ID, method, path, and safe error code/name. Do not add credentials, tokens, or raw request bodies to logs.

## PostgreSQL backup and restore

Install PostgreSQL client tools (`pg_dump` and `pg_restore`) on the machine performing backups. Store backups outside the web root and restrict access because they contain account and transaction data.

Create a timestamped custom-format backup in PowerShell:

```powershell
New-Item -ItemType Directory -Force .\backup | Out-Null
$file = ".\backup\booknest-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
pg_dump --format=custom --no-owner --file=$file $env:DATABASE_URL
```

Restore into a **separate empty staging database** first:

```powershell
pg_restore --no-owner --dbname=$env:RESTORE_DATABASE_URL .\backup\booknest-YYYYMMDD-HHMMSS.dump
```

Check the restored database with `npx prisma migrate status` and the application's database health endpoint before considering the backup usable. Do not use `--clean` against a shared or production database. Schedule backups and retention in the database host or deployment platform; the application does not currently run database backups itself.
