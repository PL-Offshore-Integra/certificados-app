import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./lib/supabase";

const PORTAL_URL = "https://integra.ploffshore.com";
const ERP_HOME_URL = "https://integra.ploffshore.com";
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
  if (dias < 0) return "vencido";   // rojo
  if (dias <= 60) return "critico"; // amarillo (<= 60 dias)
  return "ok";                       // verde (> 60 dias)
}
//  SEMAFORO DE VENCIMIENTOS  (rojo <0 / amarillo <=60 / verde >60)
function claseDias(dias) {
  if (dias === null) return "dias-sin";
  if (dias < 0) return "dias-vencido";
  if (dias <= 60) return "dias-critico";
  return "dias-ok";
}
// Duracion (dias >= 0): hasta 60 -> dias; despues -> meses o anios
function fmtDuracion(dias) {
  if (dias <= 60) return `${dias}d`;
  if (dias < 365) { const m = Math.round(dias / 30.44); return `${m} ${m === 1 ? "mes" : "meses"}`; }
  const a = Math.floor(dias / 365), m = Math.round((dias % 365) / 30.44);
  if (m >= 12) return `${a + 1} ${a + 1 === 1 ? "año" : "años"}`;
  if (m === 0) return `${a} ${a === 1 ? "año" : "años"}`;
  return `${a}a ${m}m`;
}
function fmtDuracionCompact(dias) {
  if (dias <= 60) return `${dias}d`;
  if (dias < 365) { const m = Math.round(dias / 30.44); return `${m}m`; }
  const a = Math.floor(dias / 365), m = Math.round((dias % 365) / 30.44);
  if (m >= 12) return `${a + 1}a`;
  if (m === 0) return `${a}a`;
  return `${a}a ${m}m`;
}
function labelDias(dias) {
  if (dias === null) return "Sin fecha";
  if (dias === 0) return "Vence hoy";
  if (dias < 0) return `Vencido ${fmtDuracion(Math.abs(dias))}`;
  return fmtDuracion(dias);
}
function labelDiasCompact(dias) {
  if (dias === null) return "—";
  if (dias === 0) return "Hoy";
  if (dias < 0) return `Venc. ${fmtDuracionCompact(Math.abs(dias))}`;
  return fmtDuracionCompact(dias);
}
function fechaDefault90() { const d = new Date(); d.setDate(d.getDate() + 90); return d.toISOString().slice(0, 10); }
function fechaHoy() { return new Date().toISOString().slice(0, 10); }

//  API 
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

//  CSS 
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

/*  TOKENS · INTEGRA Brand Book v1.0 
   Los nombres de variable son los que ya usaba esta app: cambian los valores,
   no los selectores. Navy = estructura, nunca acción. Un solo color de acción.
    */
