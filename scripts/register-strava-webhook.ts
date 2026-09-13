import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { webhookToken } = await import("../lib/stravaWebhook");
  const origin = new URL(
    process.argv[2] ?? process.env.NEXT_PUBLIC_APP_URL ?? "",
  );
  if (origin.protocol !== "https:" || origin.pathname !== "/")
    throw new Error("Provide the production HTTPS origin");
  const client_id = process.env.STRAVA_CLIENT_ID!,
    client_secret = process.env.STRAVA_CLIENT_SECRET!;
  if (!client_id || !client_secret)
    throw new Error("Configure Strava application credentials");
  const callback_url = new URL(
    `/api/strava/events/${webhookToken("callback")}`,
    origin,
  ).toString();
  const verify_token = webhookToken("verify");
  const endpoint = "https://www.strava.com/api/v3/push_subscriptions";
  const response = await fetch(
    `${endpoint}?${new URLSearchParams({ client_id, client_secret })}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!response.ok)
    throw new Error(`Could not inspect subscription (${response.status})`);
  const subscriptions = await response.json();
  if (!Array.isArray(subscriptions))
    throw new Error("Unexpected subscription response");
  if (subscriptions.length) {
    if (
      subscriptions.length === 1 &&
      subscriptions[0].callback_url === callback_url
    ) {
      console.log(
        `Strava notifications already active: subscription ${subscriptions[0].id}`,
      );
      return;
    }
    throw new Error(
      "A different webhook subscription already exists; it was left unchanged",
    );
  }
  const check = new URL(callback_url);
  check.search = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": verify_token,
    "hub.challenge": "rundash-verification",
  }).toString();
  const start = Date.now();
  const verified = await fetch(check, { signal: AbortSignal.timeout(10000) });
  if (
    !verified.ok ||
    (await verified.json())["hub.challenge"] !== "rundash-verification"
  )
    throw new Error("Production callback verification failed");
  console.log(`Callback verified in ${Date.now() - start} ms`);
  const created = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id,
      client_secret,
      callback_url,
      verify_token,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!created.ok)
    throw new Error(
      `Strava subscription creation failed (${created.status}); check the existing subscription before retrying`,
    );
  const result = await created.json();
  console.log(`Strava notifications active: subscription ${result.id}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
