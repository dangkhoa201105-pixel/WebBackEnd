import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCatalogQuery } from "../src/lib/catalog";

test("catalog filters default safely and accept supported filters", () => {
	const result = parseCatalogQuery(new URLSearchParams("q=clean&category=Technology&page=2&limit=10&minPrice=1000&maxPrice=5000&availableOnly=true&sort=price_asc"));
	assert.equal(result.success, true);
	if (!result.success) return;
	assert.deepEqual(result.data, {
		q: "clean",
		category: "Technology",
		page: 2,
		limit: 10,
		minPrice: 1000,
		maxPrice: 5000,
		availableOnly: "true",
		sort: "price_asc",
	});
});

test("catalog filters reject invalid pagination, sort, and inverted price ranges", () => {
	assert.equal(parseCatalogQuery(new URLSearchParams("page=0")).success, false);
	assert.equal(parseCatalogQuery(new URLSearchParams("limit=51")).success, false);
	assert.equal(parseCatalogQuery(new URLSearchParams("sort=unknown")).success, false);
	assert.equal(parseCatalogQuery(new URLSearchParams("minPrice=5000&maxPrice=1000")).success, false);
});
