import { prisma } from "../src/lib/prisma";
import { reconcileExpiredPayosOrders } from "../src/lib/payos-orders";
import { runScheduledLibraryJobs } from "../src/lib/scheduled-jobs";

const intervalSeconds = Number(process.env.LIBRARY_WORKER_INTERVAL_SECONDS ?? 60);
if (!Number.isInteger(intervalSeconds) || intervalSeconds < 10 || intervalSeconds > 3600) {
	throw new Error("LIBRARY_WORKER_INTERVAL_SECONDS must be an integer between 10 and 3600");
}

let activeRun: Promise<void> | null = null;
let stopping = false;

async function runOnce() {
	if (activeRun || stopping) return;
	activeRun = (async () => {
		const startedAt = Date.now();
		try {
			const result = await prisma.$transaction((tx) => runScheduledLibraryJobs(tx), { maxWait: 10_000, timeout: 60_000 });
			const expiredPayosOrders = await reconcileExpiredPayosOrders();
			console.log(JSON.stringify({
				event: "library_worker_completed",
				dueLoanNotifications: result.dueLoanNotifications,
				expiredOnlineRentals: result.expiredOnlineRentals,
				forfeitedDeposits: result.forfeitedDeposits,
				expiredPayosOrders,
				durationMs: Date.now() - startedAt,
				timestamp: new Date().toISOString(),
			}));
		} catch (error) {
			console.error(JSON.stringify({
				event: "library_worker_failed",
				errorName: error instanceof Error ? error.name : "UnknownError",
				durationMs: Date.now() - startedAt,
				timestamp: new Date().toISOString(),
			}));
		}
	})();
	try {
		await activeRun;
	} finally {
		activeRun = null;
	}
}

const timer = setInterval(() => void runOnce(), intervalSeconds * 1000);
console.log(JSON.stringify({ event: "library_worker_started", intervalSeconds, timestamp: new Date().toISOString() }));
void runOnce();

async function shutdown(signal: string) {
	if (stopping) return;
	stopping = true;
	clearInterval(timer);
	if (activeRun) await activeRun;
	await prisma.$disconnect();
	console.log(JSON.stringify({ event: "library_worker_stopped", signal, timestamp: new Date().toISOString() }));
	process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
