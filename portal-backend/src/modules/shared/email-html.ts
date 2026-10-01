// Turns the plain-text emails into a matching branded HTML version. Mail sent
// as text only, with bare links, looks like bulk mail to Gmail and Outlook;
// a proper text + HTML pair with real buttons reads as a company email. Every
// email keeps its plain-text part, so nothing is lost in text-only clients.

const URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g;
const LONE_URL = /^https?:\/\/\S+$/;
const FOOTER_RE = /^You can turn these emails off/;

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function linkify(text: string) {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    out += escapeHtml(text.slice(last, m.index));
    const url = escapeHtml(m[0]);
    out += `<a href="${url}" style="color:#4f46e5;text-decoration:underline;word-break:break-all;">${url}</a>`;
    last = m.index! + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

function button(url: string, appUrl: string) {
  const label = url.startsWith(appUrl) ? "Open in the portal" : "Open link";
  const href = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:8px;background:#4f46e5;">
<a href="${href}" style="display:inline-block;padding:12px 22px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
</td></tr></table>
<p style="margin:0 0 18px;font-size:12px;line-height:18px;color:#6b7280;">If the button doesn't work, copy this link into your browser:<br><a href="${href}" style="color:#4f46e5;word-break:break-all;">${href}</a></p>`;
}

/** The HTML twin of a plain-text email: same words, links as buttons, a branded frame and footer. */
export function renderEmailHtml(input: { subject: string; text: string; appUrl: string; canReply?: boolean }) {
  const blocks: string[] = [];
  let footerNote = "";
  for (const para of input.text.trim().split(/\n{2,}/)) {
    const lines = para.split("\n");
    if (FOOTER_RE.test(para)) {
      footerNote = escapeHtml(para);
      continue;
    }
    // A link on its own line (often after "Open it here:") becomes a button.
    const tail = lines[lines.length - 1].trim();
    if (LONE_URL.test(tail)) {
      const before = lines.slice(0, -1).join("\n").trim();
      if (before && !/^open it in the portal:?$/i.test(before)) blocks.push(`<p style="margin:0 0 12px;">${linkify(before).replace(/\n/g, "<br>")}</p>`);
      blocks.push(button(tail, input.appUrl));
      continue;
    }
    blocks.push(`<p style="margin:0 0 16px;">${linkify(para).replace(/\n/g, "<br>")}</p>`);
  }
  const site = escapeHtml(input.appUrl);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
<tr><td style="padding:20px 28px;border-bottom:1px solid #eef0f3;">
<span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;border-radius:7px;background:#4f46e5;color:#ffffff;font-weight:700;font-size:12px;vertical-align:middle;">IN</span>
<span style="font-weight:600;font-size:16px;vertical-align:middle;margin-left:8px;">Inveon Technologies</span>
</td></tr>
<tr><td style="padding:24px 28px 8px;font-size:15px;line-height:23px;">
<h1 style="margin:0 0 16px;font-size:19px;line-height:26px;font-weight:600;">${escapeHtml(input.subject)}</h1>
${blocks.join("\n")}
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #eef0f3;font-size:12px;line-height:18px;color:#6b7280;">
${footerNote ? `${footerNote}<br>` : ""}Sent by Inveon Technologies from the <a href="${site}" style="color:#6b7280;">Inveon portal</a>.${input.canReply ? " Reply to this email if you have a question." : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
