import { z } from "zod";

export const catalogQuerySchema = z.object({
	q: z.string().trim().max(100).default(""),
	category: z.string().trim().max(80).default(""),
	page: z.coerce.number().int().min(1).max(100_000).default(1),
	limit: z.coerce.number().int().min(1).max(50).default(12),
	minPrice: z.coerce.number().int().min(0).optional(),
	maxPrice: z.coerce.number().int().min(0).optional(),
	availableOnly: z.enum(["true", "false"]).default("false"),
	sort: z.enum(["featured", "newest", "price_asc", "price_desc", "title"]).default("featured"),
}).refine((query) => query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
	message: "minPrice must not exceed maxPrice",
});

export function parseCatalogQuery(params: URLSearchParams) {
	return catalogQuerySchema.safeParse({
		q: params.get("q") ?? "",
		category: params.get("category") ?? "",
		page: params.get("page") ?? 1,
		limit: params.get("limit") ?? 12,
		minPrice: params.has("minPrice") ? params.get("minPrice") : undefined,
		maxPrice: params.has("maxPrice") ? params.get("maxPrice") : undefined,
		availableOnly: params.get("availableOnly") ?? "false",
		sort: params.get("sort") ?? "featured",
	});
}
