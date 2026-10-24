import { NextResponse } from "next/server";

const spec = {
	openapi: "3.1.0",
	info: {
		title: "BookNest API",
		version: "1.0.0",
		description: "REST API for the BookNest library, reservation, and online book catalog.",
	},
	components: {
		securitySchemes: {
			booknestCookie: { type: "apiKey", in: "cookie", name: "booknest_token" },
		},
		schemas: {
			Error: {
				type: "object",
				properties: {
					message: { type: "string" },
					requestId: { type: "string" },
				},
			},
			CatalogResponse: {
				type: "object",
				properties: {
					data: { type: "array", items: { type: "object" } },
					meta: {
						type: "object",
						properties: {
							page: { type: "integer" },
							limit: { type: "integer" },
							total: { type: "integer" },
							pageCount: { type: "integer" },
						},
						required: ["page", "limit", "total", "pageCount"],
					},
				},
			},
		},
	},
	paths: {
		"/api/books": {
			get: {
				summary: "Search and filter catalog",
				parameters: [
					{ name: "q", in: "query", schema: { type: "string", maxLength: 100 } },
					{ name: "category", in: "query", schema: { type: "string", maxLength: 80 } },
					{ name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
					{ name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 12 } },
					{ name: "minPrice", in: "query", schema: { type: "integer", minimum: 0 } },
					{ name: "maxPrice", in: "query", schema: { type: "integer", minimum: 0 } },
					{ name: "availableOnly", in: "query", schema: { type: "boolean", default: false } },
					{ name: "sort", in: "query", schema: { type: "string", enum: ["featured", "newest", "price_asc", "price_desc", "title"] } },
				],
				responses: {
					"200": {
						description: "Catalog page",
						content: { "application/json": { schema: { $ref: "#/components/schemas/CatalogResponse" } } },
					},
					"400": {
						description: "Invalid filters",
						content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
					},
				},
			},
		},
		"/api/books/{id}/read": {
			get: {
				summary: "Read a book when the current account has an active rental or paid purchase",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
				responses: {
					"200": { description: "Private ebook text and current access expiry" },
					"401": { description: "Unauthenticated" },
					"403": { description: "No active rental or paid purchase entitlement" },
					"409": { description: "Ebook text has not been added" },
				},
			},
		},
		"/api/reading/library": {
			get: {
				summary: "List the current account's books available for online reading",
				security: [{ booknestCookie: [] }],
				responses: {
					"200": { description: "Active rentals and permanently owned reading entitlements" },
					"401": { description: "Unauthenticated" },
				},
			},
		},
		"/api/auth/login": {
			post: {
				summary: "Sign in and create a tracked session",
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["email", "password"],
								properties: {
									email: { type: "string", format: "email" },
									password: { type: "string" },
								},
							},
						},
					},
				},
				responses: {
					"200": { description: "Sets HttpOnly session cookie" },
					"401": { description: "Invalid credentials" },
					"429": { description: "Rate limited" },
				},
			},
		},
		"/api/auth/register": {
			post: {
				summary: "Create a customer account",
				responses: {
					"201": { description: "Account created and session cookie set" },
					"409": { description: "Email already exists" },
				},
			},
		},
		"/api/auth/logout": {
			post: {
				summary: "Revoke the current session",
				security: [{ booknestCookie: [] }],
				responses: { "200": { description: "Session revoked and cookie cleared" } },
			},
		},
		"/api/account": {
			get: {
				summary: "Get current account profile",
				security: [{ booknestCookie: [] }],
				responses: { "200": { description: "Account profile" } },
			},
			patch: {
				summary: "Update current account profile",
				security: [{ booknestCookie: [] }],
				responses: { "200": { description: "Profile updated" } },
			},
		},
		"/api/account/sessions": {
			get: {
				summary: "List active sessions for the current account",
				security: [{ booknestCookie: [] }],
				responses: {
					"200": { description: "Active sessions" },
					"401": { description: "Unauthenticated" },
				},
			},
		},
		"/api/account/sessions/{id}": {
			delete: {
				summary: "Revoke an active session belonging to the current account",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
				responses: {
					"200": { description: "Session revoked" },
					"404": { description: "Session not found" },
				},
			},
		},
		"/api/loans": {
			get: {
				summary: "List current account loans; staff may filter by user and status",
				security: [{ booknestCookie: [] }],
				responses: { "200": { description: "Paginated loan list" } },
			},
			post: {
				summary: "Create a library loan",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", minLength: 8, maxLength: 128 } }],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								oneOf: [
									{
										type: "object",
										required: ["bookId", "days"],
										properties: {
											bookId: { type: "string" },
											days: { type: "integer", enum: [7] },
											rentalMode: { type: "string", enum: ["ONLINE", "OFFLINE"], default: "OFFLINE" },
										},
									},
									{
										type: "object",
										required: ["items"],
										properties: {
											rentalMode: { type: "string", enum: ["ONLINE", "OFFLINE"], default: "OFFLINE" },
											items: {
												type: "array",
												maxItems: 20,
												items: {
													type: "object",
													required: ["bookId", "days"],
													properties: { bookId: { type: "string" }, days: { type: "integer", enum: [7] } },
												},
											},
										},
									},
								],
							},
						},
					},
				},
				responses: {
					"201": { description: "Loan created" },
					"409": { description: "Unavailable, queued, or duplicate request" },
				},
			},
		},
		"/api/loans/{id}/return": {
			post: {
				summary: "Return a loan and record the copy condition",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Loan returned and any fine recorded" }, "409": { description: "Loan is no longer active" } },
			},
		},
		"/api/loans/{id}/extend": {
			post: {
				summary: "Extend an active loan",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Loan extended" }, "409": { description: "Loan cannot be extended" } },
			},
		},
		"/api/reservations": {
			get: {
				summary: "List the current account's reservations",
				security: [{ booknestCookie: [] }],
				responses: { "200": { description: "Reservations" } },
			},
			post: {
				summary: "Join a book reservation queue",
				security: [{ booknestCookie: [] }],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["bookId"],
								properties: { bookId: { type: "string" } },
							},
						},
					},
				},
				responses: {
					"201": { description: "Reservation created" },
					"409": { description: "Already reserved or borrowed" },
				},
			},
		},
		"/api/reservations/{id}": {
			delete: {
				summary: "Cancel a reservation owned by the current account",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Reservation cancelled" }, "404": { description: "Reservation not found" } },
			},
		},
		"/api/reservations/{id}/claim": {
			post: {
				summary: "Claim a ready reservation and borrow its copy",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
				responses: { "201": { description: "Reservation claimed as a loan" }, "409": { description: "Reservation is not ready" } },
			},
		},
		"/api/notifications": {
			get: {
				summary: "List notifications",
				security: [{ booknestCookie: [] }],
				responses: { "200": { description: "Notifications and unread count" } },
			},
		},
		"/api/notifications/{id}": {
			patch: {
				summary: "Mark an owned notification as read",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Notification marked as read" }, "404": { description: "Notification not found" } },
			},
		},
		"/api/fines/my": {
			get: {
				summary: "List fines for the current account",
				security: [{ booknestCookie: [] }],
				responses: { "200": { description: "Fine history" } },
			},
		},
		"/api/orders": {
			get: {
				summary: "List purchases for the current account",
				security: [{ booknestCookie: [] }],
				responses: { "200": { description: "Paginated orders" } },
			},
			post: {
				summary: "Create a book purchase with cash, simulation, or explicitly enabled PayOS checkout",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "Idempotency-Key", in: "header", schema: { type: "string", minLength: 8, maxLength: 128 } }],
				responses: { "201": { description: "Order created; PayOS orders include a checkout URL when enabled" }, "409": { description: "Stock unavailable or duplicate request" }, "503": { description: "PayOS is disabled or not configured" } },
			},
		},
		"/api/orders/{id}/checkout": {
			post: {
				summary: "Create or retrieve a PayOS checkout link for an owned pending order",
				security: [{ booknestCookie: [] }],
				parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
				responses: { "200": { description: "Checkout URL" }, "403": { description: "Order is not owned by the current user" }, "409": { description: "Order is not payable" }, "503": { description: "PayOS is disabled or not configured" } },
			},
		},
		"/api/payments/payos/webhook": {
			post: {
				summary: "Receive PayOS payment notifications; signed payloads are verified before updating an order",
				responses: { "200": { description: "Webhook acknowledged" }, "400": { description: "Invalid webhook or signature" }, "409": { description: "Payment does not match the order" } },
			},
		},
		"/api/payments/payos/status": {
			get: {
				summary: "Return whether PayOS checkout is safely enabled and fully configured; does not expose credentials",
				responses: { "200": { description: "PayOS readiness status" } },
			},
		},
		"/api/health/db": {
			get: {
				summary: "Check database availability",
				responses: {
					"200": { description: "Database connected" },
					"503": { description: "Database unavailable" },
				},
			},
		},
	},
} as const;

export async function GET(request: Request) {
	return NextResponse.json({ ...spec, servers: [{ url: new URL(request.url).origin }] }, {
		headers: { "Cache-Control": "no-store" },
	});
}
