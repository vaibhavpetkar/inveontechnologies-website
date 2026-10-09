import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, Eye, ImageUp, PenLine, Plus, RotateCcw, Save, Stamp, Trash2, UserCog } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { openPdf, type Policy } from "../../lib/letters";
import { readImageFile, type BrandPreviews, type CompanyProfile, type Signatory } from "../../lib/settings";
import { useToast } from "../Toast";
import { PanelSkeleton, ReadOnlyNote, Switch } from "./ui";

/** The company details printed on every letter, offer and policy PDF. */
export function CompanyTab() {
  const { accessToken } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [previews, setPreviews] = useState<BrandPreviews>({ logo: null, seal: null });
  // The bundled Inveon images, remembered so "Use the Inveon default" can show them before saving.
  const defaults = useRef<BrandPreviews>({ logo: null, seal: null });
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    apiFetch<{ profile: CompanyProfile; previews: BrandPreviews; canEdit: boolean }>("/api/v1/settings/company", { accessToken })
      .then((r) => {
        setProfile(r.profile);
        setPreviews(r.previews);
        rememberDefaults(r.profile, r.previews);
        setCanEdit(r.canEdit);
      })
      .catch(() => setError("Couldn't load the company details."));
  }, [accessToken]);

  function rememberDefaults(p: CompanyProfile, pv: BrandPreviews) {
    if (!p.logo && pv.logo) defaults.current.logo = pv.logo;
    if (!p.seal && pv.seal) defaults.current.seal = pv.seal;
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (!profile) return <PanelSkeleton height={520} />;

  function set<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setProfile((p) => (p ? { ...p, [key]: value } : p));
    setDirty(true);
  }
  function setSignatory(i: number, patch: Partial<Signatory>) {
    set("signatories", profile!.signatories.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }
  /** Shows an uploaded image straight away; the server's preview replaces it after saving. */
  function setImage(key: "logo" | "seal", dataUrl: string | null) {
    set(key, dataUrl);
    setPreviews((p) => ({ ...p, [key]: dataUrl ?? defaults.current[key] }));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const r = await apiFetch<{ profile: CompanyProfile; previews: BrandPreviews }>("/api/v1/settings/company", { method: "PUT", body: profile, accessToken });
      setProfile(r.profile);
      setPreviews(r.previews);
      rememberDefaults(r.profile, r.previews);
      setDirty(false);
      toast("Company details saved. New letters and PDFs use them.");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save the company details.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function previewPolicy() {
    setPreviewing(true);
    try {
      const r = await apiFetch<{ policies: Policy[] }>("/api/v1/policies", { accessToken });
      const policy = r.policies.find((p) => p.active) ?? r.policies[0];
      if (!policy) {
        toast("There are no company policies yet to preview.", "error");
        return;
      }
      await openPdf(`/api/v1/policies/${policy.id}/pdf`, accessToken);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't open the preview.", "error");
    } finally {
      setPreviewing(false);
    }
  }

  const sigCount = profile.signatories.length;

  return (
    <motion.form className="st-stack" onSubmit={save} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <p className="st-lead">These details print on every appointment letter, internship offer and policy PDF.</p>
      {!canEdit && <ReadOnlyNote />}

      <fieldset disabled={!canEdit} className="st-fieldset">
        <section className="panel">
          <h2 className="st-panel-title"><Building2 size={18} /> Company</h2>
          <div className="field-row field-row-2 even">
            <div className="field"><label htmlFor="co-name">Company name</label><input id="co-name" required minLength={2} maxLength={120} value={profile.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="field"><label htmlFor="co-email">Email</label><input id="co-email" type="email" required maxLength={200} value={profile.email} onChange={(e) => set("email", e.target.value)} /></div>
          </div>
          <div className="field-row field-row-2 even">
            <div className="field"><label htmlFor="co-phone">Phone</label><input id="co-phone" type="tel" maxLength={40} value={profile.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 …" /></div>
            <div className="field"><label htmlFor="co-web">Website</label><input id="co-web" maxLength={200} value={profile.website} onChange={(e) => set("website", e.target.value)} placeholder="www.example.in" /></div>
          </div>
          <div className="field">
            <label htmlFor="co-addr">Address</label>
            <textarea id="co-addr" rows={2} maxLength={400} value={profile.address} onChange={(e) => set("address", e.target.value)} />
          </div>
        </section>

        <section className="panel">
          <h2 className="st-panel-title"><PenLine size={18} /> Who signs</h2>
          <p className="muted-small st-panel-sub">One to three people sign every letter. Their names and titles print under the signature lines.</p>
          <AnimatePresence initial={false}>
            {profile.signatories.map((s, i) => (
              <motion.div key={i} className="st-person-row" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className="field"><label htmlFor={`sig-name-${i}`}>Signatory {i + 1} name</label><input id={`sig-name-${i}`} required minLength={2} maxLength={120} value={s.name} onChange={(e) => setSignatory(i, { name: e.target.value })} /></div>
                <div className="field"><label htmlFor={`sig-title-${i}`}>Title</label><input id={`sig-title-${i}`} required minLength={2} maxLength={120} value={s.title} onChange={(e) => setSignatory(i, { title: e.target.value })} placeholder="e.g. Partner & Authorized Signatory" /></div>
                {canEdit && (
                  <button type="button" className="icon-button st-row-remove" aria-label={`Remove signatory ${i + 1}`} title={sigCount === 1 ? "At least one person must sign" : "Remove"} disabled={sigCount === 1} onClick={() => set("signatories", profile.signatories.filter((_, j) => j !== i))}>
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {canEdit && sigCount < 3 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set("signatories", [...profile.signatories, { name: "", title: "" }])}>
              <Plus size={14} /> Add a signatory
            </button>
          )}

          <div className="st-divider" />
          <Switch
            id="co-pm"
            checked={!!profile.projectManager}
            disabled={!canEdit}
            onChange={(on) => set("projectManager", on ? { name: "", title: "Project Manager" } : null)}
            label={<><UserCog size={15} /> Project manager signs internship offers</>}
            hint="Signs next to the partners on offer letters. Turned off, offers leave a blank line for a name."
          />
          <AnimatePresence initial={false}>
            {profile.projectManager && (
              <motion.div className="field-row field-row-2 even st-pm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <div className="field"><label htmlFor="pm-name">Project manager name</label><input id="pm-name" required minLength={2} maxLength={120} value={profile.projectManager.name} onChange={(e) => set("projectManager", { ...profile.projectManager!, name: e.target.value })} /></div>
                <div className="field"><label htmlFor="pm-title">Title</label><input id="pm-title" required minLength={2} maxLength={120} value={profile.projectManager.title} onChange={(e) => set("projectManager", { ...profile.projectManager!, title: e.target.value })} /></div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="panel">
          <h2 className="st-panel-title"><Stamp size={18} /> Logo and seal</h2>
          <p className="muted-small st-panel-sub">PNG or JPEG, under 1 MB. A transparent PNG looks best.</p>
          <div className="st-brand-grid">
            <BrandImage label="Logo" kind="logo" custom={profile.logo} preview={previews.logo} canEdit={canEdit} onChange={(v) => setImage("logo", v)} />
            <BrandImage label="Seal" kind="seal" custom={profile.seal} preview={previews.seal} canEdit={canEdit} onChange={(v) => setImage("seal", v)} />
          </div>
          <div className="st-divider" />
          <Switch id="co-wm" checked={profile.watermark} disabled={!canEdit} onChange={(v) => set("watermark", v)} label="Show the logo watermark on letters" hint="A faint Inveon mark behind the text of each page." />
        </section>
      </fieldset>

      {canEdit && (
        <div className="st-savebar">
          <button className="btn" disabled={saving || !dirty}><Save size={16} /> {saving ? "Saving…" : "Save company details"}</button>
          {!dirty && (
            <button type="button" className="btn btn-secondary" disabled={previewing} onClick={previewPolicy}>
              <Eye size={16} /> {previewing ? "Opening…" : "Preview a policy PDF"}
            </button>
          )}
          <span className="muted-small">{dirty ? "You have unsaved changes." : "Letters already sent keep the details they were made with."}</span>
        </div>
      )}
    </motion.form>
  );
}

function BrandImage({ label, kind, custom, preview, canEdit, onChange }: { label: string; kind: "logo" | "seal"; custom: string | null; preview: string | null; canEdit: boolean; onChange: (dataUrl: string | null) => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      onChange(await readImageFile(file));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't use that image.", "error");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="st-brand">
      <div className="st-brand-head">
        <strong>{label}</strong>
        <span className={`pill ${custom ? "pill-blue" : "pill-slate"}`}>{custom ? "Your upload" : "Inveon default"}</span>
      </div>
      <div className={`st-brand-preview st-brand-${kind}`}>
        {preview ? <img src={preview} alt={`${label} preview`} /> : <span className="muted-small">No image</span>}
      </div>
      {canEdit && (
        <div className="st-brand-actions">
          <input ref={input} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()}><ImageUp size={14} /> Upload {label.toLowerCase()}</button>
          {custom && <button type="button" className="link-button" onClick={() => onChange(null)}><RotateCcw size={13} /> Use the Inveon default</button>}
        </div>
      )}
      {!custom && preview === null && <span className="muted-small">The Inveon default shows here after you save.</span>}
    </div>
  );
}
