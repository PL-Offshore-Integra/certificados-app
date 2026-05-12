import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase";

const PORTAL_URL = "https://erp-portal-fawn.vercel.app";
const ERP_HOME_URL = "https://erp-home-nine.vercel.app";
const BUQUES = ["Atlantic Dama", "Golondrina de Mar"];
const SECCIONES_ESTAT = ["GENERAL", "MARPOL", "INSURANCE", "OTHER"];
const SECCIONES_NOESTAT = ["FFA", "EQUIPO SALVAMENTO", "EQUIPO DE CARGAMENTO Y CUBIERTA", "PUENTE", "MAQUINAS", "AMARRE", "OTROS"];
const SECCION_LABEL = {
  GENERAL: "General", MARPOL: "MARPOL", INSURANCE: "Seguros", OTHER: "Otros",
  FFA: "Equipo FFA", "EQUIPO SALVAMENTO": "Salvamento",
  "EQUIPO DE CARGAMENTO Y CUBIERTA": "Cargamento / Cubierta",
  PUENTE: "Puente", MAQUINAS: "Máquinas", AMARRE: "Amarre", OTROS: "Otros",
};

const fmtDate = d => d ? new Date(d + "T00:00:00").toLocaleDateString("es-AR") : "—";

function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr + "T00:00:00");
  return Math.round((fecha - hoy) / (1000 * 60 * 60 * 24));
}
function getAlertColor(dias) {
  if (dias === null) return null;
  if (dias < 0) return "vencido";
  if (dias <= 30) return "critico";
  if (dias <= 90) return "proximo";
  return "ok";
}
function fechaDefault90() { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10); }
function fechaHoy() { return new Date().toISOString().slice(0, 10); }

