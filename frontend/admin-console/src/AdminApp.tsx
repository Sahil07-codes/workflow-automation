import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, BadgeDollarSign,
  Bell, ChevronDown, CircleHelp, CreditCard, FileClock, Gift, LayoutDashboard, Menu,
  RefreshCw, Search, Settings2, Shield, ShieldCheck, Users,
} from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";

const baseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "");

type RecordValue = Record<string, unknown>;
type FetchState = { loading: boolean; data: unknown; error: string; reload: () => void };

async function adminFetch(path: string, options: RequestInit = {}) {
  if (!baseUrl) throw new Error("Set VITE_API_BASE_URL to connect the admin service.");
  const requestOptions: RequestInit = {
    ...options,
    credentials: "include",
    headers: { Accept: "application/json", ...options.headers },
  };
  let response = await fetch(`${baseUrl}${path}`, requestOptions);
  if (response.status === 401 && path !== "/auth/refresh") {
    const refresh = await fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    });
    if (refresh.ok) response = await fetch(`${baseUrl}${path}`, requestOptions);
  }
  return response;
}

const navGroups = [
  { label: "Overview", links: [{ title: "Dashboard", to: "/admin", icon: LayoutDashboard }] },
  { label: "Manage", links: [
    { title: "Users", to: "/admin/users", icon: Users },
    { title: "Applications", to: "/admin/applications", icon: Activity },
    { title: "Subscriptions", to: "/admin/subscriptions", icon: CreditCard },
    { title: "Referrals", to: "/admin/referrals", icon: Gift },
  ] },
  { label: "Operations", links: [
    { title: "Adapters", to: "/admin/adapters", icon: Settings2 },
    { title: "Feature flags", to: "/admin/flags", icon: Shield },
    { title: "Audit log", to: "/admin/audit-log", icon: FileClock },
  ] },
];

const pageInfo: Record<string, { title: string; description: string; resource: string }> = {
  "/admin/users": { title: "Users", description: "Review user accounts with personal information masked by default.", resource: "/admin/users" },
  "/admin/applications": { title: "Applications", description: "Monitor application processing, queue states, and reported failures.", resource: "/admin/applications" },
  "/admin/subscriptions": { title: "Subscriptions", description: "Review billing status and plan entitlements reported by the service.", resource: "/admin/subscriptions" },
  "/admin/referrals": { title: "Referrals", description: "Review referral attribution, qualification, and rewards recorded by the service.", resource: "/admin/referrals" },
  "/admin/adapters": { title: "Adapters", description: "Inspect source adapter status and health data reported by operations.", resource: "/admin/adapters" },
  "/admin/flags": { title: "Feature flags", description: "Review service-managed feature configuration and rollout status.", resource: "/admin/flags" },
  "/admin/audit-log": { title: "Application event log", description: "Review application lifecycle events. Administrative write actions are not exposed.", resource: "/admin/audit-log" },
};

export default function AdminApp() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const title = location.pathname === "/admin" ? "Dashboard" : pageInfo[location.pathname]?.title ?? "Admin";
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}>
        <Link to="/admin" className="admin-brand"><span className="admin-brand-mark"><ShieldCheck size={19} /></span><span><strong>AutoApply</strong><small>ADMIN CONSOLE</small></span></Link>
        <div className="admin-workspace"><span className="admin-workspace-mark">A</span><span><strong>Operations</strong><small>Restricted workspace</small></span><ChevronDown size={16} /></div>
        {navGroups.map((group) => <nav className="admin-nav-group" aria-label={group.label} key={group.label}><span className="admin-nav-label">{group.label}</span>{group.links.map(({ title: label, to, icon: Icon }) => <NavLink end={to === "/admin"} className={({ isActive }) => `admin-nav-link ${isActive ? "active" : ""}`} to={to} key={to}><Icon size={17} /><span>{label}</span></NavLink>)}</nav>)}
        <div className="admin-sidebar-bottom"><span><CircleHelp size={17} /> Help & support</span><small>Access is enforced by your server session.</small></div>
      </aside>
      {menuOpen && <button className="admin-mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="admin-main">
        <header className="admin-topbar"><button className="admin-menu-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button><div className="admin-crumb"><span>Admin</span><span>/</span><strong>{title}</strong></div><div className="admin-top-actions"><span className="admin-secure-label"><Shield size={15} /> Secure session</span><button aria-label="Notifications"><Bell size={18} /></button><span className="admin-avatar">A</span></div></header>
        <main className="admin-content"><Routes>
          <Route path="/admin" element={<DashboardPage />} />
          {Object.entries(pageInfo).map(([path, info]) => <Route key={path} path={path} element={<ResourcePage info={info} />} />)}
          <Route path="*" element={<NavigateHome />} />
        </Routes></main>
      </div>
    </div>
  );
}

