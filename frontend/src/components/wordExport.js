const STYLE_PROPS = ["font-size", "font-weight", "font-style", "text-align", "text-transform", "color", "vertical-align", "white-space", "line-height"];
const BOX_PROPS = ["padding-top", "padding-right", "padding-bottom", "padding-left", "border-top", "border-right", "border-bottom", "border-left"];
const BOUNDARY = "----=_NextPart_Tudung_Word";
const b64utf8 = (s) => btoa(unescape(encodeURIComponent(s)));
const wrap76 = (s) => s.replace(/.{1,76}/g, "$&\r\n");

const svgToPng = (svg) => new Promise((resolve) => {
  const { width, height } = svg.getBoundingClientRect();
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = width * 2; c.height = height * 2;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.scale(2, 2); ctx.drawImage(img, 0, 0, width, height);
    resolve({ src: c.toDataURL("image/png"), width, height });
  };
  img.onerror = () => resolve(null);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
});

const inlineStyles = (orig, clone) => {
  const o = [orig, ...orig.querySelectorAll("*")];
  const c = [clone, ...clone.querySelectorAll("*")];
  o.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const t = c[i];
    if (cs.display === "none" || el.classList.contains("no-print")) { t.setAttribute("data-word-remove", "1"); return; }
    if (t.tagName === "svg" || el.closest("svg")) return;
    if (el.classList.contains("report-next-page")) t.setAttribute("data-word-break", "1");
    const props = [...STYLE_PROPS, ...(["TD", "TH"].includes(el.tagName) ? BOX_PROPS : [])];
    let st = props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
    if (cs.textDecorationLine && cs.textDecorationLine !== "none") st += `;text-decoration:${cs.textDecorationLine}`;
    if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") st += `;background:${cs.backgroundColor}`;
    if (el.tagName === "P" || el.tagName === "LI") st += `;margin:0 0 ${cs.marginBottom} 0`;
    t.setAttribute("style", st);
    t.removeAttribute("class");
  });
};

const signaturesToTable = (root) => {
  root.querySelectorAll('[data-testid="report-signatures"]').forEach((sig) => {
    const tbl = document.createElement("table");
    tbl.setAttribute("width", "100%");
    tbl.setAttribute("style", "width:100%;margin-top:24pt;border-collapse:collapse;page-break-inside:avoid");
    const tr = tbl.insertRow();
    [...sig.children].forEach((col) => {
      const td = tr.insertCell();
      td.setAttribute("width", "50%");
      td.setAttribute("style", "width:50%;text-align:center;vertical-align:top;border:none;font-size:10pt");
      td.innerHTML = col.innerHTML;
      td.querySelectorAll("div").forEach((d) => {
        if (!d.querySelector("img") && !d.textContent.trim()) d.outerHTML = '<p style="margin:0;line-height:55pt">&nbsp;</p>';
        else d.setAttribute("style", "text-align:center");
      });
    });
    sig.replaceWith(tbl);
  });
};

export async function exportWord({ fileName, pw, ph, landscape }) {
  const src = document.querySelector('[data-testid="report-paper"]');
  if (!src) return;
  const clone = src.cloneNode(true);
  inlineStyles(src, clone);
  const origSvgs = [...src.querySelectorAll("svg.recharts-surface")];
  const cloneSvgs = [...clone.querySelectorAll("svg.recharts-surface")];
  const pngs = await Promise.all(origSvgs.map(svgToPng));
  cloneSvgs.forEach((s, i) => {
    if (!pngs[i]) return s.remove();
    const img = document.createElement("img");
    img.src = pngs[i].src; img.width = Math.round(pngs[i].width); img.height = Math.round(pngs[i].height);
    s.replaceWith(img);
  });
  clone.querySelectorAll("svg").forEach((s) => s.remove());
  clone.querySelectorAll("[data-word-remove]").forEach((e) => e.remove());
  const maxW = Math.round(((pw - 20) * 96) / 25.4);
  const oImgs = [...src.querySelectorAll("img")].filter((i) => i.offsetWidth);
  [...clone.querySelectorAll("img")].forEach((img) => {
    const o = oImgs.find((x) => x.src === img.src);
    let w = img.width || o?.offsetWidth || 100;
    let h = img.height || o?.offsetHeight || 60;
    if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
    img.setAttribute("width", w); img.setAttribute("height", h); img.removeAttribute("style");
  });
  signaturesToTable(clone);
  clone.querySelectorAll("[data-word-break]").forEach((p) => {
    p.insertAdjacentHTML("beforebegin", '<br clear="all" style="page-break-before:always">');
  });
  clone.querySelectorAll("table").forEach((t) => { if (!t.getAttribute("width")) t.setAttribute("width", "100%"); t.style.borderCollapse = "collapse"; });
  const parts = [];
  clone.querySelectorAll("img").forEach((img, i) => {
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/.exec(img.getAttribute("src") || "");
    if (!m) return;
    const ext = m[1].split("/")[1].replace("jpeg", "jpg");
    const loc = `file:///C:/tudung/gambar${i + 1}.${ext}`;
    parts.push({ loc, type: m[1], data: m[2] });
    img.setAttribute("src", loc);
  });
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${fileName}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
@page Section1 { size: ${pw}mm ${ph}mm; margin: 10mm 10mm 12mm 10mm; mso-page-orientation: ${landscape ? "landscape" : "portrait"}; }
div.Section1 { page: Section1; }
body { font-family: Arial, sans-serif; }
table { border-collapse: collapse; }
p { margin: 0; }
</style></head>
<body><div class="Section1">${clone.innerHTML}</div></body></html>`;
  let mht = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${BOUNDARY}"; type="text/html"\r\n\r\n`;
  mht += `--${BOUNDARY}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\nContent-Location: file:///C:/tudung/laporan.htm\r\n\r\n${wrap76(b64utf8(html))}\r\n`;
  parts.forEach((p) => { mht += `--${BOUNDARY}\r\nContent-Type: ${p.type}\r\nContent-Transfer-Encoding: base64\r\nContent-Location: ${p.loc}\r\n\r\n${wrap76(p.data)}\r\n`; });
  mht += `--${BOUNDARY}--\r\n`;
  const blob = new Blob([mht], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileName}.doc`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
