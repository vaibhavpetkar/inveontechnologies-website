import { ChangeResourceRecordSetsCommand, GetChangeCommand, ListHostedZonesByNameCommand, Route53Client } from "@aws-sdk/client-route-53";
import { credentialProvider } from "../aws/sdk.js";
import type { AwsCredentialsInput } from "../aws/provider.js";
import type { Route53Api } from "./route53.js";

/** Route 53 is global; its API lives in us-east-1. */
const REGION = "us-east-1";

/** TXT values are quoted strings in Route 53 (each at most 255 characters; ACME values are 43). */
const quote = (v: string) => `"${v.replace(/["\\]/g, "")}"`;

export function sdkRoute53Api(input: AwsCredentialsInput): Route53Api {
  const client = new Route53Client({ region: REGION, credentials: credentialProvider(input, REGION) });
  return {
    async findZone(name) {
      const out = await client.send(new ListHostedZonesByNameCommand({ DNSName: name, MaxItems: 5 }));
      const zone = (out.HostedZones ?? []).find((z) => z.Name === `${name}.` && !z.Config?.PrivateZone);
      return zone?.Id ? { id: zone.Id.replace(/^\/hostedzone\//, ""), name } : null;
    },
    async changeTxt(zoneId, action, name, values, ttl) {
      const out = await client.send(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: zoneId,
          ChangeBatch: {
            Comment: "inveon-cloud ACME DNS-01 challenge",
            Changes: [{ Action: action, ResourceRecordSet: { Name: name, Type: "TXT", TTL: ttl, ResourceRecords: values.map((v) => ({ Value: quote(v) })) } }],
          },
        }),
      );
      return out.ChangeInfo?.Id?.replace(/^\/change\//, "") ?? "";
    },
    async changeStatus(changeId) {
      const out = await client.send(new GetChangeCommand({ Id: changeId }));
      return out.ChangeInfo?.Status === "INSYNC" ? "INSYNC" : "PENDING";
    },
  };
}
