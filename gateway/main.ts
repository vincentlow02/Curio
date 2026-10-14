import { createRakutenGatewayServer } from "./rakuten-gateway";

const portValue = Number(process.env.PORT ?? 3001);
const port = Number.isInteger(portValue) && portValue > 0 && portValue <= 65_535 ? portValue : 3001;
const host = process.env.HOST?.trim() || "0.0.0.0";
const server = createRakutenGatewayServer();

server.listen(port, host, () => {
  console.log("rakuten_gateway_started");
});

const shutdown = (): void => {
  server.close(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);