import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";

loadEnvConfig(process.cwd());

const sourceDatabaseUrl = process.env.DATABASE_URL ?? "";
if (!sourceDatabaseUrl) throw new Error("DATABASE_URL must be configured in .env.");

const sourceUrl = new URL(sourceDatabaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(sourceUrl.hostname) || sourceUrl.pathname.replace(/^\//, "") !== "booknest") {
	throw new Error("Refusing to create a test database: DATABASE_URL must point to local database 'booknest'.");
}

const databaseName = `booknest_test_${process.pid}_${Date.now()}`;
if (!/^booknest_test_[0-9]+_[0-9]+$/.test(databaseName)) {
	throw new Error("Generated test database name is invalid.");
}

const admin = new PrismaClient({ datasources: { db: { url: sourceDatabaseUrl } } });
let databaseCreated = false;

function run(command: string, environment: NodeJS.ProcessEnv) {
	const executable = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
	const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-c", command];
	const result = spawnSync(executable, args, {
		cwd: process.cwd(),
		env: environment,
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
}

async function main() {
	try {
		const permissions = await admin.$queryRaw<Array<{ rolcreatedb: boolean }>>`
			SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user
		`;
		if (!permissions[0]?.rolcreatedb) {
			throw new Error("The local PostgreSQL role needs CREATEDB permission for this isolated test command.");
		}

		await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
		databaseCreated = true;
		const testUrl = new URL(sourceDatabaseUrl);
		testUrl.pathname = `/${databaseName}`;
		const environment = {
			...process.env,
			DATABASE_URL: testUrl.toString(),
			TEST_DATABASE_URL: testUrl.toString(),
		};

		run("npx prisma migrate deploy", environment);
		run("npm test", environment);
		console.log("All tests passed against a disposable local PostgreSQL database.");
	} finally {
		await admin.$disconnect();
		if (databaseCreated) {
			const cleanup = new PrismaClient({ datasources: { db: { url: sourceDatabaseUrl } } });
			try {
				await cleanup.$queryRaw`
					SELECT pg_terminate_backend(pid)
					FROM pg_stat_activity
					WHERE datname = ${databaseName} AND pid <> pg_backend_pid()
				`;
				await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${databaseName}"`);
				console.log(`Removed disposable database ${databaseName}.`);
			} finally {
				await cleanup.$disconnect();
			}
		}
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : "Local integration test run failed.");
	process.exitCode = 1;
});