function NavigateHome() { return <div className="admin-page"><h1>Page not found</h1><Link to="/admin" className="admin-text-link">Return to dashboard</Link></div>; }

function DashboardPage() {
  const query = useResource("/admin/overview");
  const data = isRecord(query.data) ? query.data : null;
  const metrics = data && isRecord(data.metrics) ? data.metrics : data;
  const cards = [
    ["Total users", ["total_users", "users_total", "users"], Users],
    ["Active subscriptions", ["active_subscriptions", "subscriptions_active"], CreditCard],
    ["Monthly recurring revenue", ["monthly_recurring_revenue", "mrr"], BadgeDollarSign],
    ["Applications", ["total_applications", "applications_total"], Activity],
    ["Qualified referrals", ["qualified_referrals", "referrals_qualified"], Gift],
    ["OTP delivery rate", ["otp_delivery_rate", "otp_success_rate"], ShieldCheck],
  ] as const;
  return <div className="admin-page">
    <PageHeading title="Operational overview" description="Analytics, service health, and activity returned by your admin service." reload={query.reload} />
    <QueryState query={query} />
    {data && <>
      <section className="metric-grid">{cards.map(([label, keys, Icon]) => <article className="metric-card" key={label}><span className="metric-icon"><Icon size={18} /></span><small>{label}</small><strong>{formatMetric(findValue(metrics, [...keys]))}</strong></article>)}</section>
      <section className="dashboard-grid">
        <DataPanel title="Application funnel" icon={<Activity size={17} />}><RecordList data={data.application_funnel ?? data.funnel} labelKeys={["label", "stage", "name"]} valueKeys={["count", "value", "total"]} /></DataPanel>
        <DataPanel title="System health" icon={<ShieldCheck size={17} />}><HealthList data={data.system_health ?? data.health ?? data.services} /></DataPanel>
      </section>
      <DataPanel title="Operational alerts" icon={<AlertTriangle size={17} />}><Alerts data={data.alerts} /></DataPanel>
    </>}
    <p className="admin-notice"><ShieldCheck size={15} /> Values reflect the last response from the service. Authorization and action audit are enforced by the backend.</p>
  </div>;
}

function ResourcePage({ info }: { info: { title: string; description: string; resource: string } }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const params = new URLSearchParams();
  if (search.trim()) params.set("q", search.trim());
  if (status) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  const url = `${info.resource}${params.size ? `?${params}` : ""}`;
  const query = useResource(url, refreshKey);
  const records = getRecords(query.data);
  const pagination = getPagination(query.data);
  const columns = useMemo(() => records?.length ? Object.keys(records[0]).filter((key) => !/payload|password|token|session|cookie|embedding|secret|credential|raw/i.test(key)).slice(0, 7) : [], [records]);
  return <div className="admin-page">
    <PageHeading title={info.title} description={info.description} reload={() => setRefreshKey((n) => n + 1)} />
    <div className="list-controls"><label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setCursor(""); }} placeholder={`Search ${info.title.toLowerCase()}…`} aria-label={`Search ${info.title}`} /></label><label className="admin-status-filter"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setCursor(""); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="FAILED">Failed</option><option value="SUSPENDED">Suspended</option></select></label></div>
    <QueryState query={query} />
    {records && records.length > 0 && <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column}>{humanize(column)}</th>)}</tr></thead><tbody>{records.map((record, index) => <tr key={String(record.id ?? record.application_id ?? record.user_id ?? index)}>{columns.map((column) => <td key={column}>{renderCell(record, column)}</td>)}</tr>)}</tbody></table></div>}
    {query.data !== null && records?.length === 0 && <div className="admin-empty">No records were returned for this view.</div>}
    {pagination && <div className="admin-pagination"><button className="admin-button secondary" disabled={!pagination.previous} onClick={() => setCursor(pagination.previous ?? "")}><ArrowLeft size={15} /> Previous</button><span>Pagination is provided by the service.</span><button className="admin-button secondary" disabled={!pagination.next} onClick={() => setCursor(pagination.next ?? "")}>Next <ArrowRight size={15} /></button></div>}
    {query.data !== null && query.data !== undefined && <ServiceActions data={query.data} onComplete={() => setRefreshKey((n) => n + 1)} />}
  </div>;
}

