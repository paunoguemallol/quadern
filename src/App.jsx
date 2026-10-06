import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, Trash2, Pencil, Check, Clock, ChevronLeft, ChevronRight,
  Lock, X, CalendarDays, Rows3, Grid3x3, LayoutGrid, Repeat, LogOut, Circle, CheckCircle2,
  ShoppingCart, Sparkles, Wallet, ArrowUpCircle, ArrowDownCircle, ListChecks
} from "lucide-react";
import { registerUser, loginUser, getSessionUser, logoutUser } from "./services/authService";
import { getItem, setItem } from "./services/dataService";

/* ---------- design tokens ---------- */
const INK = "#17203A";
const FOG = "#EDEFF2";
const CARD = "#FFFFFF";
const LINE = "#D8DCE3";
const CLAY = "#C0674F";
const AMBER = "#D6A24B";
const MOSS = "#5B7553";
const SLATE = "#7C879A";
const OCEAN = "#4C6B8A";
const CLEAN_COLOR = "#3E8E8A";

function fmtTimeRange(time, duration) {
  if (!time) return "";
  if (!duration) return time;
  const [h, m] = time.split(":").map(Number);
  const endMins = h * 60 + m + Number(duration);
  const eh = Math.floor(endMins / 60) % 24, em = endMins % 60;
  return `${time}–${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

const CAT_PALETTE = ["#4C6B8A", "#5B7553", "#C0674F", "#D6A24B", "#7C5C8C", "#3E8E8A", "#A65D57", "#5C6B7C"];
const PRIORITIES = [
  { id: "low", label: "Baixa", color: MOSS },
  { id: "medium", label: "Mitjana", color: AMBER },
  { id: "high", label: "Alta", color: CLAY },
];
const STATUSES = [
  { id: "pending", label: "Pendent", color: SLATE },
  { id: "in_progress", label: "En curs", color: OCEAN },
  { id: "done", label: "Fet", color: MOSS },
];
const WEEKDAYS = ["Dl", "Dt", "Dc", "Dj", "Dv", "Ds", "Dg"];
const MONTHS = ["Gener","Febrer","Març","Abril","Maig","Juny","Juliol","Agost","Setembre","Octubre","Novembre","Desembre"];
const SECTIONS = [
  { id: "horaris", label: "Horaris", icon: CalendarDays },
  { id: "compres", label: "Compres", icon: ShoppingCart },
  { id: "neteja", label: "Neteja", icon: Sparkles },
  { id: "economia", label: "Economia", icon: Wallet },
  { id: "agenda", label: "Agenda", icon: ListChecks },
];
const fmtMoney = (n) => `${n.toFixed(2)} €`;

/* ---------- date helpers (local time, no UTC shift) ---------- */
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const addMonths = (d, n) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };
const startOfWeek = (d) => { const r = new Date(d); const dow = (r.getDay() + 6) % 7; return addDays(r, -dow); };
const sameDay = (a, b) => toKey(a) === toKey(b);
const fmtHuman = (d) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
function monthGridDates(year, month) {
  const start = startOfWeek(new Date(year, month, 1));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function getOccurrences(task, rangeStart, rangeEnd) {
  const base = fromKey(task.date);
  if (!task.recurring) {
    return base >= rangeStart && base <= rangeEnd ? [toKey(base)] : [];
  }
  const { value, unit, endDate } = task.recurring;
  const limit = endDate ? fromKey(endDate) : null;
  let cur = new Date(base);
  const stepDays = unit === "days" ? value : unit === "weeks" ? value * 7 : null;
  if (stepDays && cur < rangeStart) {
    const diff = Math.floor((rangeStart - cur) / 86400000 / stepDays);
    if (diff > 0) cur = addDays(cur, diff * stepDays);
  }
  const results = [];
  let guard = 0;
  while (cur <= rangeEnd && guard < 3000) {
    guard++;
    if (limit && cur > limit) break;
    if (cur >= rangeStart) results.push(toKey(cur));
    cur = unit === "days" ? addDays(cur, value) : unit === "weeks" ? addDays(cur, value * 7) : addMonths(cur, value);
  }
  return results;
}

function getInstances(tasks, overrides, rangeStart, rangeEnd) {
  const out = [];
  for (const task of tasks) {
    for (const dateKey of getOccurrences(task, rangeStart, rangeEnd)) {
      const key = `${task.id}__${dateKey}`;
      const ov = overrides[key];
      if (ov?.postponedTo) continue;
      out.push({ task, dateKey, key, done: !!ov?.done });
    }
  }
  const rsKey = toKey(rangeStart), reKey = toKey(rangeEnd);
  for (const [key, ov] of Object.entries(overrides)) {
    if (ov.postponedTo && ov.postponedTo >= rsKey && ov.postponedTo <= reKey) {
      const taskId = key.split("__")[0];
      const task = tasks.find((t) => t.id === taskId);
      if (task) out.push({ task, dateKey: ov.postponedTo, key, done: !!ov.done, postponed: true });
    }
  }
  return out;
}

function nextCleaningDue(item) {
  if (!item.lastDone) return null; // never done -> due now
  const base = fromKey(item.lastDone);
  return item.unit === "days" ? addDays(base, item.value)
    : item.unit === "weeks" ? addDays(base, item.value * 7)
    : addMonths(base, item.value);
}

function getCleaningInstances(items, rangeStart, rangeEnd) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  for (const item of items) {
    const due = nextCleaningDue(item);
    const displayDate = !due || due <= today ? today : due;
    if (displayDate >= rangeStart && displayDate <= rangeEnd) {
      out.push({ item, dateKey: toKey(displayDate) });
    }
  }
  return out;
}

/* ---------- storage helpers (Supabase) ---------- */
async function loadJSON(key, fallback) {
  try { return await getItem(key, fallback); } catch { return fallback; }
}
async function saveJSON(key, value) {
  try { await setItem(key, value); } catch {}
}

/* ---------- small UI atoms ---------- */
function Dot({ color, size = 8 }) {
  return <span style={{ width: size, height: size, borderRadius: 999, background: color, display: "inline-block" }} />;
}
function Badge({ color, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1"
      style={{ background: color + "22", color, border: `1px solid ${color}55`, cursor: onClick ? "pointer" : "default" }}
    >
      {children}
    </button>
  );
}
function IconBtn({ onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md hover:bg-black/5 transition-colors"
      style={{ color: SLATE }}
    >
      {children}
    </button>
  );
}

/* ---------- Auth gate (multi-user) ---------- */
function AuthGate({ onUnlock }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const existing = await getSessionUser();
        if (existing) { onUnlock(existing); return; }
      } catch {}
      setReady(true);
    })();
  }, []);

  const handleLogin = async () => {
    setError("");
    if (!name.trim() || !pass) return setError("Omple usuari i contrasenya.");
    setBusy(true);
    try {
      const uname = await loginUser(name, pass);
      onUnlock(uname);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const handleSignup = async () => {
    setError("");
    if (!name.trim() || !pass) return setError("Omple usuari i contrasenya.");
    if (pass !== pass2) return setError("Les contrasenyes no coincideixen.");
    setBusy(true);
    try {
      const uname = await registerUser(name, pass);
      onUnlock(uname);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") (mode === "signup" ? handleSignup : handleLogin)();
  };

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center" style={{ background: FOG, color: SLATE }}>Carregant…</div>;
  }

  const isSignup = mode === "signup";
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: FOG }}>
      <div className="w-full max-w-sm rounded-2xl p-8" style={{ background: CARD, border: `1px solid ${LINE}` }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: INK }}>
            <Lock size={16} color={FOG} />
          </div>
          <span className="font-serif text-xl" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>Quadern</span>
        </div>
        <p className="text-sm mb-6" style={{ color: SLATE }}>
          {isSignup ? "Crea el teu compte personal." : "Entra amb el teu usuari."}
        </p>
        <div className="space-y-3">
          <input
            value={name} onChange={(e) => setName(e.target.value)} onKeyDown={handleKeyDown} placeholder="Usuari"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: `1px solid ${LINE}`, background: FOG }}
          />
          <input
            type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={handleKeyDown} placeholder="Contrasenya"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: `1px solid ${LINE}`, background: FOG }}
          />
          {isSignup && (
            <input
              type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} onKeyDown={handleKeyDown} placeholder="Repeteix la contrasenya"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: `1px solid ${LINE}`, background: FOG }}
            />
          )}
          {error && <p className="text-xs" style={{ color: CLAY }}>{error}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={isSignup ? handleSignup : handleLogin}
            className="w-full py-2 rounded-lg text-sm font-medium mt-2"
            style={{ background: INK, color: FOG, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? "…" : isSignup ? "Crear compte" : "Entrar"}
          </button>
          <button
            type="button"
            onClick={() => { setMode(isSignup ? "login" : "signup"); setError(""); setPass(""); setPass2(""); }}
            className="w-full text-xs pt-1"
            style={{ color: SLATE }}
          >
            {isSignup ? "Ja tinc compte — vull entrar" : "Encara no tinc compte — vull crear-me'n un"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Task modal ---------- */
function TaskModal({ initial, categories, onSave, onClose, onDelete }) {
  const [f, setF] = useState(
    initial || {
      id: null, name: "", description: "", categoryId: categories[0]?.id || "",
      priority: "medium", status: "pending", date: toKey(new Date()), time: "", duration: 30,
      recurring: null,
    }
  );
  const [isRecurring, setIsRecurring] = useState(!!initial?.recurring);
  const [recVal, setRecVal] = useState(initial?.recurring?.value || 1);
  const [recUnit, setRecUnit] = useState(initial?.recurring?.unit || "days");
  const [recEnd, setRecEnd] = useState(initial?.recurring?.endDate || "");

  const submit = () => {
    if (!f.name.trim()) return;
    const task = {
      ...f,
      id: f.id || `t${Date.now()}${Math.floor(Math.random() * 1000)}`,
      recurring: isRecurring ? { value: Number(recVal) || 1, unit: recUnit, endDate: recEnd || null } : null,
    };
    onSave(task);
  };

  const inputCls = "w-full px-3 py-2 rounded-lg text-sm outline-none";
  const inputStyle = { border: `1px solid ${LINE}`, background: FOG };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-6 overflow-y-auto" style={{ background: CARD, maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>
            {f.id ? "Editar tasca" : "Nova tasca"}
          </h3>
          <IconBtn onClick={onClose}><X size={18} /></IconBtn>
        </div>
        <div className="space-y-3">
          <input className={inputCls} style={inputStyle} placeholder="Nom de la tasca"
            value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
          <textarea className={inputCls} style={{ ...inputStyle, minHeight: 60 }} placeholder="Descripció (opcional)"
            value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <input type="date" className={inputCls} style={inputStyle} value={f.date}
              onChange={(e) => setF({ ...f, date: e.target.value })} />
            <input type="time" className={inputCls} style={inputStyle} value={f.time}
              onChange={(e) => setF({ ...f, time: e.target.value })} />
            <input type="number" min={0} step={5} className={inputCls} style={inputStyle} placeholder="Durada (min)"
              value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} />
          </div>
          <select className={inputCls} style={inputStyle} value={f.categoryId}
            onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {categories.length === 0 && <option value="">Cap categoria creada</option>}
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select className={inputCls} style={inputStyle} value={f.priority}
              onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>Prioritat: {p.label}</option>)}
            </select>
            <select className={inputCls} style={inputStyle} value={f.status}
              onChange={(e) => setF({ ...f, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>Estat: {s.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: INK }}>
            <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
            <Repeat size={14} /> Tasca rutinària
          </label>
          {isRecurring && (
            <div className="rounded-lg p-3 space-y-2" style={{ background: FOG }}>
              <div className="flex items-center gap-2 text-sm">
                <span style={{ color: SLATE }}>Cada</span>
                <input type="number" min={1} value={recVal} onChange={(e) => setRecVal(e.target.value)}
                  className="w-16 px-2 py-1 rounded-md text-sm" style={{ border: `1px solid ${LINE}` }} />
                <select value={recUnit} onChange={(e) => setRecUnit(e.target.value)}
                  className="px-2 py-1 rounded-md text-sm" style={{ border: `1px solid ${LINE}` }}>
                  <option value="days">dies</option>
                  <option value="weeks">setmanes</option>
                  <option value="months">mesos</option>
                </select>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span style={{ color: SLATE }}>Límit (opcional)</span>
                <input type="date" value={recEnd} onChange={(e) => setRecEnd(e.target.value)}
                  className="px-2 py-1 rounded-md text-sm" style={{ border: `1px solid ${LINE}` }} />
                {recEnd && <button type="button" onClick={() => setRecEnd("")} className="text-xs underline" style={{ color: SLATE }}>treure</button>}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            {f.id ? (
              <button type="button" onClick={() => onDelete(f.id)}
                className="text-sm flex items-center gap-1" style={{ color: CLAY }}>
                <Trash2 size={14} /> Eliminar
              </button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: SLATE }}>Cancel·la</button>
              <button type="button" onClick={submit} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: INK, color: FOG }}>Desa</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Postpone popover ---------- */
function PostponeBox({ onConfirm, onClose, currentDate }) {
  const [d, setD] = useState(currentDate);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="rounded-xl p-4 w-full max-w-xs" style={{ background: CARD }} onClick={(e) => e.stopPropagation()}>
        <p className="text-sm mb-2" style={{ color: INK }}>Posposar a quin dia?</p>
        <input type="date" value={d} onChange={(e) => setD(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm mb-3" style={{ border: `1px solid ${LINE}` }} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm" style={{ color: SLATE }}>Cancel·la</button>
          <button onClick={() => onConfirm(d)} className="px-3 py-1.5 rounded-lg text-sm" style={{ background: INK, color: FOG }}>Confirma</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Shopping threshold alert ---------- */
function ShoppingAlertModal({ count, date, time, setDate, setTime, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: CARD }}>
        <div className="flex items-center gap-2 mb-2">
          <ShoppingCart size={18} color={CLAY} />
          <h3 className="text-lg" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>Toca anar a comprar</h3>
        </div>
        <p className="text-sm mb-4" style={{ color: SLATE }}>
          Tens {count} articles a la llista de la compra. Tria un dia i hora per anar-hi — s'afegirà com a esdeveniment "Compra" al calendari.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }} />
        </div>
        <button onClick={onConfirm} className="w-full py-2 rounded-lg text-sm font-medium" style={{ background: INK, color: FOG }}>
          Confirma i afegeix al calendari
        </button>
      </div>
    </div>
  );
}

/* ---------- Task row ---------- */
function TaskRow({ inst, category, onToggleDone, onEdit, onPostpone }) {
  const { task, done } = inst;
  const pr = PRIORITIES.find((p) => p.id === task.priority) || PRIORITIES[1];
  const st = STATUSES.find((s) => s.id === task.status) || STATUSES[0];
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: CARD, border: `1px solid ${LINE}` }}>
      <button onClick={() => onToggleDone(inst)}>
        {done ? <CheckCircle2 size={20} color={MOSS} /> : <Circle size={20} color={SLATE} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: INK, textDecoration: done ? "line-through" : "none" }}>{task.name}</span>
          {task.recurring && <Repeat size={12} color={SLATE} />}
          {category && <Badge color={category.color}><Dot color={category.color} />{category.name}</Badge>}
          <Badge color={pr.color}>{pr.label}</Badge>
          {!done && <Badge color={st.color}>{st.label}</Badge>}
        </div>
        {task.description && <p className="text-xs mt-0.5 truncate" style={{ color: SLATE }}>{task.description}</p>}
      </div>
      {task.time && <span className="text-xs font-mono shrink-0" style={{ color: SLATE }}>{fmtTimeRange(task.time, task.duration)}</span>}
      <IconBtn title="Posposar" onClick={() => onPostpone(inst)}><Clock size={15} /></IconBtn>
      <IconBtn title="Editar" onClick={() => onEdit(task)}><Pencil size={15} /></IconBtn>
    </div>
  );
}

function CleaningRow({ item, onDone, onGoToNeteja }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: CARD, border: `1px dashed ${CLEAN_COLOR}88` }}>
      <button onClick={() => onDone(item.id)}><Circle size={20} color={CLEAN_COLOR} /></button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium" style={{ color: INK }}>{item.name}</span>
          <Badge color={CLEAN_COLOR}><Sparkles size={11} /> Neteja</Badge>
        </div>
      </div>
      {item.time && <span className="text-xs font-mono shrink-0" style={{ color: SLATE }}>{fmtTimeRange(item.time, item.duration)}</span>}
      <IconBtn title="Anar a l'apartat de Neteja" onClick={onGoToNeteja}><Pencil size={15} /></IconBtn>
    </div>
  );
}

/* ---------- Compres ---------- */
function ShoppingSection({ items, autoItems, text, setText, onAdd, onToggle, onDelete, onClearBought, onRestock, onGoToProducts }) {
  const hasBought = items.some((i) => i.bought);
  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()}
          placeholder="Afegeix un article…" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: `1px solid ${LINE}`, background: CARD }} />
        <button onClick={onAdd} className="px-3 rounded-lg" style={{ background: INK, color: FOG }}><Plus size={16} /></button>
      </div>

      {autoItems.length > 0 && (
        <div className="mb-4">
          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: SLATE }}>Per stock baix</p>
          {autoItems.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: CARD, border: `1px dashed ${AMBER}` }}>
              <button onClick={() => onRestock(a.productId)}><Circle size={20} color={AMBER} /></button>
              <span className="flex-1 text-sm" style={{ color: INK }}>{a.name}</span>
              <Badge color={AMBER}>Stock: {a.stock}/{a.ss}</Badge>
            </div>
          ))}
          <button onClick={onGoToProducts} className="text-xs underline" style={{ color: SLATE }}>gestiona productes i estocs</button>
        </div>
      )}

      {items.length === 0 && autoItems.length === 0 && <p className="text-sm py-8 text-center" style={{ color: SLATE }}>La llista és buida.</p>}
      {items.map((i) => (
        <div key={i.id} className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: CARD, border: `1px solid ${LINE}` }}>
          <button onClick={() => onToggle(i.id)}>
            {i.bought ? <CheckCircle2 size={20} color={MOSS} /> : <Circle size={20} color={SLATE} />}
          </button>
          <span className="flex-1 text-sm" style={{ color: INK, textDecoration: i.bought ? "line-through" : "none" }}>{i.name}</span>
          <IconBtn onClick={() => onDelete(i.id)}><Trash2 size={15} /></IconBtn>
        </div>
      ))}
      {hasBought && (
        <button onClick={onClearBought} className="text-xs underline mt-1" style={{ color: SLATE }}>Buida els comprats</button>
      )}
    </div>
  );
}

function ProductsSection({ products, form, setForm, onAdd, onDelete, onStockDelta, onStockSet, onSSSet }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4 p-3 rounded-xl" style={{ background: CARD, border: `1px solid ${LINE}` }}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Producte" className="sm:col-span-2 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: `1px solid ${LINE}`, background: FOG }} />
        <input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })}
          placeholder="Stock actual" className="px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: `1px solid ${LINE}`, background: FOG }} />
        <div className="flex gap-1">
          <input type="number" min={0} value={form.ss} onChange={(e) => setForm({ ...form, ss: e.target.value })}
            placeholder="SS (opcional)" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: `1px solid ${LINE}`, background: FOG }} />
          <button onClick={onAdd} className="px-3 rounded-lg" style={{ background: INK, color: FOG }}><Plus size={16} /></button>
        </div>
      </div>
      {products.length === 0 && <p className="text-sm py-8 text-center" style={{ color: SLATE }}>Encara no hi ha cap producte.</p>}
      {products.map((p) => {
        const low = p.ss != null && p.stock < p.ss;
        return (
          <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl mb-2 flex-wrap" style={{ background: CARD, border: `1px solid ${low ? AMBER : LINE}` }}>
            <span className="text-sm font-medium flex-1" style={{ color: INK, minWidth: 100 }}>{p.name}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => onStockDelta(p.id, -1)} className="w-6 h-6 rounded-md text-sm" style={{ border: `1px solid ${LINE}` }}>−</button>
              <input type="number" value={p.stock} onChange={(e) => onStockSet(p.id, e.target.value)}
                className="w-14 text-center px-1 py-1 rounded-md text-sm" style={{ border: `1px solid ${LINE}` }} />
              <button onClick={() => onStockDelta(p.id, 1)} className="w-6 h-6 rounded-md text-sm" style={{ border: `1px solid ${LINE}` }}>+</button>
            </div>
            <div className="flex items-center gap-1 text-xs" style={{ color: SLATE }}>
              SS:
              <input type="number" value={p.ss ?? ""} onChange={(e) => onSSSet(p.id, e.target.value)} placeholder="—"
                className="w-14 text-center px-1 py-1 rounded-md text-sm" style={{ border: `1px solid ${LINE}` }} />
            </div>
            {low && <Badge color={AMBER}>Stock baix</Badge>}
            <IconBtn onClick={() => onDelete(p.id)}><Trash2 size={15} /></IconBtn>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Neteja ---------- */
function CleaningSection({ items, form, setForm, onAdd, onDone, onDelete }) {
  const today = new Date();
  const sorted = [...items].sort((a, b) => {
    const da = nextCleaningDue(a), db = nextCleaningDue(b);
    if (!da && !db) return 0;
    if (!da) return -1;
    if (!db) return 1;
    return da - db;
  });
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-2 mb-4 p-3 rounded-xl" style={{ background: CARD, border: `1px solid ${LINE}` }}>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Lloc (ex: bany)" className="sm:col-span-2 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: `1px solid ${LINE}`, background: FOG }} />
        <div className="flex gap-1">
          <span className="text-sm self-center" style={{ color: SLATE }}>cada</span>
          <input type="number" min={1} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}
            className="w-14 px-2 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }} />
        </div>
        <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}
          className="px-2 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }}>
          <option value="days">dies</option>
          <option value="weeks">setmanes</option>
          <option value="months">mesos</option>
        </select>
        <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })}
          className="px-2 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }} />
        <div className="flex gap-1">
          <input type="number" min={0} step={5} value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}
            placeholder="min" className="w-16 px-2 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }} />
          <button onClick={onAdd} className="px-3 rounded-lg" style={{ background: INK, color: FOG }}><Plus size={16} /></button>
        </div>
      </div>
      {sorted.length === 0 && <p className="text-sm py-8 text-center" style={{ color: SLATE }}>Encara no hi ha cap tasca de neteja.</p>}
      {sorted.map((i) => {
        const due = nextCleaningDue(i);
        const overdue = !due || due <= today;
        const unitLabel = i.unit === "days" ? "dies" : i.unit === "weeks" ? "setmanes" : "mesos";
        return (
          <div key={i.id} className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: CARD, border: `1px solid ${LINE}` }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium" style={{ color: INK }}>{i.name}</p>
              <p className="text-xs" style={{ color: overdue ? CLAY : SLATE }}>
                Cada {i.value} {unitLabel} · {due ? (overdue ? "Toca ara" : `Propera: ${fmtHuman(due)}`) : "Mai feta — toca ara"}
                {i.time && ` · ${fmtTimeRange(i.time, i.duration)}`}
              </p>
            </div>
            <IconBtn title="Marca com a feta avui" onClick={() => onDone(i.id)}><Check size={16} color={MOSS} /></IconBtn>
            <IconBtn onClick={() => onDelete(i.id)}><Trash2 size={15} /></IconBtn>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Economia ---------- */
function FinanceSection({ entries, form, setForm, onAdd, onDelete }) {
  const income = entries.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
  const expense = entries.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
  const balance = income - expense;
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${LINE}` }}>
          <p className="text-xs" style={{ color: SLATE }}>Ingressos</p>
          <p className="text-sm font-medium" style={{ color: MOSS }}>{fmtMoney(income)}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${LINE}` }}>
          <p className="text-xs" style={{ color: SLATE }}>Despeses</p>
          <p className="text-sm font-medium" style={{ color: CLAY }}>{fmtMoney(expense)}</p>
        </div>
        <div className="rounded-xl p-3" style={{ background: INK }}>
          <p className="text-xs" style={{ color: "#9AA5B8" }}>Balanç</p>
          <p className="text-sm font-medium" style={{ color: balance >= 0 ? "#8FCB9B" : "#E2988A" }}>{fmtMoney(balance)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4 p-3 rounded-xl" style={{ background: CARD, border: `1px solid ${LINE}` }}>
        <input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })}
          placeholder="Concepte" className="sm:col-span-2 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ border: `1px solid ${LINE}`, background: FOG }} />
        <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
          placeholder="Import" className="px-3 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }} />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="px-2 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }}>
          <option value="income">Ingrés</option>
          <option value="expense">Despesa</option>
        </select>
        <div className="flex gap-1">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="flex-1 px-2 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }} />
          <button onClick={onAdd} className="px-3 rounded-lg" style={{ background: INK, color: FOG }}><Plus size={16} /></button>
        </div>
      </div>
      {sorted.length === 0 && <p className="text-sm py-8 text-center" style={{ color: SLATE }}>Encara no hi ha cap moviment.</p>}
      {sorted.map((e) => (
        <div key={e.id} className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: CARD, border: `1px solid ${LINE}` }}>
          {e.type === "income" ? <ArrowUpCircle size={18} color={MOSS} /> : <ArrowDownCircle size={18} color={CLAY} />}
          <div className="flex-1 min-w-0">
            <p className="text-sm" style={{ color: INK }}>{e.concept}</p>
            <p className="text-xs font-mono" style={{ color: SLATE }}>{e.date}</p>
          </div>
          <span className="text-sm font-medium" style={{ color: e.type === "income" ? MOSS : CLAY }}>
            {e.type === "income" ? "+" : "−"}{fmtMoney(e.amount)}
          </span>
          <IconBtn onClick={() => onDelete(e.id)}><Trash2 size={15} /></IconBtn>
        </div>
      ))}
    </div>
  );
}

function AgendaSection({ items, onAdd, onDone }) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const submit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), due: due || null });
    setTitle(""); setDue(""); setShowForm(false);
  };

  const today = toKey(new Date());
  const sorted = [...items].sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));

  return (
    <div>
      {!showForm ? (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium mb-4"
          style={{ background: INK, color: FOG }}>
          <Plus size={15} /> Nova tasca
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 p-3 rounded-xl" style={{ background: CARD, border: `1px solid ${LINE}` }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Títol" autoFocus className="sm:col-span-2 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: `1px solid ${LINE}`, background: FOG }} />
          <div className="flex gap-1">
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)}
              className="flex-1 px-2 py-2 rounded-lg text-sm outline-none" style={{ border: `1px solid ${LINE}`, background: FOG }} />
            <button onClick={submit} className="px-3 rounded-lg" style={{ background: INK, color: FOG }}><Plus size={16} /></button>
            <button onClick={() => setShowForm(false)} className="px-2 rounded-lg" style={{ border: `1px solid ${LINE}` }}><X size={16} /></button>
          </div>
        </div>
      )}

      {sorted.length === 0 && <p className="text-sm py-8 text-center" style={{ color: SLATE }}>Cap tasca pendent a l'agenda.</p>}
      {sorted.map((i) => {
        const overdue = i.due && i.due < today;
        return (
          <div key={i.id} className="flex items-center gap-3 p-3 rounded-xl mb-2" style={{ background: CARD, border: `1px solid ${LINE}` }}>
            <button onClick={() => onDone(i.id)}><Circle size={20} color={SLATE} /></button>
            <span className="flex-1 text-sm" style={{ color: INK }}>{i.title}</span>
            {i.due && <span className="text-xs font-mono" style={{ color: overdue ? CLAY : SLATE }}>{i.due}</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Main App ---------- */
export default function App() {
  const [unlocked, setUnlocked] = useState(null);
  const [section, setSection] = useState("horaris");
  const [categories, setCategories] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [view, setView] = useState("day");
  const [cursor, setCursor] = useState(new Date());
  const [activeCats, setActiveCats] = useState(null); // null = all
  const [modalTask, setModalTask] = useState(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [postponeInst, setPostponeInst] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState(CAT_PALETTE[0]);
  const [loaded, setLoaded] = useState(false);

  const [shopping, setShopping] = useState([]);
  const [shopText, setShopText] = useState("");
  const [products, setProducts] = useState([]);
  const [prodForm, setProdForm] = useState({ name: "", stock: 0, ss: "" });
  const [compresTab, setCompresTab] = useState("llista");
  const [showShoppingAlert, setShowShoppingAlert] = useState(false);
  const [shopAlertDate, setShopAlertDate] = useState(toKey(addDays(new Date(), 1)));
  const [shopAlertTime, setShopAlertTime] = useState("18:00");
  const [cleaning, setCleaning] = useState([]);
  const [cleanForm, setCleanForm] = useState({ name: "", value: 1, unit: "weeks", time: "", duration: 20 });
  const [finance, setFinance] = useState([]);
  const [finForm, setFinForm] = useState({ concept: "", amount: "", type: "expense", date: toKey(new Date()) });
  const [agenda, setAgenda] = useState([]);

  useEffect(() => {
    if (!unlocked) { setLoaded(false); return; }
    setLoaded(false);
    const k = (name) => `${name}:${unlocked}`;
    (async () => {
      const [c, t, o, sh, cl, fi, pr, ag] = await Promise.all([
        loadJSON(k("categories"), [
          { id: "c1", name: "Feina", color: CAT_PALETTE[0] },
          { id: "c2", name: "Personal", color: CAT_PALETTE[1] },
        ]),
        loadJSON(k("tasks"), []),
        loadJSON(k("overrides"), {}),
        loadJSON(k("shopping"), []),
        loadJSON(k("cleaning"), []),
        loadJSON(k("finance"), []),
        loadJSON(k("products"), []),
        loadJSON(k("agenda"), []),
      ]);
      setCategories(c); setTasks(t); setOverrides(o);
      setShopping(sh); setCleaning(cl); setFinance(fi); setProducts(pr); setAgenda(ag);
      setLoaded(true);
    })();
  }, [unlocked]);

  useEffect(() => { if (loaded) saveJSON(`categories:${unlocked}`, categories); }, [categories, loaded, unlocked]);
  useEffect(() => { if (loaded) saveJSON(`tasks:${unlocked}`, tasks); }, [tasks, loaded, unlocked]);
  useEffect(() => { if (loaded) saveJSON(`overrides:${unlocked}`, overrides); }, [overrides, loaded, unlocked]);
  useEffect(() => { if (loaded) saveJSON(`shopping:${unlocked}`, shopping); }, [shopping, loaded, unlocked]);
  useEffect(() => { if (loaded) saveJSON(`cleaning:${unlocked}`, cleaning); }, [cleaning, loaded, unlocked]);
  useEffect(() => { if (loaded) saveJSON(`finance:${unlocked}`, finance); }, [finance, loaded, unlocked]);
  useEffect(() => { if (loaded) saveJSON(`products:${unlocked}`, products); }, [products, loaded, unlocked]);
  useEffect(() => { if (loaded) saveJSON(`agenda:${unlocked}`, agenda); }, [agenda, loaded, unlocked]);

  const range = useMemo(() => {
    if (view === "day") return { start: new Date(cursor.setHours(0,0,0,0)), end: new Date(new Date(cursor).setHours(23,59,59,999)) };
    if (view === "week") { const s = startOfWeek(cursor); return { start: s, end: addDays(s, 6) }; }
    if (view === "year") return { start: new Date(cursor.getFullYear(), 0, 1), end: new Date(cursor.getFullYear(), 11, 31, 23, 59, 59, 999) };
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    const end = addDays(start, 41);
    return { start, end };
  }, [view, cursor]);

  const instances = useMemo(() => getInstances(tasks, overrides, range.start, range.end), [tasks, overrides, range]);
  const visibleInstances = useMemo(
    () => instances.filter((i) => !activeCats || activeCats.has(i.task.categoryId)),
    [instances, activeCats]
  );

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const cleaningInstances = useMemo(() => getCleaningInstances(cleaning, range.start, range.end), [cleaning, range]);
  const autoShoppingItems = useMemo(
    () => products.filter((p) => p.ss != null && p.stock < p.ss)
      .map((p) => ({ id: `auto_${p.id}`, productId: p.id, name: p.name, stock: p.stock, ss: p.ss })),
    [products]
  );
  const unboughtShoppingCount = useMemo(
    () => shopping.filter((i) => !i.bought).length + autoShoppingItems.length,
    [shopping, autoShoppingItems]
  );
  const [shoppingAlertArmed, setShoppingAlertArmed] = useState(true);

  useEffect(() => {
    if (!loaded) return;
    if (unboughtShoppingCount >= 5 && shoppingAlertArmed) {
      setShowShoppingAlert(true);
      setShoppingAlertArmed(false);
    } else if (unboughtShoppingCount < 5 && !shoppingAlertArmed) {
      setShoppingAlertArmed(true);
    }
  }, [loaded, unboughtShoppingCount, shoppingAlertArmed]);

  const confirmShoppingEvent = () => {
    setTasks((prev) => [...prev, {
      id: `shop${Date.now()}`, name: "Compra",
      description: `Llista de la compra: ${unboughtShoppingCount} articles`,
      categoryId: "", priority: "medium", status: "pending",
      date: shopAlertDate, time: shopAlertTime, duration: 45,
      recurring: null, isShoppingEvent: true,
    }]);
    setShowShoppingAlert(false);
  };

  const toggleDone = useCallback((inst) => {
    const key = inst.key;
    setOverrides((prev) => {
      const cur = prev[key] || {};
      return { ...prev, [key]: { ...cur, done: !cur.done } };
    });
  }, []);

  const confirmPostpone = (newDate) => {
    const inst = postponeInst;
    if (!inst) return;
    if (inst.task.recurring) {
      setOverrides((prev) => ({ ...prev, [inst.key]: { ...(prev[inst.key] || {}), postponedTo: newDate } }));
    } else {
      setTasks((prev) => prev.map((t) => (t.id === inst.task.id ? { ...t, date: newDate } : t)));
    }
    setPostponeInst(null);
  };

  const saveTask = (task) => {
    setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev.map((t) => (t.id === task.id ? task : t)) : [...prev, task]));
    setModalTask(null); setShowNewTask(false);
  };
  const deleteTask = (id) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setOverrides((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(id + "__"))));
    setModalTask(null);
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    setCategories((p) => [...p, { id: `cat${Date.now()}`, name: newCatName.trim(), color: newCatColor }]);
    setNewCatName("");
  };
  const removeCategory = (id) => setCategories((p) => p.filter((c) => c.id !== id));

  const addShoppingItem = () => {
    if (!shopText.trim()) return;
    setShopping((p) => [...p, { id: `s${Date.now()}`, name: shopText.trim(), bought: false }]);
    setShopText("");
  };
  const toggleShoppingBought = (id) => setShopping((p) => p.map((i) => (i.id === id ? { ...i, bought: !i.bought } : i)));
  const deleteShoppingItem = (id) => setShopping((p) => p.filter((i) => i.id !== id));
  const clearBoughtShopping = () => setShopping((p) => p.filter((i) => !i.bought));

  const addProduct = () => {
    if (!prodForm.name.trim()) return;
    setProducts((p) => [...p, {
      id: `p${Date.now()}`, name: prodForm.name.trim(),
      stock: Number(prodForm.stock) || 0, ss: prodForm.ss === "" ? null : Math.max(0, Number(prodForm.ss) || 0),
    }]);
    setProdForm({ name: "", stock: 0, ss: "" });
  };
  const deleteProduct = (id) => setProducts((p) => p.filter((x) => x.id !== id));
  const stockDelta = (id, d) => setProducts((p) => p.map((x) => (x.id === id ? { ...x, stock: Math.max(0, x.stock + d) } : x)));
  const stockSet = (id, v) => setProducts((p) => p.map((x) => (x.id === id ? { ...x, stock: Math.max(0, Number(v) || 0) } : x)));
  const ssSet = (id, v) => setProducts((p) => p.map((x) => (x.id === id ? { ...x, ss: v === "" ? null : Math.max(0, Number(v) || 0) } : x)));
  const restockToSS = (productId) => setProducts((p) => p.map((x) => (x.id === productId && x.ss != null ? { ...x, stock: x.ss } : x)));

  const addCleaningItem = () => {
    if (!cleanForm.name.trim()) return;
    setCleaning((p) => [...p, {
      id: `cl${Date.now()}`, name: cleanForm.name.trim(), value: Number(cleanForm.value) || 1,
      unit: cleanForm.unit, lastDone: null, time: cleanForm.time, duration: cleanForm.duration,
    }]);
    setCleanForm({ name: "", value: 1, unit: "weeks", time: "", duration: 20 });
  };
  const markCleaningDone = (id) => setCleaning((p) => p.map((i) => (i.id === id ? { ...i, lastDone: toKey(new Date()) } : i)));
  const deleteCleaningItem = (id) => setCleaning((p) => p.filter((i) => i.id !== id));

  const addFinanceEntry = () => {
    const amount = parseFloat(finForm.amount);
    if (!finForm.concept.trim() || !amount || amount <= 0) return;
    setFinance((p) => [...p, { id: `f${Date.now()}`, concept: finForm.concept.trim(), amount, type: finForm.type, date: finForm.date }]);
    setFinForm({ concept: "", amount: "", type: "expense", date: toKey(new Date()) });
  };
  const deleteFinanceEntry = (id) => setFinance((p) => p.filter((e) => e.id !== id));

  const addAgendaItem = ({ title, due }) => setAgenda((p) => [...p, { id: `ag${Date.now()}`, title, due }]);
  const doneAgendaItem = (id) => setAgenda((p) => p.filter((i) => i.id !== id));

  const step = (dir) => {
    if (view === "day") setCursor(addDays(cursor, dir));
    else if (view === "week") setCursor(addDays(cursor, dir * 7));
    else if (view === "year") setCursor(addMonths(cursor, dir * 12));
    else setCursor(addMonths(cursor, dir));
  };

  const toggleCat = (id) => {
    setActiveCats((prev) => {
      const set = new Set(prev || categories.map((c) => c.id));
      if (set.has(id)) set.delete(id); else set.add(id);
      return set;
    });
  };

  if (!unlocked) return <AuthGate onUnlock={setUnlocked} />;
  if (!loaded) return <div className="min-h-screen flex items-center justify-center" style={{ background: FOG, color: SLATE }}>Carregant…</div>;

  const dayLabel = view === "day" ? `${fmtHuman(cursor)} ${cursor.getFullYear()}`
    : view === "week" ? `${fmtHuman(range.start)} – ${fmtHuman(range.end)}`
    : view === "year" ? `${cursor.getFullYear()}`
    : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  return (
    <div className="min-h-screen flex" style={{ background: FOG, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');`}</style>

      {/* Sidebar */}
      <aside className="w-64 shrink-0 p-5 hidden md:flex md:flex-col" style={{ background: INK }}>
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: FOG }}>
            <CalendarDays size={15} color={INK} />
          </div>
          <span className="text-lg" style={{ color: FOG, fontFamily: "'Fraunces', serif" }}>Quadern</span>
        </div>

        <nav className="space-y-1 mb-6">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSection(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: section === s.id ? "rgba(255,255,255,0.12)" : "transparent", color: section === s.id ? FOG : "#9AA5B8" }}>
              <s.icon size={15} /> {s.label}
            </button>
          ))}
        </nav>

        {section === "horaris" && (
          <>
            <div className="h-px mb-4" style={{ background: "rgba(255,255,255,0.1)" }} />
            <nav className="space-y-1 mb-8">
              {[["day", "Avui", CalendarDays], ["week", "Setmana", Rows3], ["month", "Mes", Grid3x3], ["year", "Any", LayoutGrid]].map(([id, label, Icon]) => (
                <button key={id} onClick={() => setView(id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{ background: view === id ? "rgba(255,255,255,0.1)" : "transparent", color: view === id ? FOG : "#9AA5B8" }}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </nav>

            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide" style={{ color: "#7E8AA0" }}>Categories</span>
            </div>
            <div className="space-y-1 mb-3 overflow-y-auto" style={{ maxHeight: 180 }}>
              {categories.map((c) => {
                const active = !activeCats || activeCats.has(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg group" style={{ opacity: active ? 1 : 0.4 }}>
                    <button onClick={() => toggleCat(c.id)} className="flex items-center gap-2 flex-1 text-left">
                      <Dot color={c.color} />
                      <span className="text-sm" style={{ color: "#E4E8EF" }}>{c.name}</span>
                    </button>
                    <button onClick={() => removeCategory(c.id)} className="opacity-0 group-hover:opacity-100">
                      <Trash2 size={12} color="#9AA5B8" />
                    </button>
                  </div>
                );
              })}
              {activeCats && (
                <button onClick={() => setActiveCats(null)} className="text-xs underline px-2" style={{ color: "#9AA5B8" }}>
                  mostra totes
                </button>
              )}
            </div>
            <div className="flex gap-1 mb-2">
              {CAT_PALETTE.map((col) => (
                <button key={col} onClick={() => setNewCatColor(col)}
                  className="w-4 h-4 rounded-full"
                  style={{ background: col, outline: newCatColor === col ? `2px solid ${FOG}` : "none", outlineOffset: 1 }} />
              ))}
            </div>
            <div className="flex gap-1">
              <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                placeholder="Nova categoria" className="flex-1 px-2 py-1.5 rounded-md text-xs outline-none"
                style={{ background: "rgba(255,255,255,0.08)", color: FOG }} />
              <button onClick={addCategory} className="px-2 rounded-md" style={{ background: "rgba(255,255,255,0.15)" }}>
                <Plus size={13} color={FOG} />
              </button>
            </div>
          </>
        )}

        <div className="mt-auto pt-4">
          <button onClick={async () => { await logoutUser(); setUnlocked(null); }} className="flex items-center gap-2 text-xs" style={{ color: "#9AA5B8" }}>
            <LogOut size={13} /> Tanca sessió
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-5 md:p-8 max-w-3xl pb-24 md:pb-8">
        {section === "horaris" && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <IconBtn onClick={() => step(-1)}><ChevronLeft size={18} /></IconBtn>
                <h1 className="text-xl md:text-2xl" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>{dayLabel}</h1>
                <IconBtn onClick={() => step(1)}><ChevronRight size={18} /></IconBtn>
              </div>
              <button onClick={() => setShowNewTask(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
                style={{ background: INK, color: FOG }}>
                <Plus size={15} /> Tasca
              </button>
            </div>

            {view === "year" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {MONTHS.map((mName, m) => {
                  const cells = monthGridDates(cursor.getFullYear(), m);
                  return (
                    <div key={mName} className="rounded-xl p-2" style={{ background: CARD, border: `1px solid ${LINE}` }}>
                      <button onClick={() => { setCursor(new Date(cursor.getFullYear(), m, 1)); setView("month"); }}
                        className="text-xs font-medium mb-1.5 block" style={{ color: INK }}>
                        {mName}
                      </button>
                      <div className="grid grid-cols-7 gap-0.5">
                        {Array.from({ length: 7 }, (_, i) => (
                          <span key={i} className="text-center" style={{ color: SLATE, fontSize: 9 }}>{WEEKDAYS[i][0]}</span>
                        ))}
                        {cells.map((d) => {
                          const inMonth = d.getMonth() === m;
                          const dayInsts = visibleInstances.filter((i) => i.dateKey === toKey(d));
                          const dayClean = cleaningInstances.filter((c) => c.dateKey === toKey(d));
                          return (
                            <button key={toKey(d)} onClick={() => { setCursor(d); setView("day"); }}
                              className="rounded flex flex-col items-center py-0.5"
                              style={{
                                fontSize: 9,
                                color: inMonth ? (sameDay(d, new Date()) ? CLAY : INK) : LINE,
                                background: sameDay(d, new Date()) ? CLAY + "18" : "transparent",
                              }}>
                              {d.getDate()}
                              <span className="flex gap-0.5">
                                <span style={{ width: 3, height: 3, borderRadius: 999, background: dayInsts.length ? OCEAN : "transparent" }} />
                                <span style={{ width: 3, height: 3, borderRadius: 999, background: dayClean.length ? CLEAN_COLOR : "transparent" }} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : view !== "month" ? (
              <div>
                {visibleInstances.length === 0 && cleaningInstances.filter((c) => c.dateKey === toKey(cursor)).length === 0 && (
                  <p className="text-sm py-8 text-center" style={{ color: SLATE }}>Res per aquí. Bon senyal, o toca planificar.</p>
                )}
                {view === "day" && (
                  <>
                    {cleaningInstances
                      .filter((c) => c.dateKey === toKey(cursor))
                      .map((c) => (
                        <CleaningRow key={c.item.id} item={c.item} onDone={markCleaningDone} onGoToNeteja={() => setSection("neteja")} />
                      ))}
                    {visibleInstances
                      .sort((a, b) => (a.task.time || "99:99").localeCompare(b.task.time || "99:99"))
                      .map((inst) => (
                        <TaskRow key={inst.key} inst={inst} category={catById[inst.task.categoryId]}
                          onToggleDone={toggleDone} onEdit={setModalTask} onPostpone={setPostponeInst} />
                      ))}
                  </>
                )}
                {view === "week" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Array.from({ length: 7 }, (_, i) => addDays(range.start, i)).map((d) => {
                      const dayInsts = visibleInstances.filter((i) => i.dateKey === toKey(d));
                      const dayClean = cleaningInstances.filter((c) => c.dateKey === toKey(d));
                      return (
                        <div key={toKey(d)} className="rounded-xl p-3" style={{ background: CARD, border: `1px solid ${LINE}` }}>
                          <p className="text-xs font-medium mb-2" style={{ color: sameDay(d, new Date()) ? CLAY : SLATE }}>
                            {WEEKDAYS[(d.getDay() + 6) % 7]} · {fmtHuman(d)}
                          </p>
                          {dayInsts.length === 0 && dayClean.length === 0 && <p className="text-xs" style={{ color: LINE }}>—</p>}
                          {dayClean.map((c) => (
                            <CleaningRow key={c.item.id} item={c.item} onDone={markCleaningDone} onGoToNeteja={() => setSection("neteja")} />
                          ))}
                          {dayInsts.map((inst) => (
                            <TaskRow key={inst.key} inst={inst} category={catById[inst.task.categoryId]}
                              onToggleDone={toggleDone} onEdit={setModalTask} onPostpone={setPostponeInst} />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((w) => <div key={w} className="text-xs text-center font-medium py-1" style={{ color: SLATE }}>{w}</div>)}
                {Array.from({ length: 42 }, (_, i) => addDays(range.start, i)).map((d) => {
                  const dayInsts = visibleInstances.filter((i) => i.dateKey === toKey(d));
                  const dayClean = cleaningInstances.filter((c) => c.dateKey === toKey(d));
                  const inMonth = d.getMonth() === cursor.getMonth();
                  return (
                    <button key={toKey(d)} onClick={() => { setCursor(d); setView("day"); }}
                      className="rounded-lg p-1.5 text-left align-top"
                      style={{
                        background: CARD, border: `1px solid ${sameDay(d, new Date()) ? CLAY : LINE}`,
                        opacity: inMonth ? 1 : 0.4, minHeight: 64,
                      }}>
                      <span className="text-xs font-mono" style={{ color: INK }}>{d.getDate()}</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {dayInsts.slice(0, 4).map((inst) => (
                          <Dot key={inst.key} color={catById[inst.task.categoryId]?.color || SLATE} />
                        ))}
                        {dayClean.map((c) => <Dot key={c.item.id} color={CLEAN_COLOR} />)}
                        {dayInsts.length > 4 && <span style={{ color: SLATE, fontSize: 10 }}>+{dayInsts.length - 4}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {section === "compres" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl md:text-2xl" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>Compres</h1>
              <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
                {[["llista", "Llista de la compra"], ["productes", "Productes i estocs"]].map(([id, label]) => (
                  <button key={id} onClick={() => setCompresTab(id)}
                    className="px-3 py-1.5 text-xs font-medium"
                    style={{ background: compresTab === id ? INK : CARD, color: compresTab === id ? FOG : SLATE }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {compresTab === "llista" ? (
              <ShoppingSection items={shopping} autoItems={autoShoppingItems} text={shopText} setText={setShopText}
                onAdd={addShoppingItem} onToggle={toggleShoppingBought} onDelete={deleteShoppingItem}
                onClearBought={clearBoughtShopping} onRestock={restockToSS} onGoToProducts={() => setCompresTab("productes")} />
            ) : (
              <ProductsSection products={products} form={prodForm} setForm={setProdForm}
                onAdd={addProduct} onDelete={deleteProduct} onStockDelta={stockDelta} onStockSet={stockSet} onSSSet={ssSet} />
            )}
          </>
        )}

        {section === "neteja" && (
          <>
            <h1 className="text-xl md:text-2xl mb-6" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>Neteja</h1>
            <CleaningSection items={cleaning} form={cleanForm} setForm={setCleanForm}
              onAdd={addCleaningItem} onDone={markCleaningDone} onDelete={deleteCleaningItem} />
          </>
        )}

        {section === "economia" && (
          <>
            <h1 className="text-xl md:text-2xl mb-6" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>Economia</h1>
            <FinanceSection entries={finance} form={finForm} setForm={setFinForm}
              onAdd={addFinanceEntry} onDelete={deleteFinanceEntry} />
          </>
        )}

        {section === "agenda" && (
          <>
            <h1 className="text-xl md:text-2xl mb-6" style={{ color: INK, fontFamily: "'Fraunces', serif" }}>Agenda</h1>
            <AgendaSection items={agenda} onAdd={addAgendaItem} onDone={doneAgendaItem} />
          </>
        )}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around py-2 z-40"
        style={{ background: INK, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setSection(s.id)}
            className="flex flex-col items-center gap-0.5 px-3 py-1"
            style={{ color: section === s.id ? FOG : "#9AA5B8" }}>
            <s.icon size={18} />
            <span style={{ fontSize: 10 }}>{s.label}</span>
          </button>
        ))}
      </nav>

      {(showNewTask || modalTask) && (
        <TaskModal
          initial={modalTask}
          categories={categories}
          onSave={saveTask}
          onClose={() => { setModalTask(null); setShowNewTask(false); }}
          onDelete={deleteTask}
        />
      )}
      {postponeInst && (
        <PostponeBox currentDate={postponeInst.dateKey} onClose={() => setPostponeInst(null)} onConfirm={confirmPostpone} />
      )}
      {showShoppingAlert && (
        <ShoppingAlertModal count={unboughtShoppingCount} date={shopAlertDate} time={shopAlertTime}
          setDate={setShopAlertDate} setTime={setShopAlertTime} onConfirm={confirmShoppingEvent} />
      )}
    </div>
  );
}