// ─── API ──────────────────────────────────────────────────────────────────────
const api = {
  async getCertificados() {
    const { data, error } = await supabase.from("certificados").select("*").eq("activo", true).order("buque").order("tipo").order("seccion").order("orden").order("descripcion");
    if (error) throw error;
    return data || [];
  },
  async updateCertificado(id, cambios) {
    const { data, error } = await supabase.from("certificados").update(cambios).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async insertCertificado(cert) {
    const { data, error } = await supabase.from("certificados").insert([cert]).select().single();
    if (error) throw error;
    return data;
  },
  async deleteCertificado(id) {
    const { error } = await supabase.from("certificados").update({ activo: false }).eq("id", id);
    if (error) throw error;
  },
  async subirDocumento(file, certId) {
    const ext = file.name.split(".").pop();
    const path = `documentos/${certId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("certificados").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("certificados").getPublicUrl(path);
    return { url: data.publicUrl, nombre: file.name };
  },
  async getAllSubvencimientos() {
    const { data, error } = await supabase.from("subvencimientos").select("*").order("fecha_desde");
    if (error) throw error;
    return data || [];
  },
  async insertSubvencimiento(sv) {
    const { data, error } = await supabase.from("subvencimientos").insert([sv]).select().single();
    if (error) throw error;
    return data;
  },
  async updateSubvencimiento(id, cambios) {
    const { data, error } = await supabase.from("subvencimientos").update(cambios).eq("id", id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteSubvencimiento(id) {
    const { error } = await supabase.from("subvencimientos").delete().eq("id", id);
    if (error) throw error;
  },
  async subirDocSubvencimiento(file, svId) {
    const ext = file.name.split(".").pop();
    const path = `subvencimientos/${svId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("certificados").upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("certificados").getPublicUrl(path);
    return { url: data.publicUrl, nombre: file.name };
  },
  async updateOrden(updates) {
    const promises = updates.map(u => supabase.from("certificados").update({ orden: u.orden }).eq("id", u.id));
    await Promise.all(promises);
  },
};

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#213363;--blue:#235C96;--mid:#6381A7;--light:#A5B5CC;
  --bg:#F0F4F8;--surface:#FFF;--surface2:#F5F7FA;--border:#D6E0ED;
  --text:#213363;--muted:#6381A7;--muted2:#8FA3BC;
  --accent:#235C96;--accent2:#1E7A4A;--warn:#B07D0A;--danger:#C0392B;--orange:#C05621;
  --sans:'Montserrat',sans-serif;--mono:'DM Mono',monospace;--r:6px;--r2:10px;
}
body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:14px;line-height:1.5;min-height:100vh}
.app{display:flex;min-height:100vh}
.sidebar{width:240px;min-width:240px;background:var(--navy);display:flex;flex-direction:column;box-shadow:2px 0 8px rgba(33,51,99,.15);transition:transform .25s}
.sidebar-header{border-bottom:1px solid rgba(255,255,255,.1)}
.sidebar-logo-wrap{padding:18px 16px 14px;display:flex;align-items:center;gap:12px}
.sidebar-logo-img{width:34px;height:34px;object-fit:cover;border-radius:50%;border:2px solid rgba(255,255,255,.2)}
.sidebar-logo-main{font-size:12px;font-weight:700;color:#fff;letter-spacing:2px;text-transform:uppercase}
.sidebar-logo-sub{font-size:9px;color:rgba(255,255,255,.5);letter-spacing:.5px}
.nav-section{padding:10px 16px 3px;font-family:var(--mono);font-size:9px;letter-spacing:2px;color:rgba(255,255,255,.3);text-transform:uppercase}
.ni{display:flex;align-items:center;gap:8px;padding:6px 16px;font-size:12px;font-weight:500;cursor:pointer;color:rgba(255,255,255,.6);border-left:3px solid transparent;transition:all .12s;user-select:none}
.ni:hover{color:#fff;background:rgba(255,255,255,.06)}
.ni.active{color:#fff;border-left-color:var(--light);background:rgba(255,255,255,.1);font-weight:600}
.ni.sub{padding-left:28px;font-size:11px;font-weight:400}
.ni.sub.active{font-weight:600}
.ni.back{color:rgba(255,255,255,.4);font-size:11px;border-top:1px solid rgba(255,255,255,.08);margin-top:4px}
.ni.back:hover{color:rgba(255,255,255,.8)}
.ni-icon{font-size:12px;width:15px;text-align:center;flex-shrink:0}
.ni-badge{margin-left:auto;background:var(--danger);color:#fff;font-family:var(--mono);font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;min-width:18px;text-align:center}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:10px 20px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 1px 3px rgba(33,51,99,.06);flex-wrap:wrap;gap:8px}
.topbar-title{font-size:12px;font-weight:600;letter-spacing:1px;color:var(--navy);text-transform:uppercase}
.content{flex:1;overflow-y:auto;padding:18px 20px;background:var(--bg)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:18px;margin-bottom:14px;box-shadow:0 1px 4px rgba(33,51,99,.06)}
.card-title{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:14px 16px}
.stat-label{font-size:10px;color:var(--muted);font-weight:600;letter-spacing:.5px;margin-bottom:5px;text-transform:uppercase}
.stat-value{font-family:var(--mono);font-size:26px;font-weight:600}
.sv-stat{color:var(--blue)}.sr{color:var(--danger)}.sw{color:var(--warn)}
.badge{display:inline-flex;align-items:center;font-family:var(--mono);font-size:9px;font-weight:600;padding:3px 8px;border-radius:4px;white-space:nowrap;letter-spacing:.3px}
.b-red{background:#FEE2E2;color:#991B1B;border:1px solid #FECACA}
.b-orange{background:#FFEDD5;color:#9A3412;border:1px solid #FED7AA}
.b-amber{background:#FEF3C7;color:#92400E;border:1px solid #FDE68A}
.b-green{background:#D1FAE5;color:#065F46;border:1px solid #A7F3D0}
.b-gray{background:#F3F4F6;color:#6B7280;border:1px solid #E5E7EB}
.b-blue{background:#DBEAFE;color:#1E40AF;border:1px solid #BFDBFE}
.b-navy{background:var(--navy);color:#fff;border:1px solid var(--navy)}
.b-teal{background:#CCFBF1;color:#0F766E;border:1px solid #99F6E4}
.btn{display:inline-flex;align-items:center;gap:6px;font-family:var(--sans);font-size:11px;font-weight:600;letter-spacing:.3px;padding:7px 14px;border-radius:var(--r);border:1px solid transparent;cursor:pointer;transition:all .15s;white-space:nowrap;text-transform:uppercase}
.btn-primary{background:var(--blue);color:#fff}.btn-primary:hover{background:var(--navy)}
.btn-danger{background:transparent;color:var(--danger);border-color:var(--danger)}.btn-danger:hover{background:#FEE2E2}
.btn-ghost{background:transparent;color:var(--muted);border-color:var(--border)}.btn-ghost:hover{color:var(--text);background:var(--surface2)}
.btn-print{background:var(--navy);color:#fff}.btn-print:hover{background:#1a2a52}
.btn-sm{padding:4px 10px;font-size:10px}
.btn:disabled{opacity:.4;cursor:not-allowed}
.overlay{position:fixed;inset:0;background:rgba(33,51,99,.5);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:20px;overflow-y:auto;animation:fadeIn .15s}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:12px;width:100%;max-width:700px;margin:auto;animation:slideUp .2s;box-shadow:0 8px 32px rgba(33,51,99,.18)}
.modal-wide{max-width:860px}
.mhdr{display:flex;justify-content:space-between;align-items:flex-start;padding:16px 20px;border-bottom:1px solid var(--border);background:var(--surface2);border-radius:12px 12px 0 0}
.mtitle{font-size:13px;font-weight:700;letter-spacing:.5px;color:var(--navy)}
.mbody{padding:20px}
.mftr{padding:12px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface2);border-radius:0 0 12px 12px}
.mclose{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer}
.mclose:hover{color:var(--navy)}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}
.fg{display:flex;flex-direction:column;gap:5px}
.fg label{font-size:10px;color:var(--navy);letter-spacing:.5px;text-transform:uppercase;font-weight:600}
.fg input,.fg select,.fg textarea{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:13px;padding:8px 10px;outline:none;transition:border-color .15s}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:var(--blue)}
.fg textarea{resize:vertical;min-height:60px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.form-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:12px}
th{font-size:10px;font-weight:600;letter-spacing:.5px;color:var(--muted);text-transform:uppercase;padding:8px 12px;text-align:left;border-bottom:2px solid var(--border);white-space:nowrap;background:var(--surface2)}
td{padding:8px 12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr.click:hover td{background:var(--surface2);cursor:pointer}
.filter-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center}
.filter-input{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:11px;padding:6px 10px;outline:none;min-width:130px}
.filter-select{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:11px;padding:6px 10px;outline:none;cursor:pointer;min-width:130px}
.flex-gap{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.flex-between{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.mt8{margin-top:8px}.mt12{margin-top:12px}
.mb8{margin-bottom:8px}.mb12{margin-bottom:12px}
.text-mono{font-family:var(--mono)}.text-muted{color:var(--muted)}
.empty-state{text-align:center;padding:40px 20px;color:var(--muted);font-size:13px}
.loading{display:flex;align-items:center;justify-content:center;padding:40px;color:var(--muted);gap:10px;font-size:13px}
.spin{animation:spin 1s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.notif{position:fixed;bottom:20px;right:20px;background:var(--surface);border:1px solid var(--border);border-left-width:3px;border-radius:var(--r2);padding:12px 16px;font-size:13px;animation:slideUp .2s;z-index:300;max-width:340px;display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(33,51,99,.15)}
.n-green{border-left-color:var(--accent2)}.n-red{border-left-color:var(--danger)}.n-amber{border-left-color:var(--warn)}.n-blue{border-left-color:var(--blue)}
.info-box{background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:12px 14px;font-size:13px}
.info-box.danger{border-left:3px solid var(--danger);background:#FEF2F2}
.info-box.warn{border-left:3px solid var(--warn);background:#FFFBEB}
.info-box.accent{border-left:3px solid var(--blue)}
.info-box.success{border-left:3px solid var(--accent2);background:#F0FDF4}
.dias-chip{display:inline-flex;align-items:center;gap:4px;font-family:var(--mono);font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;white-space:nowrap}
.dias-vencido{background:#FEE2E2;color:#991B1B;border:1px solid #FECACA}
.dias-critico{background:#FFEDD5;color:#9A3412;border:1px solid #FED7AA}
.dias-proximo{background:#FEF3C7;color:#92400E;border:1px solid #FDE68A}
.dias-ok{background:#D1FAE5;color:#065F46;border:1px solid #A7F3D0}
.dias-sin{background:#F3F4F6;color:#6B7280;border:1px solid #E5E7EB}
.alert-row{background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:12px 14px;margin-bottom:8px;border-left:4px solid transparent;cursor:pointer;transition:all .15s}
.alert-row:hover{box-shadow:0 2px 8px rgba(33,51,99,.1)}
.alert-row.vencido{border-left-color:var(--danger);background:#FFF8F8}
.alert-row.critico{border-left-color:var(--orange);background:#FFFAF5}
.alert-row.proximo{border-left-color:var(--warn);background:#FFFEF0}
.login-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--navy) 0%,#1a2a5e 100%)}
.login-card{background:var(--surface);border-radius:16px;padding:40px;width:100%;max-width:380px;box-shadow:0 8px 32px rgba(33,51,99,.3)}
.doc-adjunto{display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:8px 12px;font-size:12px}
.num-col{font-family:var(--mono);font-size:10px;font-weight:700;color:var(--muted2);width:28px;text-align:center}
.drag-handle{cursor:grab;color:var(--muted2);padding:0 6px;font-size:15px;user-select:none;line-height:1}
.drag-handle:active{cursor:grabbing}
tr.dragging{opacity:.35;background:#EFF6FF!important}
tr.drag-over td{border-top:2px solid var(--blue)!important}
.sv-block{background:#F0FDF4;border-left:3px solid #4ADE80;border-radius:0 var(--r) var(--r) 0}
.sv-header{display:flex;align-items:center;gap:8px;padding:7px 12px;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#166534;cursor:pointer;user-select:none}
.sv-header:hover{background:rgba(74,222,128,.1)}
.sv-list{border-top:1px solid #BBF7D0}
.sv-item{display:flex;align-items:center;gap:8px;padding:7px 12px;border-bottom:1px dashed #BBF7D0;font-size:11px;flex-wrap:wrap}
.sv-item:last-child{border-bottom:none}
.sv-num{font-family:var(--mono);font-size:9px;color:#166534;font-weight:700;min-width:20px}
.sv-desc{flex:1;font-weight:500;color:#213363;min-width:120px}
.sv-dates{font-family:var(--mono);font-size:9px;color:#6381A7}
.sv-add-btn{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#0F766E;background:#CCFBF1;border:1px solid #99F6E4;padding:4px 10px;border-radius:var(--r);cursor:pointer;font-weight:600;margin:6px 12px 8px}
.sv-add-btn:hover{background:#99F6E4}
@media print{
  .no-print{display:none!important}
  body{background:#fff}
  @page{size:A4;margin:14mm 12mm}
}
.print-overlay{position:fixed;inset:0;background:rgba(33,51,99,.6);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
.print-modal{background:#fff;width:100%;max-width:800px;margin:auto;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.25);overflow:hidden}
.print-modal-bar{background:var(--navy);color:#fff;padding:12px 20px;display:flex;align-items:center;justify-content:space-between}
.print-body{padding:28px 32px}
.ptable{width:100%;border-collapse:collapse;font-size:10px}
.ptable th{font-size:8px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--muted);padding:5px 8px;text-align:left;border-bottom:1.5px solid var(--border);background:var(--surface2);white-space:nowrap}
.ptable td{padding:5px 8px;border-bottom:.5px solid var(--border);vertical-align:top}
.ptable tr:last-child td{border-bottom:none}
.psv-row{background:#F9FFFE}
.psv-row td{padding:3px 8px 3px 22px;font-size:9px;color:var(--muted);border-bottom:1px dashed #BBF7D0}
.pchip{display:inline-flex;font-family:var(--mono);font-size:8px;font-weight:700;padding:2px 6px;border-radius:3px}
@media(max-width:900px){.stats{grid-template-columns:1fr 1fr}.form-grid{grid-template-columns:1fr}.form-grid-3{grid-template-columns:1fr 1fr}}
@media(max-width:700px){
  .sidebar{position:fixed;top:0;left:0;height:100vh;z-index:150;transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0)}
  .topbar{padding:8px 12px}.content{padding:12px}
  .stats{grid-template-columns:1fr 1fr;gap:8px}
  .desktop-table{display:none}
}
@media(min-width:701px){.mobile-cards{display:none}.hamburger{display:none!important}}
.hamburger{background:none;border:none;cursor:pointer;font-size:22px;color:var(--navy);display:flex;align-items:center}
.overlay-menu{display:none}
.overlay-menu.open{display:block;position:fixed;inset:0;background:rgba(33,51,99,.4);z-index:140}
.mobile-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);padding:12px 14px;margin-bottom:8px;cursor:pointer}
.mobile-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}
.mobile-card-num{font-family:var(--mono);font-size:9px;color:var(--muted);font-weight:700}
.mobile-card-title{font-size:13px;font-weight:600;color:var(--navy);margin-bottom:2px}
.mobile-card-meta{font-size:10px;color:var(--muted);font-family:var(--mono)}
.mobile-card-sv{margin-top:6px;background:#F0FDF4;border-left:3px solid #4ADE80;border-radius:0 4px 4px 0;padding:5px 8px;font-size:9px;color:#166534}
`;

function Notif({ msg, onClose }) {
  if (!msg) return null;
  const cls = { success: "n-green", error: "n-red", warn: "n-amber", info: "n-blue" }[msg.type] || "n-blue";
  return <div className={`notif ${cls}`}><span>{msg.text}</span><button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}>✕</button></div>;
}
function FG({ label, hint, children, full }) {
  return <div className="fg" style={full ? { gridColumn: "1/-1" } : {}}>
    {label && <label>{label}</label>}{children}
    {hint && <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{hint}</div>}
  </div>;
}
function DiasChip({ fechaStr }) {
  const dias = diasHasta(fechaStr);
  if (dias === null) return <span className="dias-chip dias-sin">Sin fecha</span>;
  const cls = dias < 0 ? "dias-vencido" : dias <= 30 ? "dias-critico" : dias <= 90 ? "dias-proximo" : "dias-ok";
  const label = dias < 0 ? `Vencido ${Math.abs(dias)}d` : dias === 0 ? "Vence hoy" : `${dias}d`;
  return <span className={`dias-chip ${cls}`}>{label}</span>;
}
function PrintChip({ fechaStr }) {
  const dias = diasHasta(fechaStr);
  if (dias === null) return <span className="pchip" style={{ background: "#F3F4F6", color: "#6B7280" }}>Sin fecha</span>;
  const [bg, col] = dias < 0 ? ["#FEE2E2", "#991B1B"] : dias <= 30 ? ["#FFEDD5", "#9A3412"] : dias <= 90 ? ["#FEF3C7", "#92400E"] : ["#D1FAE5", "#065F46"];
  return <span className="pchip" style={{ background: bg, color: col }}>{dias < 0 ? `Venc.${Math.abs(dias)}d` : `${dias}d`}</span>;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try { const { error } = await supabase.auth.signInWithPassword({ email, password: pass }); if (error) throw error; onLogin(); }
    catch { setError("Email o contraseña incorrectos"); } finally { setLoading(false); }
  };
  return (
    <div className="login-screen"><style>{CSS}</style>
      <div className="login-card">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <img src="/pL.png" alt="PL" style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid var(--border)" }} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)", textAlign: "center", marginBottom: 4 }}>Certificados</div>
        <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", marginBottom: 24 }}>Parana Logística</div>
        {error && <div className="info-box danger" style={{ fontSize: 12, marginBottom: 14 }}>{error}</div>}
        <form onSubmit={handleLogin}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FG label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@paranalogistica.com.ar" required /></FG>
            <FG label="Contraseña"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required /></FG>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 6, padding: "10px 14px", fontSize: 13 }}>{loading ? "Ingresando..." : "Ingresar"}</button>
          </div>
        </form>
        <div style={{ marginTop: 14, textAlign: "center" }}>
          <button onClick={() => window.open(ERP_HOME_URL, "_self")} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 11, cursor: "pointer" }}>← Volver al ERP</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL SUBVENCIMIENTO ─────────────────────────────────────────────────────
function ModalSubvencimiento({ certId, sv, onClose, onSave, notify }) {
  const esNuevo = !sv?.id; const fileRef = useRef();
  const [form, setForm] = useState({ descripcion: sv?.descripcion || "", fecha_desde: sv?.fecha_desde || "", fecha_hasta: sv?.fecha_hasta || "", observaciones: sv?.observaciones || "", documento_url: sv?.documento_url || "", documento_nombre: sv?.documento_nombre || "" });
  const [saving, setSaving] = useState(false); const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleUpload = async (file) => {
    if (!file) return; setUploading(true);
    try { const { url, nombre } = await api.subirDocSubvencimiento(file, sv?.id || `sv_${Date.now()}`); set("documento_url", url); set("documento_nombre", nombre); notify("Documento adjuntado", "success"); }
    catch (e) { notify("Error: " + e.message, "error"); } finally { setUploading(false); }
  };
  const handleSave = async () => {
    if (!form.descripcion.trim()) return alert("La descripción es obligatoria"); setSaving(true);
    try {
      const payload = { certificado_id: certId, descripcion: form.descripcion, fecha_desde: form.fecha_desde || null, fecha_hasta: form.fecha_hasta || null, observaciones: form.observaciones || null, documento_url: form.documento_url || null, documento_nombre: form.documento_nombre || null };
      const saved = sv?.id ? await api.updateSubvencimiento(sv.id, payload) : await api.insertSubvencimiento(payload);
      notify(esNuevo ? "Verificación creada" : "Actualizada", "success"); onSave(saved);
    } catch (e) { notify("Error: " + e.message, "error"); } finally { setSaving(false); }
  };
  return (
    <div className="overlay" style={{ zIndex: 200 }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="mhdr"><div className="mtitle">{esNuevo ? "Nueva verificación / subvencimiento" : "Editar verificación"}</div><button className="mclose" onClick={onClose}>✕</button></div>
        <div className="mbody">
          <FG label="Descripción *" full><input value={form.descripcion} onChange={e => set("descripcion", e.target.value)} placeholder="Ej: 1ra Verificación anual, Inspección intermedia..." /></FG>
          <div className="form-grid mt12">
            <FG label="Fecha desde (inicio ventana)"><input type="date" value={form.fecha_desde} onChange={e => set("fecha_desde", e.target.value)} /></FG>
            <FG label="Fecha hasta (cierre / vencimiento)"><input type="date" value={form.fecha_hasta} onChange={e => set("fecha_hasta", e.target.value)} /></FG>
          </div>
          <FG label="Observaciones"><textarea value={form.observaciones} onChange={e => set("observaciones", e.target.value)} placeholder="Notas, resultado de la verificación..." /></FG>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: "var(--navy)", marginBottom: 8 }}>Documento adjunto</div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => handleUpload(e.target.files[0])} />
            {form.documento_url
              ? <div className="doc-adjunto"><span>📎</span><a href={form.documento_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", flex: 1 }}>{form.documento_nombre || "Ver documento"}</a><button onClick={() => { set("documento_url", ""); set("documento_nombre", ""); }} style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer" }}>✕</button></div>
              : <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>{uploading ? "⏳ Subiendo..." : "📎 Adjuntar PDF / imagen"}</button>}
          </div>
        </div>
        <div className="mftr"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button></div>
      </div>
    </div>
  );
}

// ─── BLOQUE SUBVENCIMIENTOS ───────────────────────────────────────────────────
function SubvencimientosBloque({ cert, subvencimientos, onAdd, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const svDeCert = subvencimientos.filter(s => s.certificado_id === cert.id);
  const hayProximos = svDeCert.some(s => { const d = diasHasta(s.fecha_hasta); return d !== null && d >= 0 && d <= 90; });

  if (svDeCert.length === 0) {
    return (
      <div style={{ marginTop: 4, marginBottom: 4 }}>
        <button className="sv-add-btn" onClick={e => { e.stopPropagation(); onAdd(); }}>
          ＋ Agregar verificación / subvencimiento
        </button>
      </div>
    );
  }

  return (
    <div className="sv-block" style={{ marginTop: 6 }}>
      <div className="sv-header" onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 12 }}>{expanded ? "▼" : "▶"}</span>
        <span>Verificaciones periódicas</span>
        <span style={{ background: "#BBF7D0", color: "#166534", fontSize: 9, padding: "1px 7px", borderRadius: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>{svDeCert.length}</span>
        {hayProximos && <span className="badge b-amber" style={{ fontSize: 8, marginLeft: "auto" }}>⚠ Próxima</span>}
      </div>
      {expanded && (
        <div className="sv-list">
          {svDeCert.map((s, i) => {
            const diasD = diasHasta(s.fecha_hasta);
            const alertCls = diasD === null ? "dias-sin" : diasD < 0 ? "dias-vencido" : diasD <= 30 ? "dias-critico" : diasD <= 90 ? "dias-proximo" : "dias-ok";
            return (
              <div key={s.id} className="sv-item">
                <span className="sv-num">{i + 1}°</span>
                <span className="sv-desc">{s.descripcion}</span>
                <span className="sv-dates">{s.fecha_desde && s.fecha_hasta ? `${fmtDate(s.fecha_desde)} → ${fmtDate(s.fecha_hasta)}` : s.fecha_hasta ? `Hasta: ${fmtDate(s.fecha_hasta)}` : s.fecha_desde ? `Desde: ${fmtDate(s.fecha_desde)}` : "Sin fechas"}</span>
                {s.fecha_hasta && <span className={`dias-chip ${alertCls}`} style={{ fontSize: 9 }}>{diasD !== null ? (diasD < 0 ? `Venc.${Math.abs(diasD)}d` : diasD === 0 ? "Hoy" : `${diasD}d`) : "—"}</span>}
                {s.documento_url && <a href={s.documento_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12 }} title={s.documento_nombre}>📎</a>}
                <button onClick={e => { e.stopPropagation(); onEdit(s); }} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>✏</button>
                <button onClick={e => { e.stopPropagation(); onDelete(s.id); }} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 11 }}>🗑</button>
              </div>
            );
          })}
          <button className="sv-add-btn" onClick={e => { e.stopPropagation(); onAdd(); }}>＋ Agregar verificación / subvencimiento</button>
        </div>
      )}
    </div>
  );
}

// ─── MODAL EDITAR/CREAR CERT ──────────────────────────────────────────────────
function ModalCert({ cert, onClose, onSave, notify }) {
  const esNuevo = !cert.id; const fileRef = useRef();
  const [form, setForm] = useState({
    buque: cert.buque || "Atlantic Dama", tipo: cert.tipo || "estatutario", seccion: cert.seccion || "GENERAL",
    descripcion: cert.descripcion || "", nro_certificado: cert.nro_certificado || "",
    emitido_por: cert.emitido_por || "", nro_serie: cert.nro_serie || "", proveedor: cert.proveedor || "",
    fecha_emision: cert.fecha_emision || "", fecha_vencimiento: cert.fecha_vencimiento || "",
    fecha_ultimo_servicio: cert.fecha_ultimo_servicio || "", fecha_proximo_servicio: cert.fecha_proximo_servicio || "",
    observaciones: cert.observaciones || "", documento_url: cert.documento_url || "", documento_nombre: cert.documento_nombre || "",
  });
  const [saving, setSaving] = useState(false); const [uploading, setUploading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const secciones = form.tipo === "estatutario" ? SECCIONES_ESTAT : SECCIONES_NOESTAT;
  const esEstat = form.tipo === "estatutario";
  const handleUpload = async (file) => {
    if (!file) return; setUploading(true);
    try { const { url, nombre } = await api.subirDocumento(file, cert.id || `temp_${Date.now()}`); set("documento_url", url); set("documento_nombre", nombre); notify("Documento adjuntado", "success"); }
    catch (e) { notify("Error: " + e.message, "error"); } finally { setUploading(false); }
  };
  const handleSave = async () => {
    if (!form.descripcion.trim()) return alert("La descripción es obligatoria"); setSaving(true);
    try {
      const fechaRef = esEstat ? form.fecha_vencimiento : form.fecha_proximo_servicio;
      const payload = { buque: form.buque, tipo: form.tipo, seccion: form.seccion, descripcion: form.descripcion, nro_certificado: form.nro_certificado || null, emitido_por: form.emitido_por || null, nro_serie: form.nro_serie || null, proveedor: form.proveedor || null, fecha_emision: form.fecha_emision || null, fecha_vencimiento: form.fecha_vencimiento || null, fecha_ultimo_servicio: form.fecha_ultimo_servicio || null, fecha_proximo_servicio: form.fecha_proximo_servicio || null, observaciones: form.observaciones || null, documento_url: form.documento_url || null, documento_nombre: form.documento_nombre || null, dias_vencimiento: diasHasta(fechaRef), activo: true };
      const saved = cert.id ? await api.updateCertificado(cert.id, payload) : await api.insertCertificado(payload);
      notify(esNuevo ? "Certificado creado" : "Actualizado", "success"); onSave(saved);
    } catch (e) { notify("Error: " + e.message, "error"); } finally { setSaving(false); }
  };
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="mhdr"><div className="mtitle">{esNuevo ? "Nuevo certificado" : "Editar certificado"}</div><button className="mclose" onClick={onClose}>✕</button></div>
        <div className="mbody">
          <div className="form-grid">
            <FG label="Buque *"><select value={form.buque} onChange={e => set("buque", e.target.value)}>{BUQUES.map(b => <option key={b}>{b}</option>)}</select></FG>
            <FG label="Tipo *"><select value={form.tipo} onChange={e => { set("tipo", e.target.value); set("seccion", e.target.value === "estatutario" ? "GENERAL" : "FFA"); }}><option value="estatutario">Estatutario</option><option value="no_estatutario">No estatutario (Equipo)</option></select></FG>
            <FG label="Sección *"><select value={form.seccion} onChange={e => set("seccion", e.target.value)}>{secciones.map(s => <option key={s} value={s}>{SECCION_LABEL[s] || s}</option>)}</select></FG>
            <FG label={esEstat ? "Emitido por" : "Proveedor"}><input value={esEstat ? form.emitido_por : form.proveedor} onChange={e => set(esEstat ? "emitido_por" : "proveedor", e.target.value)} /></FG>
          </div>
          <FG label="Descripción *" full><input value={form.descripcion} onChange={e => set("descripcion", e.target.value)} placeholder="Nombre del certificado..." /></FG>
          <div className="form-grid mt12">
            <FG label="N° Certificado"><input value={form.nro_certificado} onChange={e => set("nro_certificado", e.target.value)} /></FG>
            <FG label="N° Serie"><input value={form.nro_serie} onChange={e => set("nro_serie", e.target.value)} /></FG>
          </div>
          {esEstat
            ? <div className="form-grid"><FG label="Fecha emisión"><input type="date" value={form.fecha_emision} onChange={e => set("fecha_emision", e.target.value)} /></FG><FG label="Fecha vencimiento"><input type="date" value={form.fecha_vencimiento} onChange={e => set("fecha_vencimiento", e.target.value)} /></FG></div>
            : <div className="form-grid"><FG label="Último servicio"><input type="date" value={form.fecha_ultimo_servicio} onChange={e => set("fecha_ultimo_servicio", e.target.value)} /></FG><FG label="Próximo servicio"><input type="date" value={form.fecha_proximo_servicio} onChange={e => set("fecha_proximo_servicio", e.target.value)} /></FG></div>
          }
          <FG label="Observaciones" full><textarea value={form.observaciones} onChange={e => set("observaciones", e.target.value)} placeholder="Notas..." /></FG>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: "var(--navy)", marginBottom: 8 }}>Documento adjunto</div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => handleUpload(e.target.files[0])} />
            {form.documento_url
              ? <div className="doc-adjunto"><span>📎</span><a href={form.documento_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", flex: 1 }}>{form.documento_nombre || "Ver documento"}</a><button onClick={() => { set("documento_url", ""); set("documento_nombre", ""); }} style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer" }}>✕</button></div>
              : <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>{uploading ? "⏳ Subiendo..." : "📎 Adjuntar PDF / imagen"}</button>}
          </div>
        </div>
        <div className="mftr"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button></div>
      </div>
    </div>
  );
}

// ─── MODAL VER CERT ───────────────────────────────────────────────────────────
function ModalVerCert({ cert, subvencimientos, onClose, onEdit, onDelete, notify, onSubvencimientosChange }) {
  const [confirmDelete, setConfirmDelete] = useState(false); const [deleting, setDeleting] = useState(false);
  const [modalSv, setModalSv] = useState(null);
  const esEstat = cert.tipo === "estatutario";
  const fechaRef = esEstat ? cert.fecha_vencimiento : cert.fecha_proximo_servicio;
  const dias = diasHasta(fechaRef);
  const handleDelete = async () => {
    setDeleting(true);
    try { await api.deleteCertificado(cert.id); onDelete(cert.id); }
    catch (e) { notify("Error: " + e.message, "error"); setDeleting(false); }
  };
  const handleDeleteSv = async (svId) => {
    if (!window.confirm("¿Eliminar esta verificación?")) return;
    try { await api.deleteSubvencimiento(svId); notify("Eliminada", "success"); onSubvencimientosChange(); }
    catch (e) { notify("Error: " + e.message, "error"); }
  };
  return (
    <>
      <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal modal-wide">
          <div className="mhdr">
            <div>
              <div className="mtitle">{cert.descripcion}</div>
              <div className="flex-gap" style={{ marginTop: 5 }}>
                <span className="badge b-navy" style={{ fontSize: 9 }}>{cert.buque}</span>
                <span className="badge b-gray" style={{ fontSize: 9 }}>{SECCION_LABEL[cert.seccion] || cert.seccion}</span>
                <span className="badge b-blue" style={{ fontSize: 9 }}>{esEstat ? "Estatutario" : "Equipo"}</span>
                {fechaRef && <DiasChip fechaStr={fechaRef} />}
              </div>
            </div>
            <button className="mclose" onClick={onClose}>✕</button>
          </div>
          <div className="mbody">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {esEstat ? <>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Emitido por</div>{cert.emitido_por || "—"}</div>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>N° Certificado</div>{cert.nro_certificado || "—"}</div>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Fecha emisión</div>{fmtDate(cert.fecha_emision)}</div>
                <div className="info-box" style={{ background: dias !== null && dias < 0 ? "#FEF2F2" : dias !== null && dias <= 30 ? "#FFF7ED" : undefined }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Fecha vencimiento</div>
                  <strong style={{ color: dias !== null && dias < 0 ? "var(--danger)" : dias !== null && dias <= 30 ? "var(--orange)" : "inherit" }}>{fmtDate(cert.fecha_vencimiento)}</strong>
                </div>
              </> : <>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Proveedor</div>{cert.proveedor || "—"}</div>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>N° Certificado</div>{cert.nro_certificado || "—"}</div>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Último servicio</div>{fmtDate(cert.fecha_ultimo_servicio)}</div>
                <div className="info-box" style={{ background: dias !== null && dias < 0 ? "#FEF2F2" : dias !== null && dias <= 30 ? "#FFF7ED" : undefined }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Próximo servicio</div>
                  <strong style={{ color: dias !== null && dias < 0 ? "var(--danger)" : dias !== null && dias <= 30 ? "var(--orange)" : "inherit" }}>{fmtDate(cert.fecha_proximo_servicio)}</strong>
                </div>
              </>}
              {cert.nro_serie && <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>N° Serie</div>{cert.nro_serie}</div>}
            </div>
            {cert.observaciones && <div className="info-box mt8" style={{ fontSize: 12 }}><strong>Obs:</strong> {cert.observaciones}</div>}
            {cert.documento_url && <div className="doc-adjunto mt8"><span>📎</span><a href={cert.documento_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", flex: 1 }}>{cert.documento_nombre || "Ver documento adjunto"}</a></div>}
            {esEstat && <div className="mt12"><SubvencimientosBloque cert={cert} subvencimientos={subvencimientos} onAdd={() => setModalSv("new")} onEdit={sv => setModalSv(sv)} onDelete={handleDeleteSv} /></div>}
            {confirmDelete && (
              <div className="info-box danger mt12" style={{ fontSize: 12 }}>¿Confirmás la eliminación?
                <div className="flex-gap mt8">
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancelar</button>
                  <button className="btn btn-danger btn-sm" onClick={handleDelete} disabled={deleting}>{deleting ? "..." : "Eliminar"}</button>
                </div>
              </div>
            )}
          </div>
          <div className="mftr">
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)} style={{ color: "var(--danger)", borderColor: "var(--danger)", marginRight: "auto" }}>🗑 Eliminar</button>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => onEdit(cert)}>✏ Editar</button>
          </div>
        </div>
      </div>
      {modalSv && <ModalSubvencimiento certId={cert.id} sv={modalSv === "new" ? null : modalSv} onClose={() => setModalSv(null)} onSave={() => { setModalSv(null); onSubvencimientosChange(); }} notify={notify} />}
    </>
  );
}

// ─── PRINT MODAL ──────────────────────────────────────────────────────────────
function PrintModal({ buque, tipo, certs, subvencimientos, onClose }) {
  const secciones = tipo === "estatutario" ? SECCIONES_ESTAT : SECCIONES_NOESTAT;
  const getFechaRef = c => tipo === "estatutario" ? c.fecha_vencimiento : c.fecha_proximo_servicio;
  const certsBuque = certs.filter(c => c.buque === buque && c.tipo === tipo);
  const grupos = {};
  certsBuque.forEach(c => { if (!grupos[c.seccion]) grupos[c.seccion] = []; grupos[c.seccion].push(c); });
  let gn = 0; const certNums = {};
  secciones.forEach(s => (grupos[s] || []).forEach(c => { gn++; certNums[c.id] = gn; }));
  const tipoLabel = tipo === "estatutario" ? "Certificados Estatutarios" : "Certificados de Equipos";
  const fechaStr = new Date().toLocaleDateString("es-AR");

  const handlePrint = () => {
    const el = document.getElementById("print-content-area");
    if (!el) return;
    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>${buque} — ${tipoLabel}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'Montserrat',sans-serif;font-size:12px;color:#213363;padding:28px 32px;background:#fff}
        @page{size:A4;margin:14mm 12mm}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th{font-size:8px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6381A7;padding:5px 8px;text-align:left;border-bottom:1.5px solid #D6E0ED;background:#F5F7FA;white-space:nowrap}
        td{padding:5px 8px;border-bottom:.5px solid #D6E0ED;vertical-align:top}
        tr:last-child td{border-bottom:none}
        .psv-row{background:#F9FFFE}
        .psv-row td{padding:3px 8px 3px 22px;font-size:9px;color:#6381A7;border-bottom:1px dashed #BBF7D0}
        .pchip{display:inline-flex;font-family:'DM Mono',monospace;font-size:8px;font-weight:700;padding:2px 6px;border-radius:3px}
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <div className="print-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="print-modal">
        <div className="print-modal-bar">
          <div><div style={{ fontWeight: 700, fontSize: 14 }}>Vista previa · {buque}</div><div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>{tipoLabel}</div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }} onClick={onClose}>✕ Cerrar</button>
            <button className="btn btn-sm" style={{ background: "#fff", color: "var(--navy)" }} onClick={handlePrint}>🖨️ Imprimir / Guardar PDF</button>
          </div>
        </div>
        <div className="print-body" id="print-content-area">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
            <img src="/pL.png" alt="" style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid var(--navy)", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
            <div>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Parana Logística S.A.</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "var(--navy)", lineHeight: 1.1, letterSpacing: "-.5px" }}>{buque}</div>
            </div>
          </div>
          <div style={{ height: 3, background: "var(--navy)", borderRadius: 2, marginBottom: 4 }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 18 }}>
            <span style={{ fontWeight: 600 }}>{tipoLabel}</span>
            <span>Estado al {fechaStr} · {certsBuque.length} certificados</span>
          </div>

          {secciones.filter(s => (grupos[s] || []).length > 0).map(seccion => {
            const items = grupos[seccion] || [];
            return (
              <div key={seccion}>
                <div style={{ background: "var(--navy)", color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", padding: "4px 10px", marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
                  <span>{SECCION_LABEL[seccion] || seccion}</span>
                  <span style={{ opacity: .5, fontSize: 9, fontFamily: "var(--mono)" }}>{items.length} items</span>
                </div>
                <table className="ptable">
                  <thead>
                    <tr>
                      <th style={{ width: 22 }}>#</th>
                      <th>Descripción</th>
                      <th>N° Cert.</th>
                      <th>{tipo === "estatutario" ? "Emitido por" : "Proveedor"}</th>
                      <th>{tipo === "estatutario" ? "Emisión" : "Últ. servicio"}</th>
                      <th>{tipo === "estatutario" ? "Vencimiento" : "Próx. servicio"}</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(c => {
                      const fechaRef = getFechaRef(c);
                      const dias = diasHasta(fechaRef);
                      const col = dias !== null && dias < 0 ? "var(--danger)" : dias !== null && dias <= 30 ? "var(--orange)" : dias !== null && dias <= 90 ? "var(--warn)" : "inherit";
                      const rowBg = dias !== null && dias < 0 ? "#FFF5F5" : dias !== null && dias <= 30 ? "#FFFAF5" : "inherit";
                      const svDeCert = subvencimientos.filter(s => s.certificado_id === c.id);
                      return (
                        <>
                          <tr key={c.id} style={{ background: rowBg }}>
                            <td style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)", fontWeight: 700, textAlign: "center" }}>{certNums[c.id]}</td>
                            <td style={{ fontWeight: 600, fontSize: 10 }}>{c.descripcion}</td>
                            <td style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--muted)" }}>{c.nro_certificado || "—"}</td>
                            <td style={{ fontSize: 9, color: "var(--muted)" }}>{tipo === "estatutario" ? (c.emitido_por || "—") : (c.proveedor || "—")}</td>
                            <td style={{ fontFamily: "var(--mono)", fontSize: 9 }}>{tipo === "estatutario" ? fmtDate(c.fecha_emision) : fmtDate(c.fecha_ultimo_servicio)}</td>
                            <td style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700, color: col }}>{tipo === "estatutario" ? fmtDate(c.fecha_vencimiento) : fmtDate(c.fecha_proximo_servicio)}</td>
                            <td><PrintChip fechaStr={fechaRef} /></td>
                          </tr>
                          {svDeCert.map((s, si) => (
                            <tr key={s.id} className="psv-row">
                              <td style={{ textAlign: "center", color: "#888", fontSize: 8 }}>{certNums[c.id]}.{si + 1}</td>
                              <td colSpan={4}><span style={{ color: "#4ADE80", fontWeight: 700, marginRight: 4 }}>↳</span><span style={{ fontWeight: 500 }}>{s.descripcion}</span>{s.observaciones && <span style={{ color: "#888", marginLeft: 6 }}>· {s.observaciones}</span>}</td>
                              <td style={{ fontFamily: "var(--mono)", fontSize: 9 }}>{s.fecha_desde && s.fecha_hasta ? `${fmtDate(s.fecha_desde)} → ${fmtDate(s.fecha_hasta)}` : s.fecha_hasta ? fmtDate(s.fecha_hasta) : "—"}</td>
                              <td>{s.fecha_hasta ? <PrintChip fechaStr={s.fecha_hasta} /> : "—"}</td>
                            </tr>
                          ))}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)" }}>
            <span>Parana Logística S.A. · Sistema de Certificados v1.3</span>
            <span>{fechaStr}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE TABLA ───────────────────────────────────────────────────────────────
function PageTabla({ certs, buque, tipo, subvencimientos, onSelect, onNuevo, onSubvencimientosChange, onCertsChange, notify }) {
  const [filtroSeccion, setFiltroSeccion] = useState(""); const [busqueda, setBusqueda] = useState("");
  const [showPrint, setShowPrint] = useState(false); const [modalSv, setModalSv] = useState(null);
  const [dragId, setDragId] = useState(null); const [localOrder, setLocalOrder] = useState({});

  const getFechaRef = c => tipo === "estatutario" ? c.fecha_vencimiento : c.fecha_proximo_servicio;
  const secciones = tipo === "estatutario" ? SECCIONES_ESTAT : SECCIONES_NOESTAT;

  const filtrados = certs.filter(c => c.tipo === tipo && c.buque === buque).filter(c => {
    if (filtroSeccion && c.seccion !== filtroSeccion) return false;
    if (busqueda && !c.descripcion.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  const grupos = {};
  filtrados.forEach(c => { if (!grupos[c.seccion]) grupos[c.seccion] = []; grupos[c.seccion].push(c); });
  Object.keys(grupos).forEach(s => {
    grupos[s].sort((a, b) => {
      const oa = localOrder[a.id] ?? a.orden ?? 9999;
      const ob = localOrder[b.id] ?? b.orden ?? 9999;
      return oa !== ob ? oa - ob : a.descripcion.localeCompare(b.descripcion);
    });
  });

  let gn = 0; const certNums = {};
  secciones.forEach(s => (grupos[s] || []).forEach(c => { gn++; certNums[c.id] = gn; }));

  const handleDeleteSv = async (svId) => {
    if (!window.confirm("¿Eliminar esta verificación?")) return;
    try { await api.deleteSubvencimiento(svId); notify("Verificación eliminada", "success"); onSubvencimientosChange(); }
    catch (e) { notify("Error: " + e.message, "error"); }
  };

  const handleDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e, id) => { e.preventDefault(); if (id !== dragId) e.currentTarget.classList.add("drag-over"); };
  const handleDragLeave = e => e.currentTarget.classList.remove("drag-over");
  const handleDrop = async (e, targetId, seccion) => {
    e.preventDefault(); e.currentTarget.classList.remove("drag-over");
    if (!dragId || dragId === targetId) return;
    const lista = [...(grupos[seccion] || [])];
    const fromIdx = lista.findIndex(c => c.id === dragId); const toIdx = lista.findIndex(c => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordenada = [...lista]; const [moved] = reordenada.splice(fromIdx, 1); reordenada.splice(toIdx, 0, moved);
    const newOrder = {}; reordenada.forEach((c, i) => { newOrder[c.id] = i + 1; });
    setLocalOrder(prev => ({ ...prev, ...newOrder })); setDragId(null);
    try { await api.updateOrden(Object.entries(newOrder).map(([id, orden]) => ({ id, orden }))); onCertsChange(); }
    catch (e) { notify("Error al guardar orden: " + e.message, "error"); }
  };
  const handleDragEnd = () => { setDragId(null); document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over")); };

  return (
    <>
      <div className="filter-row">
        <input className="filter-input" placeholder="🔍 Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ minWidth: 200 }} />
        <select className="filter-select" value={filtroSeccion} onChange={e => setFiltroSeccion(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map(s => <option key={s} value={s}>{SECCION_LABEL[s] || s}</option>)}
        </select>
        {(filtroSeccion || busqueda) && <button className="btn btn-ghost btn-sm" onClick={() => { setFiltroSeccion(""); setBusqueda(""); }}>✕</button>}
        <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{filtrados.length} certificados</span>
        <button className="btn btn-print btn-sm no-print" onClick={() => setShowPrint(true)}>🖨️ Imprimir</button>
        <button className="btn btn-primary btn-sm no-print" onClick={onNuevo}>+ Agregar</button>
      </div>

      {Object.keys(grupos).length === 0
        ? <div className="empty-state"><div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>Sin certificados</div>
        : secciones.filter(s => grupos[s]?.length > 0).map(seccion => (
          <div key={seccion} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "8px 14px", background: "var(--navy)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{SECCION_LABEL[seccion] || seccion}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(255,255,255,.4)" }}>{grupos[seccion].length} items</span>
              {grupos[seccion].filter(c => (diasHasta(getFechaRef(c)) || 0) < 0).length > 0 && <span className="badge b-red" style={{ marginLeft: "auto", fontSize: 9 }}>{grupos[seccion].filter(c => (diasHasta(getFechaRef(c)) || 0) < 0).length} vencidos</span>}
              {grupos[seccion].filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d >= 0 && d <= 30; }).length > 0 && <span className="badge b-orange" style={{ fontSize: 9 }}>{grupos[seccion].filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d >= 0 && d <= 30; }).length} críticos</span>}
            </div>

            <div className="table-wrap desktop-table">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 16, padding: "8px 4px" }}></th>
                    <th style={{ width: 28, textAlign: "center" }}>#</th>
                    <th>Descripción</th>
                    {tipo === "estatutario"
                      ? <><th>N° Cert.</th><th>Emitido por</th><th>Fecha emisión</th><th>Fecha vencimiento</th></>
                      : <><th>N° Cert.</th><th>Proveedor</th><th>Último servicio</th><th>Próximo servicio</th></>}
                    <th>Estado</th><th>Doc.</th>
                  </tr>
                </thead>
                <tbody>
                  {grupos[seccion].map(c => {
                    const fechaRef = getFechaRef(c);
                    const dias = diasHasta(fechaRef);
                    const alertColor = getAlertColor(dias);
                    const rowBg = alertColor === "vencido" ? "#FFF5F5" : alertColor === "critico" ? "#FFFAF5" : alertColor === "proximo" ? "#FFFEF5" : "inherit";
                    const svDeCert = subvencimientos.filter(s => s.certificado_id === c.id);
                    return (
                      <>
                        <tr key={c.id} className={`click ${dragId === c.id ? "dragging" : ""}`} style={{ background: rowBg }}
                          draggable onDragStart={e => handleDragStart(e, c.id)} onDragOver={e => handleDragOver(e, c.id)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, c.id, seccion)} onDragEnd={handleDragEnd}
                          onClick={() => onSelect(c)}>
                          <td style={{ padding: "8px 4px" }} onClick={e => e.stopPropagation()}>
                            <span className="drag-handle" title="Arrastrá para reordenar">⠿</span>
                          </td>
                          <td className="num-col">{certNums[c.id]}</td>
                          <td style={{ fontWeight: 500, fontSize: 12, maxWidth: 260 }}>
                            {c.descripcion}
                            {tipo === "estatutario" && svDeCert.length > 0 && <span className="badge b-teal" style={{ marginLeft: 6, fontSize: 8, verticalAlign: "middle" }}>{svDeCert.length} verif.</span>}
                          </td>
                          <td className="text-mono" style={{ fontSize: 10, color: "var(--muted)" }}>{c.nro_certificado || "—"}</td>
                          <td style={{ fontSize: 11, color: "var(--muted)" }}>{tipo === "estatutario" ? (c.emitido_por || "—") : (c.proveedor || "—")}</td>
                          <td className="text-mono" style={{ fontSize: 11, color: "var(--muted)" }}>{tipo === "estatutario" ? fmtDate(c.fecha_emision) : fmtDate(c.fecha_ultimo_servicio)}</td>
                          <td className="text-mono" style={{ fontSize: 11, fontWeight: fechaRef ? 600 : 400, color: alertColor === "vencido" ? "var(--danger)" : alertColor === "critico" ? "var(--orange)" : alertColor === "proximo" ? "var(--warn)" : "var(--navy)" }}>
                            {tipo === "estatutario" ? fmtDate(c.fecha_vencimiento) : fmtDate(c.fecha_proximo_servicio)}
                          </td>
                          <td><DiasChip fechaStr={fechaRef} /></td>
                          <td style={{ textAlign: "center" }}>{c.documento_url ? <a href={c.documento_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 14, color: "var(--blue)" }}>📎</a> : <span style={{ color: "var(--muted2)", fontSize: 11 }}>—</span>}</td>
                        </tr>
                        {tipo === "estatutario" && (
                          <tr key={`sv-${c.id}`}>
                            <td colSpan={9} style={{ padding: 0, paddingLeft: 44, paddingRight: 12, background: rowBg }}>
                              <SubvencimientosBloque cert={c} subvencimientos={subvencimientos} onAdd={() => setModalSv({ certId: c.id, sv: null })} onEdit={sv => setModalSv({ certId: c.id, sv })} onDelete={handleDeleteSv} />
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mobile-cards" style={{ padding: "10px 12px" }}>
              {grupos[seccion].map(c => {
                const fechaRef = getFechaRef(c);
                const svDeCert = subvencimientos.filter(s => s.certificado_id === c.id);
                return (
                  <div key={c.id} className="mobile-card" onClick={() => onSelect(c)}>
                    <div className="mobile-card-top">
                      <div style={{ flex: 1 }}>
                        <div className="mobile-card-num">#{certNums[c.id]} · {tipo === "estatutario" ? (c.emitido_por || "—") : (c.proveedor || "—")}{c.nro_certificado ? ` · ${c.nro_certificado}` : ""}</div>
                        <div className="mobile-card-title">{c.descripcion}</div>
                      </div>
                      <DiasChip fechaStr={fechaRef} />
                    </div>
                    <div className="mobile-card-meta">{tipo === "estatutario" ? `Vence: ${fmtDate(c.fecha_vencimiento)}` : `Próx. servicio: ${fmtDate(c.fecha_proximo_servicio)}`}{c.documento_url && <span style={{ marginLeft: 8, color: "var(--blue)" }}>📎</span>}</div>
                    {svDeCert.length > 0 && (
                      <div className="mobile-card-sv">
                        {svDeCert.slice(0, 2).map(s => <div key={s.id}>↳ {s.descripcion}{s.fecha_hasta ? ` · ${fmtDate(s.fecha_hasta)}` : ""}</div>)}
                        {svDeCert.length > 2 && <div style={{ opacity: .7 }}>+ {svDeCert.length - 2} más...</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      }

      {showPrint && <PrintModal buque={buque} tipo={tipo} certs={certs} subvencimientos={subvencimientos} onClose={() => setShowPrint(false)} />}
      {modalSv && <ModalSubvencimiento certId={modalSv.certId} sv={modalSv.sv} onClose={() => setModalSv(null)} onSave={() => { setModalSv(null); onSubvencimientosChange(); }} notify={notify} />}
    </>
  );
}

// ─── PAGE ALERTAS ─────────────────────────────────────────────────────────────
function PageAlertas({ certs, subvencimientos, onSelect }) {
  const hoy = fechaHoy(); const def90 = fechaDefault90();
  const [desde, setDesde] = useState(hoy); const [hasta, setHasta] = useState(def90); const [filtroBuque, setFiltroBuque] = useState("");
  const getFechaRef = c => c.tipo === "estatutario" ? c.fecha_vencimiento : c.fecha_proximo_servicio;
  const vencidos = certs.filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d < 0; });
  const criticos = certs.filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d >= 0 && d <= 30; });
  const proximos = certs.filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d > 30 && d <= 90; });

  const itemsEnRango = [];
  certs.filter(c => !filtroBuque || c.buque === filtroBuque).forEach(c => {
    const f = getFechaRef(c);
    if (f && f >= desde && f <= hasta) itemsEnRango.push({ tipo_item: "cert", fechaRef: f, cert: c, sv: null });
    subvencimientos.filter(s => s.certificado_id === c.id).forEach(s => {
      const fSv = s.fecha_hasta;
      if (fSv && fSv >= desde && fSv <= hasta) itemsEnRango.push({ tipo_item: "subvenc", fechaRef: fSv, cert: c, sv: s });
    });
  });
  itemsEnRango.sort((a, b) => a.fechaRef.localeCompare(b.fechaRef));
  const getAlertClass = f => { const d = diasHasta(f); if (d === null) return ""; if (d < 0) return "vencido"; if (d <= 30) return "critico"; if (d <= 90) return "proximo"; return ""; };

  return (
    <div>
      <div className="stats">
        <div className="stat"><div className="stat-label">Total certificados</div><div className="stat-value sv-stat">{certs.length}</div></div>
        <div className="stat"><div className="stat-label">Vencidos</div><div className="stat-value sr">{vencidos.length}</div></div>
        <div className="stat"><div className="stat-label">Críticos ≤30d</div><div className="stat-value" style={{ color: "var(--orange)", fontFamily: "var(--mono)", fontSize: 26, fontWeight: 600 }}>{criticos.length}</div></div>
        <div className="stat"><div className="stat-label">Próximos ≤90d</div><div className="stat-value sw">{proximos.length}</div></div>
      </div>
      <div className="card mb12">
        <div className="card-title">Filtro por rango de vencimiento</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <FG label="Barco"><select value={filtroBuque} onChange={e => setFiltroBuque(e.target.value)}><option value="">Todos</option>{BUQUES.map(b => <option key={b}>{b}</option>)}</select></FG>
          <FG label="Desde"><input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></FG>
          <FG label="Hasta"><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></FG>
        </div>
        <div className="flex-gap mt8">
          <div className="info-box accent" style={{ fontSize: 11, flex: 1 }}>
            <strong>{itemsEnRango.length}</strong> item{itemsEnRango.length !== 1 ? "s" : ""} vence{itemsEnRango.length !== 1 ? "n" : ""} entre {fmtDate(desde)} y {fmtDate(hasta)}
            {itemsEnRango.filter(i => diasHasta(i.fechaRef) < 0).length > 0 && <span style={{ color: "var(--danger)", marginLeft: 8 }}>· {itemsEnRango.filter(i => diasHasta(i.fechaRef) < 0).length} ya vencidos</span>}
            {itemsEnRango.some(i => i.tipo_item === "subvenc") && <span className="badge b-teal" style={{ marginLeft: 8, fontSize: 9 }}>{itemsEnRango.filter(i => i.tipo_item === "subvenc").length} verif. incluidas</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setDesde(hoy); setHasta(def90); setFiltroBuque(""); }}>Restablecer</button>
        </div>
        <div className="info-box success mt8" style={{ fontSize: 10 }}>
          ℹ️ Incluye vencimientos de <strong>certificados principales</strong> y sus <strong>verificaciones periódicas / subvencimientos</strong>.
        </div>
      </div>

      {itemsEnRango.length === 0
        ? <div className="empty-state"><div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>Sin vencimientos en el período</div>
        : <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>{itemsEnRango.length} vencimientos en el período</div>
          {itemsEnRango.map((item, idx) => {
            const { tipo_item, fechaRef, cert: c, sv } = item;
            const alertCls = getAlertClass(fechaRef); const esSubvenc = tipo_item === "subvenc";
            return (
              <div key={`${esSubvenc ? "sv" : "c"}-${esSubvenc ? sv.id : c.id}-${idx}`} className={`alert-row ${alertCls}`} style={esSubvenc ? { marginLeft: 24, borderLeftStyle: "dashed" } : {}} onClick={() => onSelect(c)}>
                <div className="flex-between mb8">
                  <div className="flex-gap">
                    <span className="badge b-navy" style={{ fontSize: 9 }}>{c.buque}</span>
                    <span className="badge b-gray" style={{ fontSize: 9 }}>{SECCION_LABEL[c.seccion] || c.seccion}</span>
                    <span className="badge b-blue" style={{ fontSize: 9 }}>{c.tipo === "estatutario" ? "Estat." : "Equipo"}</span>
                    {esSubvenc && <span className="badge b-teal" style={{ fontSize: 9 }}>Verificación</span>}
                  </div>
                  <DiasChip fechaStr={fechaRef} />
                </div>
                {esSubvenc
                  ? <>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}><span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>↳ {c.descripcion} · </span>{sv.descripcion}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Ventana: {sv.fecha_desde ? fmtDate(sv.fecha_desde) : "—"} → {fmtDate(sv.fecha_hasta)}{sv.observaciones && <span style={{ marginLeft: 8 }}>· {sv.observaciones}</span>}</div>
                  </>
                  : <>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>{c.descripcion}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{c.tipo === "estatutario" ? `Vence: ${fmtDate(c.fecha_vencimiento)}${c.emitido_por ? ` · ${c.emitido_por}` : ""}` : `Próx. servicio: ${fmtDate(c.fecha_proximo_servicio)}${c.proveedor ? ` · ${c.proveedor}` : ""}`}</div>
                  </>}
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(null); const [checkingAuth, setCheckingAuth] = useState(true);
  const [page, setPage] = useState("alertas"); const [certs, setCerts] = useState([]); const [subvencimientos, setSubvencimientos] = useState([]);
  const [loading, setLoading] = useState(true); const [notif, setNotif] = useState(null);
  const [selected, setSelected] = useState(null); const [editando, setEditando] = useState(null); const [creando, setCreando] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const notify = useCallback((text, type = "info") => { setNotif({ text, type }); setTimeout(() => setNotif(null), 4000); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setCheckingAuth(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  const loadCerts = useCallback(async () => {
    setLoading(true);
    try { const [c, sv] = await Promise.all([api.getCertificados(), api.getAllSubvencimientos()]); setCerts(c); setSubvencimientos(sv); }
    catch (e) { notify("Error: " + e.message, "error"); } finally { setLoading(false); }
  }, []);

  const reloadSubvencimientos = useCallback(async () => {
    try { setSubvencimientos(await api.getAllSubvencimientos()); } catch (e) { notify("Error: " + e.message, "error"); }
  }, []);

  useEffect(() => { if (session) loadCerts(); }, [session, loadCerts]);

  const getFechaRef = c => c.tipo === "estatutario" ? c.fecha_vencimiento : c.fecha_proximo_servicio;
  const countVencidos = certs.filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d < 0; }).length;
  const countCriticos = certs.filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d >= 0 && d <= 30; }).length;
  const totalAlertas = countVencidos + countCriticos;

  if (checkingAuth) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#213363" }}><style>{CSS}</style><div className="loading" style={{ color: "rgba(255,255,255,.5)" }}><span className="spin">◌</span></div></div>;
  if (!session) return <LoginScreen onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setSession(session))} />;

  const pageTitles = { alertas: "ALERTAS Y VENCIMIENTOS", "ad-estat": "ATLANTIC DAMA — ESTATUTARIOS", "ad-equipo": "ATLANTIC DAMA — EQUIPOS", "gdm-estat": "GOLONDRINA DE MAR — ESTATUTARIOS", "gdm-equipo": "GOLONDRINA DE MAR — EQUIPOS" };
  const pageConfig = { "ad-estat": { buque: "Atlantic Dama", tipo: "estatutario" }, "ad-equipo": { buque: "Atlantic Dama", tipo: "no_estatutario" }, "gdm-estat": { buque: "Golondrina de Mar", tipo: "estatutario" }, "gdm-equipo": { buque: "Golondrina de Mar", tipo: "no_estatutario" } };

  const NI = ({ id, icon, label, badge, sub }) => (
    <div className={`ni ${sub ? "sub" : ""} ${page === id ? "active" : ""}`} onClick={() => { setPage(id); setSidebarOpen(false); }}>
      <span className="ni-icon">{icon}</span><span>{label}</span>
      {badge > 0 && <span className="ni-badge">{badge}</span>}
    </div>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-header">
            <div className="sidebar-logo-wrap">
              <img src="/pL.png" alt="PL" className="sidebar-logo-img" />
              <div><div className="sidebar-logo-main">Certificados</div><div className="sidebar-logo-sub">Parana Logística</div></div>
            </div>
          </div>
          <NI id="alertas" icon="🔔" label="Alertas" badge={totalAlertas} />
          <div className="nav-section">Atlantic Dama</div>
          <NI id="ad-estat" icon="📋" label="Estatutarios" sub />
          <NI id="ad-equipo" icon="⚙️" label="Equipos" sub />
          <div className="nav-section">Golondrina de Mar</div>
          <NI id="gdm-estat" icon="📋" label="Estatutarios" sub />
          <NI id="gdm-equipo" icon="⚙️" label="Equipos" sub />
          <div style={{ flex: 1 }} />
          <div style={{ padding: "10px 16px", borderTop: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.35)", fontFamily: "var(--mono)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.email}</div>
            <div className="ni back" onClick={() => window.open(PORTAL_URL, "_self")}><span className="ni-icon">←</span><span>Volver al portal</span></div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,.25)", fontFamily: "var(--mono)", letterSpacing: 1, marginTop: 6 }}>CERTIFICADOS v1.3</div>
          </div>
        </nav>

        <div className={`overlay-menu ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />

        <div className="main">
          <div className="topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="hamburger no-print" onClick={() => setSidebarOpen(o => !o)}>☰</button>
              <div className="topbar-title">{pageTitles[page] || page}</div>
            </div>
            <div className="flex-gap">
              {countVencidos > 0 && <span className="badge b-red">{countVencidos} vencidos</span>}
              {countCriticos > 0 && <span className="badge b-orange">{countCriticos} críticos</span>}
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#DBEAFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--blue)", fontWeight: 700 }}>{session.user.email[0].toUpperCase()}</div>
            </div>
          </div>
          <div className="content">
            {loading ? <div className="loading"><span className="spin">◌</span> Cargando...</div> : <>
              {page === "alertas" && <PageAlertas certs={certs} subvencimientos={subvencimientos} onSelect={c => setSelected(c)} />}
              {pageConfig[page] && (
                <PageTabla certs={certs} buque={pageConfig[page].buque} tipo={pageConfig[page].tipo} subvencimientos={subvencimientos}
                  onSelect={c => setSelected(c)}
                  onNuevo={() => setCreando({ buque: pageConfig[page].buque, tipo: pageConfig[page].tipo, seccion: pageConfig[page].tipo === "estatutario" ? "GENERAL" : "FFA" })}
                  onSubvencimientosChange={reloadSubvencimientos} onCertsChange={loadCerts} notify={notify} />
              )}
            </>}
          </div>
        </div>
      </div>

      {selected && !editando && (
        <ModalVerCert cert={selected} subvencimientos={subvencimientos} onClose={() => setSelected(null)}
          onEdit={c => { setSelected(null); setEditando(c); }}
          onDelete={id => { setCerts(prev => prev.filter(c => c.id !== id)); setSelected(null); }}
          notify={notify} onSubvencimientosChange={reloadSubvencimientos} />
      )}
      {(editando || creando) && (
        <ModalCert cert={editando || creando} onClose={() => { setEditando(null); setCreando(null); }}
          onSave={saved => { if (editando) setCerts(prev => prev.map(c => c.id === saved.id ? saved : c)); else setCerts(prev => [...prev, saved]); setEditando(null); setCreando(null); }}
          notify={notify} />
      )}
      <Notif msg={notif} onClose={() => setNotif(null)} />
    </>
  );
}
