import net from "node:net";
import { syncBuiltinESMExports } from "node:module";

// This is an accidental-network guard for trusted tests, not a sandbox for hostile extensions.
globalThis.fetch = async () => {
	throw new Error("VERIFICATION_NETWORK_DISABLED");
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
	throw new Error("VERIFICATION_NETWORK_DISABLED");
};
syncBuiltinESMExports();