:root{
  --navy:#082F4E;--blue:#056D76;--mid:#4A5560;--light:#C9D0D6;
  --bg:#FAFBFC;--surface:#FFFFFF;--surface2:#F4F6F8;--surface3:#E4E8EC;
  --border:#E4E8EC;--border2:#C9D0D6;
  --text:#0F1419;--muted:#4A5560;--muted2:#7A8792;
  --accent:#056D76;--accent2:#0E7A5F;--warn:#8F5A0B;--danger:#B3261E;
  --purple:#4A5560;--teal:#056D76;--orange:#8F5A0B;
  --mono:'IBM Plex Mono',monospace;--sans:'IBM Plex Sans',sans-serif;--r:4px;--r2:4px;
  --nav:#082F4E;--action:#056D76;--action-press:#04565D;
  --tr:color 120ms cubic-bezier(.2,0,.38,.9),background-color 120ms cubic-bezier(.2,0,.38,.9),border-color 120ms cubic-bezier(.2,0,.38,.9);
}
/* Instancia: se activa con <html data-instance="pl-offshore"> en index.html */
[data-instance="pl-offshore"]{--nav:#002247;--action:#002247;--blue:#002247;--accent:#002247}
[data-instance="clean-sea"]{--nav:#1B3765;--action:#006945;--blue:#006945;--accent:#006945}
[data-instance="terramare"]{--nav:#213363;--action:#1F5285;--blue:#1F5285;--accent:#1F5285}

body{background:var(--bg);color:var(--text);font-family:var(--sans);font-size:15px;line-height:1.55;min-height:100vh;overflow-x:hidden}
*:focus-visible{outline:2px solid var(--action);outline-offset:2px}
.app{display:flex;min-height:100vh;overflow-x:hidden}

/*  NAVEGACIÓN LATERAL · 240px, colapsa a iconos en mobile  */
.sidebar{width:240px;min-width:240px;background:var(--nav);display:flex;flex-direction:column}
.sidebar-header{border-bottom:1px solid rgba(255,255,255,.14)}
.sidebar-logo-wrap{padding:14px 16px;display:flex;align-items:center;gap:12px;height:56px}
.sidebar-logo-img{width:28px;height:28px;object-fit:contain;border-radius:var(--r);border:0;background:rgba(255,255,255,.14)}
.sidebar-logo-main{font-size:14px;font-weight:600;color:#fff;letter-spacing:0;text-transform:none}
.sidebar-logo-sub{font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.72);margin-top:2px;letter-spacing:.06em;text-transform:uppercase}
.nav-section{padding:16px 16px 6px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:rgba(255,255,255,.72);text-transform:uppercase}
.ni{display:flex;align-items:center;gap:10px;padding:9px 16px;font-size:14px;font-weight:500;cursor:pointer;color:rgba(255,255,255,.72);border-left:3px solid transparent;transition:var(--tr);user-select:none;min-height:36px}
.ni:hover{color:#fff;background:rgba(255,255,255,.08)}
.ni.active{color:#fff;border-left-color:var(--action);background:rgba(255,255,255,.12);font-weight:500}
.ni.sub{padding-left:34px;font-size:13px;font-weight:400}
.ni.sub.active{font-weight:500}
.ni.back{color:rgba(255,255,255,.72);font-size:13px;border-top:1px solid rgba(255,255,255,.14);margin-top:6px}
.ni.back:hover{color:#fff}
.ni-icon{font-size:14px;width:16px;text-align:center;flex-shrink:0}
.ni-badge{margin-left:auto;background:rgba(255,255,255,.14);color:#fff;font-family:var(--mono);font-size:11px;font-weight:500;padding:2px 7px;border-radius:3px;min-width:20px;text-align:center}
.ni-badge.amber{background:rgba(255,255,255,.14)}
.ni-badge.gray{background:rgba(255,255,255,.14);color:rgba(255,255,255,.72)}

/*  BARRA SUPERIOR · 56px  */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0}
.topbar{background:var(--surface);border-bottom:1px solid var(--border);padding:0 24px;height:56px;display:flex;align-items:center;justify-content:space-between}
.topbar-title{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:24px;background:var(--bg)}

/*  PANELES · blancos, borde 1px, radio 4, sin sombra  */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:24px;margin-bottom:16px}
.card-title{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px}

/*  KPIs  */
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:24px}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px}
.stat-label{font-family:var(--mono);font-size:11px;color:var(--muted);font-weight:500;letter-spacing:.08em;margin-bottom:8px;text-transform:uppercase}
.stat-value{font-family:var(--mono);font-size:30px;font-weight:600;color:var(--navy);font-variant-numeric:tabular-nums}
.va{color:var(--navy)}.vg{color:var(--accent2)}.vr{color:var(--danger)}.vp{color:var(--muted)}.vm{color:var(--warn)}.vgr{color:var(--muted)}

/*  TABLAS · fila 40px, regla marcada de 2px navy, dato en mono  */
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;padding:10px 12px;text-align:left;border-bottom:2px solid var(--navy);white-space:nowrap;background:var(--surface)}
td{padding:12px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr.click:hover td{background:var(--surface2);cursor:pointer}
.tracker-table th{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;padding:10px 12px;text-align:left;border-bottom:2px solid var(--navy);white-space:nowrap;background:var(--surface);position:sticky;top:0;z-index:2}
.tracker-table th.sortable{cursor:pointer;user-select:none}
.tracker-table th.sortable:hover{color:var(--navy)}
.tracker-table td{padding:12px;border-bottom:1px solid var(--border);vertical-align:middle}
.tracker-table tr:hover td{background:var(--surface2);cursor:pointer}
.tracker-table tr:last-child td{border-bottom:none}

/*  FILTROS  */
.filter-row{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
.filter-input,.filter-select{background:var(--surface);border:1px solid var(--border2);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:14px;height:36px;padding:0 10px;outline:none;min-width:150px;transition:var(--tr)}
.filter-select{cursor:pointer}
.filter-input:focus,.filter-select:focus{border-width:2px;border-color:var(--action);padding:0 9px}

/*  BADGES DE ESTADO · fondo tenue, texto de estado, mono caja alta  */
.badge{display:inline-flex;align-items:center;font-family:var(--mono);font-size:11px;font-weight:500;padding:3px 8px;border-radius:3px;white-space:nowrap;letter-spacing:.06em;text-transform:uppercase}
.b-amber{background:#FBF1E3;color:#8F5A0B;border:0}
.b-blue{background:#E6F1F2;color:#056D76;border:0}
.b-teal{background:#E8F3EF;color:#0E7A5F;border:0}
.b-red{background:#FAEAE8;color:#B3261E;border:0}
.b-purple{background:#F4F6F8;color:#4A5560;border:0}
.b-orange{background:#FBF1E3;color:#8F5A0B;border:0}
.b-green{background:#E8F3EF;color:#0E7A5F;border:0}
.b-gray{background:#F4F6F8;color:#4A5560;border:0}
.urgdot{width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:6px;flex-shrink:0}

/*  BOTONES · un solo primario por vista. Nada se mueve al presionar  */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;font-family:var(--sans);font-size:14px;font-weight:500;letter-spacing:0;height:36px;padding:0 16px;border-radius:var(--r);border:1px solid transparent;cursor:pointer;transition:var(--tr);white-space:nowrap;text-transform:none}
.btn-primary{background:var(--action);color:#fff}
.btn-primary:hover{background:var(--navy)}
.btn-primary:active{background:var(--action-press)}
.btn-success{background:var(--accent2);color:#fff}
.btn-success:hover{background:#0B6249}
.btn-danger{background:var(--surface);color:var(--danger);border-color:var(--border2)}
.btn-danger:hover{background:#FAEAE8;border-color:var(--danger)}
.btn-ghost{background:var(--surface);color:var(--muted);border-color:var(--border2)}
.btn-ghost:hover{color:var(--text);background:var(--surface2)}
.btn-warn{background:var(--surface);color:var(--warn);border-color:var(--border2)}
.btn-warn:hover{background:#FBF1E3;border-color:var(--warn)}
.btn-cond{background:var(--surface);color:var(--muted);border-color:var(--border2)}
.btn-cond:hover{background:var(--surface2)}
.btn-confirm{background:var(--surface);color:var(--warn);border-color:var(--border2)}
.btn-confirm:hover{background:#FBF1E3}
.btn-sm{height:28px;padding:0 12px;font-size:13px}
.btn:disabled{background:var(--surface3);color:var(--muted2);border-color:transparent;cursor:not-allowed}

/*  CAPAS FLOTANTES · la única sombra del sistema  */
.overlay{position:fixed;inset:0;background:rgba(15,20,25,.45);display:flex;align-items:flex-start;justify-content:center;z-index:100;padding:24px;overflow-y:auto}
.modal{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);width:100%;max-width:860px;margin:auto;box-shadow:0 8px 24px rgba(15,20,25,.14)}
.modal-lg{max-width:1120px}
.mhdr{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:20px 24px;border-bottom:1px solid var(--border);background:var(--surface);border-radius:var(--r) var(--r) 0 0}
.mtitle{font-size:18px;font-weight:600;letter-spacing:0;color:var(--navy)}
.mbody{padding:24px}
.mftr{padding:16px 24px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px;background:var(--surface2);border-radius:0 0 var(--r) var(--r)}
.mclose{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1;transition:var(--tr)}
.mclose:hover{color:var(--navy)}
@keyframes fadeIn{from{opacity:1}to{opacity:1}}
@keyframes slideUp{from{opacity:1}to{opacity:1}}

/*  FORMULARIOS · campo 36px, foco borde 2px  */
.fg{display:flex;flex-direction:column;gap:6px}
.fg label{font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;font-weight:500}
.fg input,.fg select,.fg textarea{background:var(--surface);border:1px solid var(--border2);border-radius:var(--r);color:var(--text);font-family:var(--sans);font-size:14px;height:36px;padding:0 12px;outline:none;transition:var(--tr)}
.fg textarea{resize:vertical;min-height:72px;height:auto;padding:10px 12px}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-width:2px;border-color:var(--action);padding:0 11px}
.fg textarea:focus{padding:9px 11px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
.form-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px}
.form-section{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;margin:32px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.items-edit th{font-family:var(--mono);font-size:11px;background:var(--surface)}
.items-edit td{padding:6px 8px}
.items-edit input,.items-edit select{background:var(--surface);border:1px solid var(--border2);border-radius:var(--r);color:var(--text);font-family:var(--mono);font-size:13px;height:32px;padding:0 8px;width:100%;outline:none;transition:var(--tr)}
.items-edit input:focus,.items-edit select:focus{border-width:2px;border-color:var(--action);padding:0 7px}

/*  TRAZABILIDAD  */
.tl{list-style:none}
.tl-item{display:flex;gap:12px;padding-bottom:16px;position:relative}
.tl-item:not(:last-child)::before{content:'';position:absolute;left:11px;top:24px;bottom:0;width:1px;background:var(--border)}
.tl-dot{width:24px;height:24px;border-radius:50%;background:var(--surface2);border:1px solid var(--border2);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;z-index:1}
.tl-dot.c{border-color:var(--action);color:var(--action);background:#E6F1F2}
.tl-dot.a{border-color:var(--accent2);color:var(--accent2);background:#E8F3EF}
.tl-dot.r{border-color:var(--danger);color:var(--danger);background:#FAEAE8}
.tl-dot.u{border-color:var(--warn);color:var(--warn);background:#FBF1E3}
.tl-ev{font-size:14px;font-weight:500;color:var(--navy)}
.tl-meta{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:4px}

/*  FILA DE REQUISICIÓN · el estado va en el borde izquierdo de 3px  */
.req-row{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;margin-bottom:12px;cursor:pointer;transition:var(--tr)}
.req-row:hover{border-color:var(--navy)}
.req-row.unread{border-left:3px solid var(--action)}
.req-row.devuelto{border-left:3px solid var(--warn)}
.req-row.pend-confirm{border-left:3px solid var(--warn)}
.req-title{font-weight:600;font-size:15px;margin-bottom:6px;color:var(--navy)}
.req-meta{display:flex;gap:16px;font-size:13px;color:var(--muted);flex-wrap:wrap;align-items:center}

/*  AVISOS  */
.notif{position:fixed;bottom:24px;right:24px;background:var(--surface);border:1px solid var(--border);border-left-width:3px;border-radius:var(--r);padding:14px 16px;font-size:14px;z-index:300;max-width:360px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 24px rgba(15,20,25,.14)}
.n-green{border-left-color:var(--accent2)}.n-red{border-left-color:var(--danger)}.n-amber{border-left-color:var(--warn)}.n-blue{border-left-color:var(--action)}
.info-box{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px;font-size:14px}
.info-box.accent{border-left:3px solid var(--action)}
.info-box.warn{border-left:3px solid var(--warn)}
.info-box.danger{border-left:3px solid var(--danger)}
.info-box.orange{border-left:3px solid var(--warn)}

/*  UTILIDADES  */
.flex-gap{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.flex-between{display:flex;justify-content:space-between;align-items:center;gap:12px}
.mt8{margin-top:8px}.mt12{margin-top:12px}.mt16{margin-top:16px}
.mb8{margin-bottom:8px}.mb12{margin-bottom:12px}.mb16{margin-bottom:16px}
.text-mono{font-family:var(--mono);font-variant-numeric:tabular-nums}
.text-muted{color:var(--muted)}
.empty-state{text-align:center;padding:48px 24px;color:var(--muted);font-size:15px}
.loading{display:flex;align-items:center;justify-content:center;padding:48px;color:var(--muted);gap:12px;font-size:15px}
.spin{animation:spin 1s linear infinite}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.kbar{margin-bottom:12px}
.kbar-lbl{display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px}
.kbar-track{height:6px;background:var(--surface3);border-radius:3px;overflow:hidden;border:0}
.kbar-fill{height:100%;border-radius:3px}
.tabs-row{display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:24px;overflow-x:auto}
.tab{font-size:14px;font-weight:500;padding:10px 16px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent;transition:var(--tr);text-transform:none;letter-spacing:0;margin-bottom:-1px;white-space:nowrap}
.tab:hover{color:var(--navy)}
.tab.active{color:var(--action);border-bottom-color:var(--action)}
.grupo-chip{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:3px;font-family:var(--mono);font-size:12px;font-weight:500;background:var(--surface2);color:var(--navy);border:1px solid var(--border);flex-shrink:0}
.tag{display:inline-block;font-family:var(--mono);font-size:11px;padding:3px 7px;background:var(--surface2);border:1px solid var(--border);border-radius:3px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
.fecha-chip{display:inline-flex;flex-direction:column;gap:2px;font-family:var(--mono);font-size:11px;color:var(--text);white-space:nowrap;font-variant-numeric:tabular-nums}
.fecha-chip span:first-child{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.tracker-simple-row{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:16px}
.tracker-simple-row.en-curso{border-left:3px solid var(--warn)}
.tracker-simple-row.entregado{border-left:3px solid var(--accent2)}
.req-row-actions{display:flex;flex-direction:row;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);justify-content:flex-end}
.cotiz-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:16px}

/*  MOBILE  */
@media (max-width: 768px) {
  .app { flex-direction: column; }
  .sidebar { display: none; }
  .main { width: 100%; padding-bottom: 72px; }
  .topbar { padding: 0 16px; }
  .content { padding: 16px; }
  .card { padding: 16px; margin-bottom: 12px; }
  .stats { grid-template-columns: 1fr 1fr; gap: 12px; }
  .stat { padding: 14px; }
  .stat-value { font-size: 24px; }
  .form-grid, .form-grid-3 { grid-template-columns: 1fr; gap: 12px; }
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { font-size: 13px; min-width: 540px; }
  th, td { padding: 10px 8px; }
  .tracker-table th, .tracker-table td { padding: 10px 8px; }
  .filter-row { flex-direction: column; align-items: stretch; }
  .filter-input, .filter-select { min-width: unset; width: 100%; }
  .btn { height: 44px; padding: 0 14px; }
  .btn-sm { height: 36px; }
  .mftr { flex-wrap: wrap; gap: 8px; }
  .mftr .btn { flex: 1; justify-content: center; }
  .overlay { padding: 0; align-items: flex-end; }
  .modal { border-radius: var(--r) var(--r) 0 0; max-width: 100%; max-height: 92vh; overflow-y: auto; }
  .modal-lg { max-width: 100%; }
  .req-meta { gap: 10px; }
  .req-title { font-size: 15px; }
  .tabs-row { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .tab { font-size: 13px; padding: 10px 12px; }
  .notif { bottom: 88px; right: 12px; left: 12px; max-width: unset; }
  .items-edit { font-size: 13px; }
  .items-edit th, .items-edit td { padding: 6px; }
  .items-edit table { min-width: 380px; }
  .req-row-actions{flex-direction:column;gap:8px;width:100%}
  .req-row-actions .btn{width:100%}
  .mftr{flex-direction:column;align-items:stretch;gap:8px}
  .mftr .btn{width:100%;flex:unset}
  .mftr .btn-success{order:-3}.mftr .btn-primary{order:-2}.mftr .btn-danger{order:-1}
  .card-title{flex-direction:column;align-items:flex-start;gap:10px}
  .card-title .btn{width:100%}
  .filter-row .btn{width:100%}
  .form-footer-actions{flex-direction:column !important;align-items:stretch !important}
  .form-footer-actions .btn{width:100%}
  .cotiz-grid{grid-template-columns:1fr !important}
  .req-row .flex-between{flex-direction:column;align-items:flex-start;gap:10px}
  .req-row .flex-between > .flex-gap:last-child{width:100%;flex-direction:column;gap:8px}
  .req-row .flex-between > .flex-gap:last-child .btn{width:100%}
}

/*  NAVEGACIÓN INFERIOR (solo mobile)  */
@media (max-width: 768px) {
  .mobile-nav {
    display: flex !important;
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--nav); border-top: 1px solid rgba(255,255,255,.14);
    z-index: 50; height: 64px;
    justify-content: space-around; align-items: center;
    padding: 0 4px; overflow-x: auto;
  }
  .mobile-nav-item {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    cursor: pointer; padding: 8px; border-radius: var(--r);
    color: rgba(255,255,255,.72); transition: var(--tr); flex: 1;
    position: relative; min-width: 48px; min-height: 48px; justify-content: center;
  }
  .mobile-nav-item.active { color: #fff; background: rgba(255,255,255,.12); }
  .mobile-nav-item:hover { color: #fff; }
  .mobile-nav-icon { font-size: 16px; line-height: 1; }
  .mobile-nav-label { font-family: var(--mono); font-size: 11px; font-weight: 500; letter-spacing: .06em; text-transform: uppercase; text-align: center; }
  .mobile-nav-badge {
    position: absolute; top: 4px; right: 8px;
    background: rgba(255,255,255,.14); color: #fff;
    font-family: var(--mono); font-size: 10px; font-weight: 500;
    padding: 1px 5px; border-radius: 3px; min-width: 16px; text-align: center;
  }
  .mobile-nav-badge.amber { background: rgba(255,255,255,.14); }
  .mobile-nav-badge.gray { background: rgba(255,255,255,.14); }
}
@media (min-width: 769px) {
  .mobile-nav { display: none !important; }
}

/*  ARMAZÓN · shell del prototipo 
   La navegación del módulo es BLANCA con borde derecho; el navy es la barra
   superior. El ítem activo lleva borde izquierdo de 3px en el color de acción.
    */
.shell{display:grid;grid-template-columns:248px minmax(0,1fr);align-items:stretch;min-height:100vh}
.shell.is-collapsed{grid-template-columns:68px minmax(0,1fr)}

.appbar{height:56px;background:var(--nav);display:flex;align-items:center;gap:24px;padding:0 24px;flex:0 0 auto}
.appbar-iso{height:26px;width:auto;object-fit:contain;display:block;flex:0 0 auto}
.appbar-div{width:1px;height:24px;background:rgba(255,255,255,.14);flex:0 0 auto}
.appbar-instance{font:500 14px/1.2 var(--sans);color:#fff;white-space:nowrap;flex:0 0 auto}
.appbar-search{flex:1;max-width:380px;display:flex;align-items:center;gap:10px;height:32px;padding:0 12px;background:rgba(255,255,255,.10);border:0;border-radius:var(--r);font:400 14px/1.2 var(--sans);color:rgba(255,255,255,.72)}
.appbar-search::placeholder{color:rgba(255,255,255,.72)}
.appbar-tools{margin-left:auto;display:flex;align-items:center;gap:16px}
.appbar-avatar{width:28px;height:28px;border-radius:var(--r);background:rgba(255,255,255,.14);color:#fff;font-family:var(--mono);font-size:12px;font-weight:500;line-height:28px;text-align:center;flex:0 0 auto}
.appbar-user{font:500 13px/1.25 var(--sans);color:#fff;white-space:nowrap}
.appbar-link{background:none;border:0;padding:0;cursor:pointer;font:500 13px/1.2 var(--sans);color:rgba(255,255,255,.86);white-space:nowrap}
.appbar-link:hover{color:#fff;text-decoration:underline}

.sidebar{width:auto;min-width:0;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column}
.sidebar-header{border-bottom:1px solid var(--border);padding:16px;display:flex;align-items:center;gap:12px;min-height:69px}
.sidebar-logo-img{width:32px;height:32px;object-fit:contain;border:0;border-radius:0;background:none;flex:0 0 auto}
.sidebar-logo-main{font:600 15px/1.3 var(--sans);color:var(--navy);letter-spacing:0;text-transform:none}
.sidebar-logo-sub{font-family:var(--mono);font-size:11px;font-weight:500;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-top:2px}
.sidebar-nav{flex:1;padding:12px 0;overflow-y:auto}
.nav-section{padding:14px 16px 8px;font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.08em;color:var(--muted);text-transform:uppercase;text-align:left}
.ni{display:flex;align-items:center;gap:12px;width:100%;padding:9px 16px 9px 13px;background:transparent;border:0;border-left:3px solid transparent;cursor:pointer;text-align:left;font:400 14px/1.3 var(--sans);color:var(--muted);transition:var(--tr);min-height:38px}
.ni:hover{background:var(--surface2);color:var(--navy)}
.ni.active{background:var(--surface2);border-left-color:var(--action);color:var(--navy);font-weight:500}
.ni-ico{display:block;flex:0 0 auto;color:var(--muted2)}
.ni.active .ni-ico{color:var(--action)}
.ni-label{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ni-badge{margin-left:auto;font-family:var(--mono);font-size:11px;font-weight:500;color:var(--muted);background:var(--surface2);padding:3px 6px;border-radius:3px;min-width:22px;text-align:center;border:1px solid var(--border)}
.ni.active .ni-badge{color:var(--action);background:var(--surface);border-color:var(--border2)}
.ni-badge.amber{color:var(--warn)}
.ni-badge.gray{color:var(--muted)}
.sidebar-foot{border-top:1px solid var(--border);padding:12px 8px;display:flex;flex-direction:column;gap:2px}
.sidebar-foot-btn{display:flex;align-items:center;gap:12px;width:100%;padding:9px 10px;background:none;border:0;border-radius:var(--r);cursor:pointer;font:500 13px/1.2 var(--sans);color:var(--muted);transition:var(--tr)}
.sidebar-foot-btn:hover{background:var(--surface2);color:var(--navy)}
.sidebar-foot-meta{padding:8px 10px 0;font-family:var(--mono);font-size:11px;font-weight:500;line-height:1.6;letter-spacing:.06em;color:var(--muted2)}
.shell.is-collapsed .sidebar-header{justify-content:center;padding:16px 8px}
.shell.is-collapsed .ni{justify-content:center;padding:9px 8px 9px 5px}
.shell.is-collapsed .sidebar-foot-btn{justify-content:center}

/*  encabezado de pantalla  */
.pagehead{background:var(--surface);border-bottom:1px solid var(--border);padding:16px 24px;flex:0 0 auto}
.crumb{display:flex;align-items:center;gap:8px;font:400 13px/1.2 var(--sans);color:var(--muted)}
.crumb button{background:none;border:0;padding:0;cursor:pointer;font:400 13px/1.2 var(--sans);color:var(--action)}
.crumb button:hover{text-decoration:underline;color:var(--navy)}
.crumb-current{color:var(--text)}
.pagehead-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-top:10px}
.pagehead h1{font:600 24px/1.25 var(--sans);color:var(--navy);margin:0}
.pagehead p{font:400 13px/1.45 var(--sans);color:var(--muted);margin:6px 0 0;max-width:70ch}
.pagehead-actions{display:flex;gap:8px;flex:0 0 auto}

@media (max-width:768px){
  .shell,.shell.is-collapsed{grid-template-columns:1fr}
  .sidebar{display:none}
  .appbar{gap:12px;padding:0 16px}
  .appbar-search,.appbar-instance{display:none}
  .pagehead{padding:14px 16px}
  .pagehead-row{flex-direction:column;align-items:stretch;gap:12px}
  .pagehead-actions .btn{flex:1}
  .main{padding-bottom:72px}
}

/*  SEMAFORO DE VENCIMIENTOS · rojo=vencido · amarillo<=60d · verde>60d  */
.dias-chip{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:11px;font-weight:600;padding:3px 9px;border-radius:3px;white-space:nowrap;letter-spacing:.02em;line-height:1.25;font-variant-numeric:tabular-nums}
.dias-chip::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;flex-shrink:0;opacity:.85}
.dias-vencido{background:#FAEAE8;color:#B3261E}
.dias-critico{background:#FBF1E3;color:#8F5A0B}
.dias-ok{background:#E8F3EF;color:#0E7A5F}
.dias-sin{background:#F4F6F8;color:#7A8792}
.dias-sin::before{opacity:.5}

/*  VISIBILIDAD TABLA vs TARJETAS · evita el resumen duplicado en desktop  */
.desktop-table{display:block}
.mobile-cards{display:none}
@media(max-width:768px){
  .desktop-table{display:none}
  .mobile-cards{display:block}
}

`;

//  HELPERS 
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
  return <span className={`dias-chip ${claseDias(dias)}`}>{labelDias(dias)}</span>;
}
function PrintChip({ fechaStr }) {
  const dias = diasHasta(fechaStr);
  // El PDF se abre en otra ventana sin el CSS de la app: van colores inline. Mismo umbral de 60 dias.
  const [bg, col] = dias === null ? ["#F3F4F6", "#6B7280"]
    : dias < 0 ? ["#FEE2E2", "#991B1B"]
    : dias <= 60 ? ["#FEF3C7", "#92400E"]
    : ["#D1FAE5", "#065F46"];
  return <span className="pchip" style={{ background: bg, color: col }}>{labelDiasCompact(dias)}</span>;
}

//  LOGIN PAGE — DS §8.7 / §9.1-C / §11.12.3 
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      onLogin();
    } catch { setError("Email o contraseña incorrectos"); }
    finally { setLoading(false); }
  };

  // [DS-1.5][DS-8.7][DS-9.1-C] paleta scoped: #0B1629, teal #1A7A6E, gold #B8942A
  const loginCSS = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
    .login-page{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr) 560px;background:#FFFFFF;font-family:'IBM Plex Sans',sans-serif;color:#0F1419;text-align:left}
    .login-bg-overlay,.login-bg-lines{display:none}
    .login-split{display:contents}
    .login-left{display:flex;flex-direction:column;justify-content:space-between;gap:48px;padding:56px 64px;background:#002247;border:0;text-align:left}
    .login-left-integra-wrap{margin:0}
    .login-left-integra-img{height:52px;width:auto;object-fit:contain;opacity:1;display:block}
    .login-left-divider{width:100%;height:1px;background:rgba(255,255,255,.14);margin:24px 0}
    .login-left-company{display:flex;align-items:center;gap:14px;margin:0}
    .login-left-company-logo{width:40px;height:40px;border-radius:4px;object-fit:contain;border:0;background:rgba(255,255,255,.14);padding:4px}
    .login-left-company-name{font:600 24px/1.25 'IBM Plex Sans',sans-serif;color:#fff;letter-spacing:0}
    .login-left-line{width:56px;height:3px;background:#F8BC05;margin:24px 0}
    .login-left-sub{font:400 15px/1.55 'IBM Plex Sans',sans-serif;color:rgba(255,255,255,.82);max-width:420px;font-style:normal}
    .login-right{width:auto;display:flex;align-items:center;justify-content:center;padding:56px 64px;background:#FFFFFF}
    .login-card{width:100%;max-width:420px;background:transparent;border:0;border-radius:0;padding:0;backdrop-filter:none;text-align:left}
    .login-card-eyebrow{font:500 11px/1.2 'IBM Plex Mono',monospace;letter-spacing:.08em;color:#4A5560;text-transform:uppercase;margin-bottom:12px}
    .login-card-title{font:600 24px/1.25 'IBM Plex Sans',sans-serif;color:#082F4E;margin-bottom:8px}
    .login-card-sub{font:400 15px/1.55 'IBM Plex Sans',sans-serif;color:#4A5560;letter-spacing:0;margin-bottom:28px;text-transform:none}
    .login-fg{display:flex;flex-direction:column;gap:6px;margin-bottom:16px}
    .login-fg label{font:500 11px/1.2 'IBM Plex Mono',monospace;color:#4A5560;letter-spacing:.08em;text-transform:uppercase}
    .login-fg input{border:1px solid #C9D0D6;border-radius:4px;height:40px;padding:0 12px;font:400 14px/1.2 'IBM Plex Sans',sans-serif;color:#0F1419;background:#FFFFFF;outline:none;transition:border-color 120ms cubic-bezier(.2,0,.38,.9)}
    .login-fg input::placeholder{color:#7A8792}
    .login-fg input:focus{border-width:2px;border-color:#002247;padding:0 11px}
    .login-btn{width:100%;height:44px;padding:0 16px;margin-top:24px;background:#F8BC05;color:#002247;border:none;border-radius:4px;font:600 15px/1.2 'IBM Plex Sans',sans-serif;cursor:pointer;transition:background-color 120ms cubic-bezier(.2,0,.38,.9);letter-spacing:0}
    .login-btn:hover{background:#DCA704}
    .login-btn:disabled{background:#E4E8EC;color:#7A8792;cursor:not-allowed}
    .login-error{background:#FFFFFF;color:#0F1419;border:1px solid #E4E8EC;border-left:3px solid #B3261E;border-radius:4px;padding:12px 16px;font:400 13px/1.45 'IBM Plex Sans',sans-serif;margin-bottom:16px}
    .login-footer{text-align:left;font:500 11px/1.2 'IBM Plex Mono',monospace;color:#4A5560;margin-top:32px;letter-spacing:.06em}
    .login-back{text-align:left;margin-top:12px;font:500 14px/1.2 'IBM Plex Sans',sans-serif;color:#002247;cursor:pointer}
    .login-back:hover{text-decoration:underline}
    @media(max-width:900px){
      .login-page{grid-template-columns:1fr}
      .login-left{padding:40px 24px;gap:32px}
      .login-left-integra-img{height:40px}
      .login-left-sub{max-width:100%}
      .login-right{padding:40px 24px}
    }
  
  `;

  return (
    <>
      <style>{loginCSS}</style>
      <div className="login-page">
        <div className="login-bg-lines" />
        <div className="login-bg-overlay" />
        <div className="login-split">

          {/*  Izquierda: marca INTEGRA  */}
          <div className="login-left">
            <div className="login-left-integra-wrap">
              <img src="/integra-logo-white-noclaim.svg" alt="INTEGRA" className="login-left-integra-img" />
            </div>
            <div className="login-left-divider" />
            <div className="login-left-company">
              <img src="/PL.png" alt="PL Offshore" className="login-left-company-logo" />
              <div className="login-left-company-name">PL Offshore | Certificados</div>
            </div>
            <div className="login-left-line" />
            <div className="login-left-sub">We Find the Way, or We Make One.</div>
          </div>

          {/*  Derecha: formulario  */}
          <div className="login-right">
            <div className="login-card">
              <div className="login-card-eyebrow">PL Offshore | Certificados</div>
              <div className="login-card-title">Acceso al portal</div>
              <div className="login-card-sub">Solo personal autorizado</div>
              {error && <div className="login-error">{error}</div>}
              <form onSubmit={handleLogin}>
                <div className="login-fg">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@paranalogistica.com.ar" required autoFocus />
                </div>
                <div className="login-fg">
                  <label>Contraseña</label>
                  <input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required />
                </div>
                <button type="submit" className="login-btn" disabled={loading}>{loading ? "Ingresando..." : "Ingresar →"}</button>
              </form>
              <div className="login-footer">
                <button onClick={() => window.open(ERP_HOME_URL, "_self")}>← Volver al ERP</button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

//  MODAL SUBVENCIMIENTO 
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
    if (!form.descripcion.trim()) return alert("La descripción es obligatoria");
    setSaving(true);
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
          <div className="mt16">
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: "var(--navy)", marginBottom: 8 }}>Documento adjunto</div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => handleUpload(e.target.files[0])} />
            {form.documento_url
              ? <div className="doc-adjunto"><span></span><a href={form.documento_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", flex: 1 }}>{form.documento_nombre || "Ver documento"}</a><button onClick={() => { set("documento_url", ""); set("documento_nombre", ""); }} style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer" }}>✕</button></div>
              : <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>{uploading ? " Subiendo..." : " Adjuntar PDF / imagen"}</button>}
          </div>
        </div>
        <div className="mftr"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button></div>
      </div>
    </div>
  );
}

//  BLOQUE SUBVENCIMIENTOS 
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
        <span style={{ fontSize: 12 }}>{expanded ? "" : ""}</span>
        <span>Verificaciones periódicas</span>
        {/* [H20][DS-2.3] font-size mínimo 9px */}
        <span style={{ background: "#BBF7D0", color: "#166534", fontSize: 9, padding: "1px 7px", borderRadius: 10, fontFamily: "var(--mono)", fontWeight: 700 }}>{svDeCert.length}</span>
        {hayProximos && <span className="badge b-amber" style={{ marginLeft: "auto" }}> Próxima</span>}
      </div>
      {expanded && (
        <div className="sv-list">
          {svDeCert.map((s, i) => {
            const diasD = diasHasta(s.fecha_hasta);
            const alertCls = claseDias(diasD);
            return (
              <div key={s.id} className="sv-item">
                <span className="sv-num">{i + 1}°</span>
                <span className="sv-desc">{s.descripcion}</span>
                <span className="sv-dates">{s.fecha_desde && s.fecha_hasta ? `${fmtDate(s.fecha_desde)} → ${fmtDate(s.fecha_hasta)}` : s.fecha_hasta ? `Hasta: ${fmtDate(s.fecha_hasta)}` : s.fecha_desde ? `Desde: ${fmtDate(s.fecha_desde)}` : "Sin fechas"}</span>
                {s.fecha_hasta && <span className={`dias-chip ${alertCls}`}>{labelDiasCompact(diasD)}</span>}
                {s.documento_url && <a href={s.documento_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 12 }} title={s.documento_nombre}></a>}
                <button onClick={e => { e.stopPropagation(); onEdit(s); }} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}></button>
                <button onClick={e => { e.stopPropagation(); onDelete(s.id); }} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 11 }}></button>
              </div>
            );
          })}
          <button className="sv-add-btn" onClick={e => { e.stopPropagation(); onAdd(); }}>＋ Agregar verificación / subvencimiento</button>
        </div>
      )}
    </div>
  );
}

//  MODAL EDITAR/CREAR CERT 
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
    if (!form.descripcion.trim()) return alert("La descripción es obligatoria");
    setSaving(true);
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
          <div className="mt16">
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: "var(--navy)", marginBottom: 8 }}>Documento adjunto</div>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={e => handleUpload(e.target.files[0])} />
            {form.documento_url
              ? <div className="doc-adjunto"><span></span><a href={form.documento_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", flex: 1 }}>{form.documento_nombre || "Ver documento"}</a><button onClick={() => { set("documento_url", ""); set("documento_nombre", ""); }} style={{ background: "none", border: "none", color: "var(--muted2)", cursor: "pointer" }}>✕</button></div>
              : <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current.click()} disabled={uploading}>{uploading ? " Subiendo..." : " Adjuntar PDF / imagen"}</button>}
          </div>
        </div>
        <div className="mftr"><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button></div>
      </div>
    </div>
  );
}

//  MODAL VER CERT 
function ModalVerCert({ cert, subvencimientos, onClose, onEdit, onDelete, notify, onSubvencimientosChange }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
                <span className="badge b-navy">{cert.buque}</span>
                <span className="badge b-gray">{SECCION_LABEL[cert.seccion] || cert.seccion}</span>
                <span className="badge b-blue">{esEstat ? "Estatutario" : "Equipo"}</span>
                {fechaRef && <DiasChip fechaStr={fechaRef} />}
              </div>
            </div>
            <button className="mclose" onClick={onClose}>✕</button>
          </div>
          <div className="mbody">
            {/* [H15][DS-11.6] grid como clase CSS, no inline */}
            <div className="form-grid">
              {esEstat ? <>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Emitido por</div>{cert.emitido_por || "—"}</div>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>N° Certificado</div>{cert.nro_certificado || "—"}</div>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Fecha emisión</div>{fmtDate(cert.fecha_emision)}</div>
                <div className="info-box" style={{ background: dias !== null && dias < 0 ? "#FEF2F2" : dias !== null && dias <= 60 ? "#FFF7ED" : undefined }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Fecha vencimiento</div>
                  <strong style={{ color: dias !== null && dias < 0 ? "var(--danger)" : dias !== null && dias <= 60 ? "var(--orange)" : "inherit" }}>{fmtDate(cert.fecha_vencimiento)}</strong>
                </div>
              </> : <>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Proveedor</div>{cert.proveedor || "—"}</div>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>N° Certificado</div>{cert.nro_certificado || "—"}</div>
                <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Último servicio</div>{fmtDate(cert.fecha_ultimo_servicio)}</div>
                <div className="info-box" style={{ background: dias !== null && dias < 0 ? "#FEF2F2" : dias !== null && dias <= 60 ? "#FFF7ED" : undefined }}>
                  <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>Próximo servicio</div>
                  <strong style={{ color: dias !== null && dias < 0 ? "var(--danger)" : dias !== null && dias <= 60 ? "var(--orange)" : "inherit" }}>{fmtDate(cert.fecha_proximo_servicio)}</strong>
                </div>
              </>}
              {cert.nro_serie && <div className="info-box"><div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--mono)", marginBottom: 3, textTransform: "uppercase" }}>N° Serie</div>{cert.nro_serie}</div>}
            </div>
            {cert.observaciones && <div className="info-box mt8" style={{ fontSize: 12 }}><strong>Obs:</strong> {cert.observaciones}</div>}
            {cert.documento_url && <div className="doc-adjunto mt8"><span></span><a href={cert.documento_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", flex: 1 }}>{cert.documento_nombre || "Ver documento adjunto"}</a></div>}
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
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(true)} style={{ color: "var(--danger)", borderColor: "var(--danger)", marginRight: "auto" }}> Eliminar</button>
            <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => onEdit(cert)}> Editar</button>
          </div>
        </div>
      </div>
      {modalSv && <ModalSubvencimiento certId={cert.id} sv={modalSv === "new" ? null : modalSv} onClose={() => setModalSv(null)} onSave={() => { setModalSv(null); onSubvencimientosChange(); }} notify={notify} />}
    </>
  );
}

//  PRINT MODAL 
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
        th{font-size:9px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:#6381A7;padding:5px 8px;text-align:left;border-bottom:1.5px solid #D6E0ED;background:#F5F7FA;white-space:nowrap}
        td{padding:5px 8px;border-bottom:.5px solid #D6E0ED;vertical-align:top}
        tr:last-child td{border-bottom:none}
        .psv-row{background:#F9FFFE}
        .psv-row td{padding:3px 8px 3px 22px;font-size:9px;color:#6381A7;border-bottom:1px dashed #BBF7D0}
        .pchip{display:inline-flex;font-family:'DM Mono',monospace;font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px}
      </style>
    </head><body>${el.innerHTML}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); }, 400);
  };
  return (
    <div className="print-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="print-modal">
        <div className="print-modal-bar">
          <div><div style={{ fontWeight: 700, fontSize: 14 }}>Vista previa · {buque}</div><div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>{tipoLabel}</div></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" style={{ color: "#fff", borderColor: "rgba(255,255,255,.3)" }} onClick={onClose}>✕ Cerrar</button>
            <button className="btn btn-sm" style={{ background: "#fff", color: "var(--navy)" }} onClick={handlePrint}> Imprimir / Guardar PDF</button>
          </div>
        </div>
        <div className="print-body" id="print-content-area">
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
            <img src="/PL.png" alt="" style={{ width: 48, height: 48, borderRadius: "50%", border: "2px solid var(--navy)", objectFit: "cover" }} onError={e => e.target.style.display = "none"} />
            <div>
              <div style={{ fontSize: 10, fontFamily: "var(--mono)", color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>PL Offshore S.A.</div>
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
                      const col = dias !== null && dias < 0 ? "var(--danger)" : dias !== null && dias <= 60 ? "var(--warn)" : "inherit";
                      const rowBg = dias !== null && dias < 0 ? "#FFF5F5" : dias !== null && dias <= 60 ? "#FFFAF5" : "inherit";
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
                              <td style={{ textAlign: "center", color: "#888", fontSize: 9 }}>{certNums[c.id]}.{si + 1}</td>
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
            <span>PL Offshore S.A. · Sistema de Certificados v1.3</span>
            <span>{fechaStr}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

//  PAGE TABLA 
function PageTabla({ certs, buque, tipo, subvencimientos, onSelect, onNuevo, onSubvencimientosChange, onCertsChange, notify }) {
  const [filtroSeccion, setFiltroSeccion] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [showPrint, setShowPrint] = useState(false);
  const [modalSv, setModalSv] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [localOrder, setLocalOrder] = useState({});

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
        <input className="filter-input" placeholder=" Buscar..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select className="filter-select" value={filtroSeccion} onChange={e => setFiltroSeccion(e.target.value)}>
          <option value="">Todas las secciones</option>
          {secciones.map(s => <option key={s} value={s}>{SECCION_LABEL[s] || s}</option>)}
        </select>
        {(filtroSeccion || busqueda) && <button className="btn btn-ghost btn-sm" onClick={() => { setFiltroSeccion(""); setBusqueda(""); }}>✕</button>}
        <span style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{filtrados.length} certificados</span>
        <button className="btn btn-print btn-sm no-print" onClick={() => setShowPrint(true)}> Imprimir</button>
        <button className="btn btn-primary btn-sm no-print" onClick={onNuevo}>+ Agregar</button>
      </div>

      {Object.keys(grupos).length === 0
        ? <div className="empty-state"><div style={{ fontSize: 28, marginBottom: 8 }}></div>Sin certificados</div>
        : secciones.filter(s => grupos[s]?.length > 0).map(seccion => (
          <div key={seccion} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ padding: "8px 14px", background: "var(--navy)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{SECCION_LABEL[seccion] || seccion}</span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "rgba(255,255,255,.4)" }}>{grupos[seccion].length} items</span>
              {grupos[seccion].filter(c => (diasHasta(getFechaRef(c)) || 0) < 0).length > 0 && <span className="badge b-red" style={{ marginLeft: "auto" }}>{grupos[seccion].filter(c => (diasHasta(getFechaRef(c)) || 0) < 0).length} vencidos</span>}
              {grupos[seccion].filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d >= 0 && d <= 30; }).length > 0 && <span className="badge b-orange">{grupos[seccion].filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d >= 0 && d <= 30; }).length} críticos</span>}
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
                    const rowBg = alertColor === "vencido" ? "#FFF5F5" : alertColor === "critico" ? "#FFFAF5" : "inherit";
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
                            {tipo === "estatutario" && svDeCert.length > 0 && <span className="badge b-teal" style={{ marginLeft: 6, verticalAlign: "middle" }}>{svDeCert.length} verif.</span>}
                          </td>
                          <td className="text-mono" style={{ fontSize: 10, color: "var(--muted)" }}>{c.nro_certificado || "—"}</td>
                          <td style={{ fontSize: 11, color: "var(--muted)" }}>{tipo === "estatutario" ? (c.emitido_por || "—") : (c.proveedor || "—")}</td>
                          <td className="text-mono" style={{ fontSize: 11, color: "var(--muted)" }}>{tipo === "estatutario" ? fmtDate(c.fecha_emision) : fmtDate(c.fecha_ultimo_servicio)}</td>
                          <td className="text-mono" style={{ fontSize: 11, fontWeight: fechaRef ? 600 : 400, color: alertColor === "vencido" ? "var(--danger)" : alertColor === "critico" ? "var(--orange)" : "var(--navy)" }}>
                            {tipo === "estatutario" ? fmtDate(c.fecha_vencimiento) : fmtDate(c.fecha_proximo_servicio)}
                          </td>
                          <td><DiasChip fechaStr={fechaRef} /></td>
                          <td style={{ textAlign: "center" }}>{c.documento_url ? <a href={c.documento_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 14, color: "var(--blue)" }}></a> : <span style={{ color: "var(--muted2)", fontSize: 11 }}>—</span>}</td>
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
                    <div className="mobile-card-meta">{tipo === "estatutario" ? `Vence: ${fmtDate(c.fecha_vencimiento)}` : `Próx. servicio: ${fmtDate(c.fecha_proximo_servicio)}`}{c.documento_url && <span style={{ marginLeft: 8, color: "var(--blue)" }}></span>}</div>
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

//  PAGE ALERTAS 
function PageAlertas({ certs, subvencimientos, onSelect }) {
  const hoy = fechaHoy(); const def90 = fechaDefault90();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(def90);
  const [filtroBuque, setFiltroBuque] = useState("");

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
  const getAlertClass = f => { const d = diasHasta(f); if (d === null) return ""; if (d < 0) return "vencido"; if (d <= 60) return "critico"; return ""; };

  return (
    <div>
      <div className="stats">
        <div className="stat"><div className="stat-label">Total certificados</div><div className="stat-value" style={{ color: "var(--blue)" }}>{certs.length}</div></div>
        <div className="stat"><div className="stat-label">Vencidos</div><div className="stat-value" style={{ color: "var(--danger)" }}>{vencidos.length}</div></div>
        {/* [H07][DS-11.3] stat-value — sin inline fontSize, manejado por CSS */}
        <div className="stat"><div className="stat-label">Críticos ≤30d</div><div className="stat-value" style={{ color: "var(--orange)" }}>{criticos.length}</div></div>
        <div className="stat"><div className="stat-label">Próximos ≤90d</div><div className="stat-value" style={{ color: "var(--warn)" }}>{proximos.length}</div></div>
      </div>
      <div className="card mb12">
        <div className="card-title">Filtro por rango de vencimiento</div>
        {/* [H15][DS-11.6] clase form-grid-3 en lugar de gridTemplateColumns inline */}
        <div className="form-grid-3">
          <FG label="Barco"><select value={filtroBuque} onChange={e => setFiltroBuque(e.target.value)}><option value="">Todos</option>{BUQUES.map(b => <option key={b}>{b}</option>)}</select></FG>
          <FG label="Desde"><input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></FG>
          <FG label="Hasta"><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></FG>
        </div>
        <div className="flex-gap mt8">
          <div className="info-box accent" style={{ fontSize: 11, flex: 1 }}>
            <strong>{itemsEnRango.length}</strong> item{itemsEnRango.length !== 1 ? "s" : ""} vence{itemsEnRango.length !== 1 ? "n" : ""} entre {fmtDate(desde)} y {fmtDate(hasta)}
            {itemsEnRango.filter(i => diasHasta(i.fechaRef) < 0).length > 0 && <span style={{ color: "var(--danger)", marginLeft: 8 }}>· {itemsEnRango.filter(i => diasHasta(i.fechaRef) < 0).length} ya vencidos</span>}
            {itemsEnRango.some(i => i.tipo_item === "subvenc") && <span className="badge b-teal" style={{ marginLeft: 8 }}>{itemsEnRango.filter(i => i.tipo_item === "subvenc").length} verif. incluidas</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { setDesde(hoy); setHasta(def90); setFiltroBuque(""); }}>Restablecer</button>
        </div>
        <div className="info-box success mt8" style={{ fontSize: 10 }}>
          ℹ Incluye vencimientos de <strong>certificados principales</strong> y sus <strong>verificaciones periódicas / subvencimientos</strong>.
        </div>
      </div>

      {itemsEnRango.length === 0
        ? <div className="empty-state"><div style={{ fontSize: 32, marginBottom: 8 }}></div>Sin vencimientos en el período</div>
        : <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>{itemsEnRango.length} vencimientos en el período</div>
          {itemsEnRango.map((item, idx) => {
            const { tipo_item, fechaRef, cert: c, sv } = item;
            const alertCls = getAlertClass(fechaRef); const esSubvenc = tipo_item === "subvenc";
            return (
              <div key={`${esSubvenc ? "sv" : "c"}-${esSubvenc ? sv.id : c.id}-${idx}`} className={`alert-row ${alertCls}`} style={esSubvenc ? { marginLeft: 24, borderLeftStyle: "dashed" } : {}} onClick={() => onSelect(c)}>
                {/* [DS-10.2] Nivel 1: identificadores */}
                <div className="flex-gap mb8">
                  <span className="badge b-navy">{c.buque}</span>
                  <span className="badge b-gray">{SECCION_LABEL[c.seccion] || c.seccion}</span>
                  <span className="badge b-blue">{c.tipo === "estatutario" ? "Estat." : "Equipo"}</span>
                  {esSubvenc && <span className="badge b-teal">Verificación</span>}
                  <span style={{ marginLeft: "auto" }}><DiasChip fechaStr={fechaRef} /></span>
                </div>
                {/* [DS-10.2] Nivel 2: título */}
                {esSubvenc
                  ? <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}><span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>↳ {c.descripcion} · </span>{sv.descripcion}</div>
                  : <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>{c.descripcion}</div>
                }
                {/* [DS-10.2] Nivel 3: metadata */}
                {esSubvenc
                  ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>Ventana: {sv.fecha_desde ? fmtDate(sv.fecha_desde) : "—"} → {fmtDate(sv.fecha_hasta)}{sv.observaciones && <span style={{ marginLeft: 8 }}>· {sv.observaciones}</span>}</div>
                  : <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{c.tipo === "estatutario" ? `Vence: ${fmtDate(c.fecha_vencimiento)}${c.emitido_por ? ` · ${c.emitido_por}` : ""}` : `Próx. servicio: ${fmtDate(c.fecha_proximo_servicio)}${c.proveedor ? ` · ${c.proveedor}` : ""}`}</div>
                }
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}

//  ROOT APP 
export default function App() {
  const [session, setSession] = useState(null);
  const [navOpen, setNavOpen] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [page, setPage] = useState("alertas");
  const [certs, setCerts] = useState([]);
  const [subvencimientos, setSubvencimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editando, setEditando] = useState(null);
  const [creando, setCreando] = useState(null);

  const notify = useCallback((text, type = "info") => {
    setNotif({ text, type });
    setTimeout(() => setNotif(null), 4000);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setCheckingAuth(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  const loadCerts = useCallback(async () => {
    setLoading(true);
    try { const [c, sv] = await Promise.all([api.getCertificados(), api.getAllSubvencimientos()]); setCerts(c); setSubvencimientos(sv); }
    catch (e) { notify("Error: " + e.message, "error"); } finally { setLoading(false); }
  }, [notify]);

  const reloadSubvencimientos = useCallback(async () => {
    try { setSubvencimientos(await api.getAllSubvencimientos()); } catch (e) { notify("Error: " + e.message, "error"); }
  }, [notify]);

  useEffect(() => { if (session) loadCerts(); }, [session, loadCerts]);

  const getFechaRef = c => c.tipo === "estatutario" ? c.fecha_vencimiento : c.fecha_proximo_servicio;
  const countVencidos = certs.filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d < 0; }).length;
  const countCriticos = certs.filter(c => { const d = diasHasta(getFechaRef(c)); return d !== null && d >= 0 && d <= 30; }).length;
  const totalAlertas = countVencidos + countCriticos;

  // [H16][DS-8.4] loading inicial: var(--navy) + DM Mono 10px rgba(255,255,255,.3)
  if (checkingAuth) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--navy, #213363)" }}>
      <style>{CSS}</style>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 3, textTransform: "uppercase" }}>Cargando...</div>
    </div>
  );
  if (!session) return <LoginScreen onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setSession(session))} />;

  const Ico = ({ d, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );
  const ICONS = {
    bell:  <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
    file:  <><path d="M14 3H7a1.6 1.6 0 0 0-1.6 1.6v14.8A1.6 1.6 0 0 0 7 21h10a1.6 1.6 0 0 0 1.6-1.6V7.6z" /><path d="M14 3v4.6h4.6" /></>,
    gear:  <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" /></>,
    ship:  <><path d="M4 17l1.6-5.4h12.8L20 17a10 10 0 0 1-16 0z" /><path d="M12 11.6V5.5M8.5 5.5h7" /></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9.5 4v16" /></>,
    help:  <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.1 1-1.1 1.7v.3" /><path d="M12 17.5h.01" /></>,
    back:  <><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></>,
  };

  const SECCIONES = {
    alertas:      { titulo: "Alertas y vencimientos", sub: "Certificados vencidos o por vencer en los próximos 90 días, ordenados por criticidad." },
    "ad-estat":   { titulo: "Atlantic Dama · Estatutarios", sub: "Certificados estatutarios del buque, con su emisor y fecha de vencimiento." },
    "ad-equipo":  { titulo: "Atlantic Dama · Equipos",      sub: "Certificados de equipos y elementos de seguridad, con subvencimientos." },
    "gdm-estat":  { titulo: "Golondrina de Mar · Estatutarios", sub: "Certificados estatutarios del buque, con su emisor y fecha de vencimiento." },
    "gdm-equipo": { titulo: "Golondrina de Mar · Equipos",      sub: "Certificados de equipos y elementos de seguridad, con subvencimientos." },
  };
  const pageConfig = { "ad-estat": { buque: "Atlantic Dama", tipo: "estatutario" }, "ad-equipo": { buque: "Atlantic Dama", tipo: "no_estatutario" }, "gdm-estat": { buque: "Golondrina de Mar", tipo: "estatutario" }, "gdm-equipo": { buque: "Golondrina de Mar", tipo: "no_estatutario" } };

  const NAV = [
    { titulo: "General", items: [
      { id: "alertas", icon: "bell", label: "Alertas y vencimientos", count: totalAlertas },
    ]},
    { titulo: "Atlantic Dama", items: [
      { id: "ad-estat",  icon: "file", label: "Estatutarios", count: 0 },
      { id: "ad-equipo", icon: "gear", label: "Equipos",      count: 0 },
    ]},
    { titulo: "Golondrina de Mar", items: [
      { id: "gdm-estat",  icon: "file", label: "Estatutarios", count: 0 },
      { id: "gdm-equipo", icon: "gear", label: "Equipos",      count: 0 },
    ]},
  ];

  const seccion = SECCIONES[page] || { titulo: page, sub: "" };
  const inicial = (session.user.email || "C").replace(/@.*$/, "").slice(0, 2).toUpperCase();

  return (
    <>
      <style>{CSS}</style>

      <header className="appbar">
        <img src="/integra-isotipo-white.svg" alt="INTEGRA" className="appbar-iso" />
        <span className="appbar-div" />
        <span className="appbar-instance">PL Offshore</span>
        <input className="appbar-search" type="search" disabled placeholder="Buscar en todo INTEGRA" aria-label="Buscar" />
        <div className="appbar-tools">
          <span style={{ color: "rgba(255,255,255,.86)", display: "block" }}><Ico d={ICONS.bell} /></span>
          <span style={{ color: "rgba(255,255,255,.86)", display: "block" }}><Ico d={ICONS.help} /></span>
          <span className="appbar-div" />
          <span className="appbar-avatar">{inicial}</span>
          <span className="appbar-user">{session.user.email}</span>
          <button className="appbar-link" onClick={() => window.open(PORTAL_URL, "_self")}>Volver al portal</button>
        </div>
      </header>

      <div className={`shell ${navOpen ? "" : "is-collapsed"}`}>
        <nav className="sidebar">
          <div className="sidebar-header">
            <img src="/PL.png" alt="PL Offshore" className="sidebar-logo-img" />
            {navOpen && (
              <div>
                <div className="sidebar-logo-main">Certificados</div>
                <div className="sidebar-logo-sub">PL Offshore</div>
              </div>
            )}
          </div>

          <div className="sidebar-nav">
            {NAV.map(grupo => (
              <div key={grupo.titulo} style={{ marginBottom: 8 }}>
                {navOpen && <div className="nav-section">{grupo.titulo}</div>}
                {grupo.items.map(it => (
                  <button key={it.id} className={`ni ${page === it.id ? "active" : ""}`} onClick={() => setPage(it.id)} title={it.label}>
                    <span className="ni-ico"><Ico d={ICONS[it.icon]} /></span>
                    {navOpen && <span className="ni-label">{it.label}</span>}
                    {it.count > 0 && <span className="ni-badge">{it.count}</span>}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="sidebar-foot">
            <button className="sidebar-foot-btn" onClick={() => setNavOpen(v => !v)}>
              <span style={{ display: "block", color: "var(--muted2)" }}><Ico d={ICONS.panel} size={16} /></span>
              {navOpen && <span style={{ flex: 1, textAlign: "left" }}>Colapsar menú</span>}
            </button>
            {navOpen && (
              <div className="sidebar-foot-meta">
                <div>CERTIFICADOS v1.3</div>
                <div>POWERED BY INTEGRA</div>
              </div>
            )}
          </div>
        </nav>

        <div className="main">
          <div className="pagehead">
            <div className="crumb">
              <button onClick={() => window.open(PORTAL_URL, "_self")}>Portal</button>
              <span>/</span>
              <button onClick={() => setPage("alertas")}>Certificados</button>
              <span>/</span>
              <span className="crumb-current">{seccion.titulo}</span>
            </div>
            <div className="pagehead-row">
              <div>
                <h1>{seccion.titulo}</h1>
                {seccion.sub && <p>{seccion.sub}</p>}
              </div>
              <div className="pagehead-actions" style={{ alignItems: "center" }}>
                {countVencidos > 0 && <span className="badge b-red">{countVencidos} vencidos</span>}
                {countCriticos > 0 && <span className="badge b-amber">{countCriticos} críticos</span>}
              </div>
            </div>
          </div>

          <div className="content">
            {loading ? <div className="loading"><span className="spin">◌</span> Cargando…</div> : <>
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

      <nav className="mobile-nav">
        <div className={`mobile-nav-item ${page === "alertas" ? "active" : ""}`} onClick={() => setPage("alertas")}>
          <span className="mobile-nav-icon"><Ico d={ICONS.bell} size={18} /></span>
          <span className="mobile-nav-label">Alertas</span>
          {totalAlertas > 0 && <span className="mobile-nav-badge">{totalAlertas}</span>}
        </div>
        <div className={`mobile-nav-item ${["ad-estat","ad-equipo"].includes(page) ? "active" : ""}`} onClick={() => setPage("ad-estat")}>
          <span className="mobile-nav-icon"><Ico d={ICONS.ship} size={18} /></span>
          <span className="mobile-nav-label">Atl. Dama</span>
        </div>
        <div className={`mobile-nav-item ${["gdm-estat","gdm-equipo"].includes(page) ? "active" : ""}`} onClick={() => setPage("gdm-estat")}>
          <span className="mobile-nav-icon"><Ico d={ICONS.ship} size={18} /></span>
          <span className="mobile-nav-label">Golondrina</span>
        </div>
        <div className="mobile-nav-item" onClick={() => window.open(PORTAL_URL, "_self")}>
          <span className="mobile-nav-icon"><Ico d={ICONS.back} size={18} /></span>
          <span className="mobile-nav-label">Portal</span>
        </div>
      </nav>

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
