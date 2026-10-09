import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../shared/db/client.js";
import { portalSettings } from "../shared/db/schema.js";
import { logger } from "../shared/logger.js";

/**
 * The company details printed on every letter and policy: name, contacts,
 * address, who signs, and the logo and seal. Admins edit them in Settings;
 * letters read the cached copy, so rendering a PDF needs no extra query.
 */
const COMPANY_KEY = "company_profile";
const IMAGE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

const person = z.object({ name: z.string().trim().min(2).max(120), title: z.string().trim().min(2).max(120) });

export const companyProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40),
  website: z.string().trim().max(200),
  address: z.string().trim().max(400),
  signatories: z.array(person).min(1).max(3),
  // Signs internship offers next to the partners. Left blank, offers leave the line for a name.
  projectManager: person.nullable(),
  // Uploaded replacements for the bundled logo and seal, as PNG or JPEG data URLs.
  logo: z.string().max(1_400_000).regex(IMAGE, "Use a PNG or JPEG image").nullable(),
  seal: z.string().max(1_400_000).regex(IMAGE, "Use a PNG or JPEG image").nullable(),
  watermark: z.boolean(),
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

let defaultAddress = "Pandharpur, Maharashtra, India";

export function defaultCompanyProfile(): CompanyProfile {
  return {
    name: "Inveon Technologies",
    email: "office.inveontech@gmail.com",
    phone: "+91 7030411076",
    website: "www.inveontechnologies.in",
    address: defaultAddress,
    signatories: [
      { name: "Vedant Santosh Pawar", title: "Partner & Authorized Signatory" },
      { name: "Omkar Manish Kumbhar", title: "Partner & Authorized Signatory" },
    ],
    projectManager: null,
    logo: null,
    seal: null,
    watermark: true,
  };
}

let cached: CompanyProfile = defaultCompanyProfile();

/** PORTAL_COMPANY_ADDRESS, when set, is the address until an admin saves the profile. */
export function configureCompanyDefaults(options: { address?: string | null }) {
  if (options.address?.trim()) defaultAddress = options.address.trim();
  cached = { ...cached, address: defaultAddress };
}

export const companyProfile = () => cached;

export async function loadCompanyProfile(db: Database): Promise<CompanyProfile> {
  try {
    const row = await db.query.portalSettings.findFirst({ where: eq(portalSettings.key, COMPANY_KEY) });
    const parsed = companyProfileSchema.safeParse(row?.value);
    cached = parsed.success ? parsed.data : defaultCompanyProfile();
  } catch (err) {
    logger.error({ err }, "Could not load the company profile; letters use the defaults");
  }
  return cached;
}

export async function saveCompanyProfile(db: Database, profile: CompanyProfile, actorUserId: string) {
  await db
    .insert(portalSettings)
    .values({ key: COMPANY_KEY, value: profile, updatedBy: actorUserId })
    .onConflictDoUpdate({ target: portalSettings.key, set: { value: profile, updatedBy: actorUserId, updatedAt: new Date() } });
  cached = profile;
  return cached;
}

// ---- Brand images ----

const assetUrl = (name: string) => new URL(`../../assets/brand/${name}`, import.meta.url);
const bundled = new Map<string, Promise<Buffer>>();
function bundledAsset(name: string) {
  if (!bundled.has(name)) bundled.set(name, readFile(assetUrl(name)));
  return bundled.get(name)!;
}

export interface BrandImage {
  bytes: Uint8Array;
  type: "png" | "jpeg";
}

function fromDataUrl(url: string): BrandImage {
  const [, type, data] = url.match(/^data:image\/(png|jpeg);base64,(.+)$/)!;
  return { bytes: Buffer.from(data, "base64"), type: type as "png" | "jpeg" };
}

/** The logo, seal and watermark to draw on letters: uploaded ones when set, else the bundled Inveon artwork. */
export async function brandImages(profile = cached): Promise<{ logo: BrandImage | null; seal: BrandImage | null; watermark: BrandImage | null }> {
  const load = async (custom: string | null, file: string, type: "png" | "jpeg"): Promise<BrandImage | null> => {
    if (custom) return fromDataUrl(custom);
    try {
      return { bytes: await bundledAsset(file), type };
    } catch (err) {
      logger.warn({ err, file }, "Brand image missing; letters print without it");
      return null;
    }
  };
  return {
    logo: await load(profile.logo, "logo.png", "png"),
    seal: await load(profile.seal, "seal.png", "png"),
    watermark: profile.watermark ? await load(null, "watermark.jpg", "jpeg") : null,
  };
}

/** Data URLs of the images in use, for the settings form's previews. */
export async function brandPreviews(profile = cached) {
  const images = await brandImages({ ...profile, watermark: false });
  const url = (i: BrandImage | null) => (i ? `data:image/${i.type};base64,${Buffer.from(i.bytes).toString("base64")}` : null);
  return { logo: url(images.logo), seal: url(images.seal) };
}