function PageHeading({ title, description, reload }: { title: string; description: string; reload: () => void }) {
  return <div className="admin-page-heading"><div><span className="admin-eyebrow">OWNER CONSOLE</span><h1>{title}</h1><p>{description}</p></div><button className="admin-button secondary" onClick={reload}><RefreshCw size={15} /> Refresh</button></div>;
}

function QueryState({ query }: { query: FetchState }) {
  if (query.loading) return <div className="admin-inline-state"><span className="admin-spinner" /> Loading service data…</div>;
  if (query.error) return <div className="admin-query-error" role="alert"><AlertTriangle size={18} /><span>{query.error}</span><button className="admin-button secondary" onClick={query.reload}>Try again</button></div>;
  return null;
}

function useResource(path: string, refreshKey = 0): FetchState {
  const [state, setState] = useState<{ loading: boolean; data: unknown; error: string }>({ loading: Boolean(baseUrl), data: null, error: "" });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    let active = true;
    if (!baseUrl) { setState({ loading: false, data: null, error: "Set VITE_API_BASE_URL in the admin-console environment to connect the admin service." }); return () => { active = false; }; }
    setState((current) => ({ ...current, loading: true, error: "" }));
    adminFetch(path)
      .then(async (response) => {
        const body: unknown = response.status === 204 ? null : await response.json();
          if (response.status === 401) {
            throw new Error("You are not signed in. Sign in through the customer app at http://localhost:5173, then reload this console using localhost (not 127.0.0.1).");
          }
          if (response.status === 403) {
            throw new Error("This signed-in account does not have ADMIN or SUPERADMIN access. Regular signup accounts cannot access administrative data.");
          }
          if (!response.ok) throw new Error(isRecord(body) && typeof body.message === "string" ? body.message : `Admin service returned ${response.status}.`);
        return body;
      })
      .then((data) => { if (active) setState({ loading: false, data, error: "" }); })
      .catch((reason: unknown) => { if (active) setState({ loading: false, data: null, error: reason instanceof Error ? reason.message : "Could not reach the admin service." }); });
    return () => { active = false; };
  }, [path, refreshKey, reloadKey]);
  return { ...state, reload: () => setReloadKey((n) => n + 1) };
}

function DataPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="data-panel"><header>{icon}<h2>{title}</h2></header>{children}</section>;
}

function RecordList({ data, labelKeys, valueKeys }: { data: unknown; labelKeys: string[]; valueKeys: string[] }) {
  if (!Array.isArray(data) || data.length === 0) return <p className="panel-empty">No data returned.</p>;
  return <div className="simple-list">{data.filter(isRecord).map((row, index) => <div key={String(row.id ?? index)}><span>{formatMetric(findValue(row, labelKeys))}</span><strong>{formatMetric(findValue(row, valueKeys))}</strong></div>)}</div>;
}

function HealthList({ data }: { data: unknown }) {
  if (!isRecord(data) || Object.keys(data).length === 0) return <p className="panel-empty">No service health data returned.</p>;
  return <div className="simple-list">{Object.entries(data).filter(([key]) => !/token|secret|payload|credential|cookie|session/i.test(key)).map(([key, value]) => {
    const status = isRecord(value) ? value.status ?? value.state ?? value.health : value;
    return <div key={key}><span>{humanize(key)}</span><strong><StatusPill value={status} /></strong></div>;
  })}</div>;
}

function Alerts({ data }: { data: unknown }) {
  if (!Array.isArray(data) || data.length === 0) return <p className="panel-empty">No operational alerts returned.</p>;
  return <div className="alert-list">{data.filter(isRecord).map((alert, index) => <article key={String(alert.id ?? index)}><span className="alert-marker"><AlertTriangle size={15} /></span><div><strong>{formatMetric(alert.title ?? alert.name ?? "Operational alert")}</strong><p>{formatMetric(alert.message ?? alert.description ?? alert.detail)}</p></div><StatusPill value={alert.severity ?? alert.level ?? "Alert"} /></article>)}</div>;
}

