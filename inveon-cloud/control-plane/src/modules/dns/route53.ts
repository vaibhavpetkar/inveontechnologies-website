import type { AwsCredentialsInput } from "../aws/provider.js";

/**
 * The slice of Route 53 that DNS-01 challenges need. The real
 * implementation (route53-sdk.ts) uses the AWS SDK v3 with the
 * organization's AWS connection; tests swap in a fake with
 * setRoute53ApiFactory, so the suite never calls AWS.
 */
export interface Route53Api {
  /** The public hosted zone named exactly `name` (no trailing dot), or null. */
  findZone(name: string): Promise<{ id: string; name: string } | null>;
  /** Sets (UPSERT) or deletes (DELETE, with its exact current values) the TXT record set; returns the change id. */
  changeTxt(zoneId: string, action: "UPSERT" | "DELETE", name: string, values: string[], ttl: number): Promise<string>;
  changeStatus(changeId: string): Promise<"PENDING" | "INSYNC">;
}

export type Route53ApiFactory = (creds: AwsCredentialsInput) => Route53Api;

let factory: Route53ApiFactory | null = null;

export function setRoute53ApiFactory(f: Route53ApiFactory | null) {
  factory = f;
}

export async function route53Api(creds: AwsCredentialsInput): Promise<Route53Api> {
  if (factory) return factory(creds);
  const { sdkRoute53Api } = await import("./route53-sdk.js");
  return sdkRoute53Api(creds);
}
