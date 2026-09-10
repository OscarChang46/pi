import net from "node:net";
import { syncBuiltinESMExports } from "node:module";

// Real Host/TUI tests require literal loopback HTTP. DNS and off-host traffic remain forbidden.
// This is an accidental-network guard for trusted tests, not a sandbox for hostile extensions.
const loopback = new Set(["127.0.0.1", "::1", "[::1]"]);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = new URL(input instanceof Request ? input.url : input);
	if (!["http:", "https:"].includes(url.protocol) || !loopback.has(url.hostname))
		throw new Error("VERIFICATION_NETWORK_DISABLED");
	return originalFetch(input, { ...init, redirect: "error" });
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
	const target = args[0];
	const normalized = Array.isArray(target) ? target[0] : target;
	if (
		(typeof normalized === "string" && Number.isNaN(Number(normalized))) ||
		(normalized && typeof normalized === "object" && normalized.path && !normalized.port)
	)
		return connect.apply(this, args);
	const host = normalized && typeof normalized === "object" ? normalized.host : args[1];
	if (loopback.has(host)) return connect.apply(this, args);
	throw new Error("VERIFICATION_NETWORK_DISABLED");
};
syncBuiltinESMExports();