function ServiceActions({ data, onComplete }: { data: unknown; onComplete: () => void }) {
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const actions = isRecord(data) && Array.isArray(data.actions) ? data.actions.filter((item): item is RecordValue => isRecord(item) && typeof item.name === "string" && typeof item.label === "string") : [];
  if (!actions.length) return null;
  async function run(action: RecordValue) {
    const endpoint = typeof action.endpoint === "string" ? action.endpoint : "";
    const method = action.method;
    if (!endpoint.startsWith("/admin/") || !["POST", "PATCH", "DELETE"].includes(String(method).toUpperCase())) {
      setError("The service action is missing a valid admin endpoint or method.");
      return;
    }
    if (action.confirmation_required === true && !window.confirm(`Continue with “${String(action.label)}”? The server validates and audits this action.`)) return;
    let reason = "";
    if (action.reason_required === true) {
      const input = window.prompt(`Reason for “${String(action.label)}”`);
      if (!input?.trim()) return;
      reason = input.trim();
    }
    setBusy(String(action.name)); setMessage(""); setError("");
    try {
      const response = await adminFetch(endpoint, { method: String(method).toUpperCase(), headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(isRecord(action.payload) ? action.payload : {}), ...(reason ? { reason } : {}) }) });
      const result: unknown = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(isRecord(result) && typeof result.message === "string" ? result.message : `Admin service returned ${response.status}.`);
      setMessage("Action accepted by the service; refreshing authoritative data.");
      onComplete();
    } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Action failed."); }
    finally { setBusy(""); }
  }
  return <DataPanel title="Service-authorized actions" icon={<ShieldCheck size={17} />}>
    {actions.map((action) => <div className="action-row" key={String(action.name)}><span><strong>{String(action.label)}</strong>{typeof action.description === "string" && <small>{action.description}</small>}</span><button className="admin-button secondary" disabled={action.enabled !== true || typeof action.endpoint !== "string" || !["POST", "PATCH", "DELETE"].includes(String(action.method).toUpperCase()) || Boolean(busy)} onClick={() => void run(action)}>{busy === action.name ? "Working…" : String(action.label)}</button></div>)}
    {message && <p className="action-message" role="status">{message}</p>}{error && <p className="action-error" role="alert">{error}</p>}
  </DataPanel>;
}

function getRecords(data: unknown): RecordValue[] | null {
  if (Array.isArray(data)) return data.filter(isRecord);
  if (!isRecord(data)) return null;
  const list = [data.items, data.results, data.records, data.users, data.applications, data.subscriptions, data.referrals, data.adapters, data.flags, data.events].find(Array.isArray);
  return Array.isArray(list) ? list.filter(isRecord) : null;
}

function getPagination(data: unknown) {
  if (!isRecord(data)) return null;
  const pagination = isRecord(data.pagination) ? data.pagination : data;
  const next = typeof pagination.next_cursor === "string" ? pagination.next_cursor : "";
  const previous = typeof pagination.previous_cursor === "string" ? pagination.previous_cursor : "";
  return next || previous ? { next, previous } : null;
}

function renderCell(row: RecordValue, key: string) {
  const value = row[key];
  if (/email|phone|mobile|contact|name/i.test(key) && typeof value === "string") return maskValue(key, value);
  if (/status|state|health|severity/i.test(key)) return <StatusPill value={value} />;
  if (value === null || value === undefined || typeof value === "object") return "—";
  return String(value);
}

function maskValue(key: string, value: string) {
  if (value.includes("@")) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 1)}•••@${domain}`;
  }
  if (/name/i.test(key)) return `${value.trim().slice(0, 1)}. •••`;
  return value.replace(/\d(?=(?:\D*\d){2})/g, "•");
}

function StatusPill({ value }: { value: unknown }) {
  const text = formatMetric(value);
  const normalized = text.toLowerCase();
  const tone = /active|success|healthy|qualified|enabled|paid/.test(normalized) ? "good" : /failed|error|suspended|disabled|past_due/.test(normalized) ? "bad" : "pending";
  return <span className={`status-pill ${tone}`}>{text}</span>;
}

function findValue(source: unknown, keys: string[]) {
  if (!isRecord(source)) return undefined;
  for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
  return undefined;
}

function formatMetric(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value.replace(/[_-]+/g, " ");
  if (isRecord(value)) {
    if (typeof value.display === "string") return value.display;
    if (typeof value.formatted === "string") return value.formatted;
    if (value.value !== undefined) return formatMetric(value.value);
  }
  return "—";
}

function humanize(value: string) { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
