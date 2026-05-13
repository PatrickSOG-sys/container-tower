import { useState, useEffect, useCallback } from "react";

const STATUSES = [
  "Not Yet Tracked","On Water","Arriving Within 7 Days","Arrived at Port",
  "Customs Pending","Customs Cleared","Gated","Pickup Scheduled",
  "Picked Up","Delivered","Closed","Issue / Hold"
];

const STATUS_COLORS = {
  "Not Yet Tracked": "#888780",
  "On Water": "#378ADD",
  "Arriving Within 7 Days": "#EF9F27",
  "Arrived at Port": "#9FE1CB",
  "Customs Pending": "#FAC775",
  "Customs Cleared": "#C0DD97",
  "Gated": "#AFA9EC",
  "Pickup Scheduled": "#5DCAA5",
  "Picked Up": "#1D9E75",
  "Delivered": "#639922",
  "Closed": "#B4B2A9",
  "Issue / Hold": "#E24B4A"
};

const STATUS_TEXT = {
  "Not Yet Tracked": "#444441",
  "On Water": "#042C53",
  "Arriving Within 7 Days": "#412402",
  "Arrived at Port": "#04342C",
  "Customs Pending": "#412402",
  "Customs Cleared": "#173404",
  "Gated": "#26215C",
  "Pickup Scheduled": "#04342C",
  "Picked Up": "#04342C",
  "Delivered": "#173404",
  "Closed": "#2C2C2A",
  "Issue / Hold": "#501313"
};

const EMPTY_CONTAINER = {
  containerNumber: "",
  carrier: "",
  eta: "",
  port: "",
  destination: "",
  distributor: "",
  truckerWarehouse: "",
  truckerDistributor: "",
  customsStatus: "Pending",
  requiredDocs: "",
  docStatus: "Incomplete",
  pickupStatus: "Not Scheduled",
  deliveryStatus: "Pending",
  status: "Not Yet Tracked",
  notes: "",
  account: "",
  alertSent: false,
  createdAt: "",
  updatedAt: ""
};

const STORAGE_KEY = "container_tower_v1";
const SETTINGS_KEY = "container_tower_settings_v1";

function getReminderDate(eta) {
  if (!eta) return null;
  const d = new Date(eta);
  d.setDate(d.getDate() - 7);
  return d;
}

function isWithin7Days(eta) {
  if (!eta) return false;
  const today = new Date();
  const etaDate = new Date(eta);
  const diff = (etaDate - today) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
}

function isOverdue(eta) {
  if (!eta) return false;
  return new Date(eta) < new Date();
}

function getMissingFields(c) {
  const missing = [];
  if (!c.carrier) missing.push("Carrier");
  if (!c.eta) missing.push("ETA");
  if (!c.port) missing.push("Port");
  if (!c.destination) missing.push("Final Destination");
  if (!c.truckerWarehouse && !c.truckerDistributor) missing.push("Trucker");
  if (!c.requiredDocs) missing.push("Required Documents");
  return missing;
}

function getRisks(c) {
  const risks = [];
  if (isWithin7Days(c.eta) && c.customsStatus === "Pending") risks.push("Customs not cleared — demurrage risk");
  if (isWithin7Days(c.eta) && !c.truckerWarehouse && !c.truckerDistributor) risks.push("No trucker assigned — missed pickup risk");
  if (isWithin7Days(c.eta) && c.pickupStatus === "Not Scheduled") risks.push("Pickup not scheduled");
  if (isOverdue(c.eta) && c.status !== "Delivered" && c.status !== "Closed") risks.push("ETA passed — container may be at port");
  if (c.docStatus === "Incomplete" && isWithin7Days(c.eta)) risks.push("Documents incomplete");
  return risks;
}

function Badge({ label }) {
  const bg = STATUS_COLORS[label] || "#B4B2A9";
  const color = STATUS_TEXT[label] || "#2C2C2A";
  return (
    <span style={{
      background: bg, color, fontSize: 11, fontWeight: 500,
      padding: "2px 8px", borderRadius: 6, whiteSpace: "nowrap"
    }}>{label}</span>
  );
}

function RiskBadge({ text }) {
  return (
    <span style={{
      background: "#FCEBEB", color: "#A32D2D", fontSize: 11,
      padding: "2px 8px", borderRadius: 6, display: "inline-block", marginBottom: 2
    }}>⚠ {text}</span>
  );
}

function MissingBadge({ text }) {
  return (
    <span style={{
      background: "#FAEEDA", color: "#633806", fontSize: 11,
      padding: "2px 8px", borderRadius: 6, display: "inline-block", marginBottom: 2
    }}>✗ {text}</span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: "var(--color-background-primary)", borderRadius: 12,
        border: "0.5px solid var(--color-border-tertiary)",
        padding: "1.5rem", width: "min(92vw, 720px)",
        maxHeight: "90vh", overflowY: "auto"
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--color-text-secondary)" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "6px 10px",
  border: "0.5px solid var(--color-border-secondary)", borderRadius: 6,
  background: "var(--color-background-primary)", color: "var(--color-text-primary)",
  fontSize: 13
};

const selectStyle = { ...inputStyle };

function ContainerForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ ...EMPTY_CONTAINER, ...initial });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.containerNumber.trim()) return alert("Container number is required.");
    const now = new Date().toISOString();
    onSave({
      ...form,
      containerNumber: form.containerNumber.trim().toUpperCase(),
      updatedAt: now,
      createdAt: form.createdAt || now
    });
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <Field label="Container Number *">
          <input style={inputStyle} value={form.containerNumber} onChange={e => set("containerNumber", e.target.value.toUpperCase())} placeholder="e.g. TCNU8484777" />
        </Field>
        <Field label="Account / Client">
          <input style={inputStyle} value={form.account} onChange={e => set("account", e.target.value)} placeholder="e.g. CAVA, TFK" />
        </Field>
        <Field label="Shipping Line / Carrier">
          <input style={inputStyle} value={form.carrier} onChange={e => set("carrier", e.target.value)} placeholder="e.g. Maersk, MSC" />
        </Field>
        <Field label="ETA to Port">
          <input type="date" style={inputStyle} value={form.eta} onChange={e => set("eta", e.target.value)} />
        </Field>
        <Field label="Port of Arrival">
          <input style={inputStyle} value={form.port} onChange={e => set("port", e.target.value)} placeholder="e.g. Long Beach, Charleston" />
        </Field>
        <Field label="Final Destination">
          <input style={inputStyle} value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Warehouse or distributor address" />
        </Field>
        <Field label="Distributor (if applicable)">
          <input style={inputStyle} value={form.distributor} onChange={e => set("distributor", e.target.value)} />
        </Field>
        <Field label="Status">
          <select style={selectStyle} value={form.status} onChange={e => set("status", e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Trucker — Port to Warehouse">
          <input style={inputStyle} value={form.truckerWarehouse} onChange={e => set("truckerWarehouse", e.target.value)} />
        </Field>
        <Field label="Trucker — Port to Distributor">
          <input style={inputStyle} value={form.truckerDistributor} onChange={e => set("truckerDistributor", e.target.value)} />
        </Field>
        <Field label="Customs Status">
          <select style={selectStyle} value={form.customsStatus} onChange={e => set("customsStatus", e.target.value)}>
            {["Pending","In Progress","Cleared","Hold"].map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Document Status">
          <select style={selectStyle} value={form.docStatus} onChange={e => set("docStatus", e.target.value)}>
            {["Incomplete","In Progress","Complete"].map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Pickup Status">
          <select style={selectStyle} value={form.pickupStatus} onChange={e => set("pickupStatus", e.target.value)}>
            {["Not Scheduled","Scheduled","Completed"].map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Delivery Status">
          <select style={selectStyle} value={form.deliveryStatus} onChange={e => set("deliveryStatus", e.target.value)}>
            {["Pending","In Transit","Delivered"].map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Required Documents">
        <input style={inputStyle} value={form.requiredDocs} onChange={e => set("requiredDocs", e.target.value)} placeholder="e.g. BL, Commercial Invoice, Packing List" />
      </Field>
      <Field label="Notes / Risks / Next Actions">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.notes} onChange={e => set("notes", e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose} style={{ padding: "7px 18px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "none", cursor: "pointer", color: "var(--color-text-primary)" }}>Cancel</button>
        <button onClick={handleSave} style={{ padding: "7px 18px", borderRadius: 6, border: "none", background: "#1D9E75", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Save Container</button>
      </div>
    </div>
  );
}

function EmailPreview({ container, recipientEmail, onClose, onSend, sending }) {
  const missing = getMissingFields(container);
  const risks = getRisks(container);
  const subject = `[Action Required] Container ${container.containerNumber} — Arriving ${container.eta || "TBD"}`;
  const body = `Hi Team,

Container ${container.containerNumber} is arriving${container.eta ? ` on ${container.eta}` : " soon"} at ${container.port || "[Port TBD]"}.

Please confirm the following:

1. Assigned Trucker: ${container.truckerWarehouse || container.truckerDistributor || "⚠ NOT ASSIGNED"}
2. Final Destination: ${container.destination || "⚠ NOT CONFIRMED"}
3. Moving to: ${container.distributor ? `Distributor — ${container.distributor}` : "Warehouse"}
4. Customs Status: ${container.customsStatus}
5. Document Status: ${container.docStatus}${container.requiredDocs ? ` (${container.requiredDocs})` : ""}
6. Pickup Scheduled: ${container.pickupStatus}

${missing.length > 0 ? `Missing Information:\n${missing.map(m => `  • ${m}`).join("\n")}\n` : ""}${risks.length > 0 ? `\nRisks Identified:\n${risks.map(r => `  ⚠ ${r}`).join("\n")}\n` : ""}
Please confirm or update the above by end of day.

— Container Control Tower`;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>To</label>
        <div style={{ fontSize: 13, padding: "6px 0", color: "var(--color-text-primary)" }}>{recipientEmail}</div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Subject</label>
        <div style={{ fontSize: 13, fontWeight: 500, padding: "6px 0" }}>{subject}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Body</label>
        <pre style={{
          fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap",
          background: "var(--color-background-secondary)", padding: 12,
          borderRadius: 6, border: "0.5px solid var(--color-border-tertiary)",
          fontFamily: "var(--font-mono)", color: "var(--color-text-primary)",
          marginTop: 6, maxHeight: 320, overflowY: "auto"
        }}>{body}</pre>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "7px 18px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "none", cursor: "pointer", color: "var(--color-text-primary)" }}>Cancel</button>
        <button onClick={() => onSend(subject, body)} disabled={sending} style={{ padding: "7px 18px", borderRadius: 6, border: "none", background: "#378ADD", color: "#fff", fontWeight: 500, cursor: sending ? "not-allowed" : "pointer", opacity: sending ? 0.7 : 1 }}>
          {sending ? "Sending…" : "Send via Gmail"}
        </button>
      </div>
    </div>
  );
}

function SettingsModal({ settings, onSave, onClose }) {
  const [form, setForm] = useState({ ...settings });
  return (
    <div>
      <Field label="Alert Recipient Email(s) — comma separated">
        <input style={inputStyle} value={form.alertEmail} onChange={e => setForm(f => ({ ...f, alertEmail: e.target.value }))} placeholder="ops@company.com, manager@company.com" />
      </Field>
      <Field label="Company / Team Name">
        <input style={inputStyle} value={form.teamName} onChange={e => setForm(f => ({ ...f, teamName: e.target.value }))} placeholder="Source One Global Logistics" />
      </Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={onClose} style={{ padding: "7px 18px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "none", cursor: "pointer", color: "var(--color-text-primary)" }}>Cancel</button>
        <button onClick={() => onSave(form)} style={{ padding: "7px 18px", borderRadius: 6, border: "none", background: "#1D9E75", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Save Settings</button>
      </div>
    </div>
  );
}

function ImportModal({ onImport, onClose }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  const handleImport = () => {
    try {
      const rows = text.trim().split("\n").filter(Boolean);
      const containers = rows.map((row, i) => {
        const parts = row.split(",").map(s => s.trim());
        if (!parts[0]) throw new Error(`Row ${i + 1}: missing container number`);
        const now = new Date().toISOString();
        return {
          ...EMPTY_CONTAINER,
          containerNumber: parts[0].toUpperCase(),
          carrier: parts[1] || "",
          eta: parts[2] || "",
          port: parts[3] || "",
          destination: parts[4] || "",
          account: parts[5] || "",
          status: "On Water",
          createdAt: now,
          updatedAt: now
        };
      });
      onImport(containers);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 0 }}>
        Paste CSV rows — one container per line:<br />
        <code style={{ fontSize: 12 }}>ContainerNo, Carrier, ETA (YYYY-MM-DD), Port, Destination, Account</code>
      </p>
      <textarea
        style={{ ...inputStyle, minHeight: 160, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12 }}
        value={text} onChange={e => { setText(e.target.value); setError(""); }}
        placeholder={"TCNU8484777, Maersk, 2025-06-15, Long Beach, LA Warehouse, CAVA\nMSCU1234567, MSC, 2025-06-20, Charleston, NYC Distributor, TFK"}
      />
      {error && <p style={{ color: "#A32D2D", fontSize: 12, marginTop: 6 }}>⚠ {error}</p>}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
        <button onClick={onClose} style={{ padding: "7px 18px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "none", cursor: "pointer", color: "var(--color-text-primary)" }}>Cancel</button>
        <button onClick={handleImport} style={{ padding: "7px 18px", borderRadius: 6, border: "none", background: "#378ADD", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Import</button>
      </div>
    </div>
  );
}

export default function App() {
  const [containers, setContainers] = useState([]);
  const [settings, setSettings] = useState({ alertEmail: "", teamName: "Container Control Tower" });
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterAccount, setFilterAccount] = useState("All");
  const [sortKey, setSortKey] = useState("eta");
  const [sortDir, setSortDir] = useState("asc");
  const [editContainer, setEditContainer] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [emailTarget, setEmailTarget] = useState(null);
  const [emailSending, setEmailSending] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setContainers(JSON.parse(raw));
      const rawS = localStorage.getItem(SETTINGS_KEY);
      if (rawS) setSettings(JSON.parse(rawS));
    } catch {}
  }, []);

  const persist = useCallback((data) => {
    setContainers(data);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }, []);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const saveContainer = (c) => {
    const idx = containers.findIndex(x => x.containerNumber === c.containerNumber);
    const updated = idx >= 0
      ? containers.map((x, i) => i === idx ? c : x)
      : [...containers, c];
    persist(updated);
    setShowAdd(false);
    setEditContainer(null);
    showToast(`${c.containerNumber} saved.`);
  };

  const deleteContainer = (num) => {
    if (!window.confirm(`Delete ${num}?`)) return;
    persist(containers.filter(c => c.containerNumber !== num));
    showToast(`${num} deleted.`, "danger");
  };

  const saveSettings = (s) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {}
    setShowSettings(false);
    showToast("Settings saved.");
  };

  const importContainers = (newOnes) => {
    const merged = [...containers];
    let added = 0, updated = 0;
    newOnes.forEach(c => {
      const idx = merged.findIndex(x => x.containerNumber === c.containerNumber);
      if (idx >= 0) { merged[idx] = { ...merged[idx], ...c, updatedAt: new Date().toISOString() }; updated++; }
      else { merged.push(c); added++; }
    });
    persist(merged);
    setShowImport(false);
    showToast(`Imported: ${added} added, ${updated} updated.`);
  };

  const sendEmail = async (container, subject, body) => {
    setEmailSending(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Send an email using Gmail MCP with these exact details:
To: ${settings.alertEmail || "ops@company.com"}
Subject: ${subject}
Body: ${body}

Use the Gmail send tool to send this email now.`
          }],
          mcp_servers: [{ type: "url", url: "https://gmailmcp.googleapis.com/mcp/v1", name: "gmail-mcp" }]
        })
      });
      const data = await response.json();
      const resultText = data.content?.map(b => b.text || "").join(" ") || "";
      if (resultText.toLowerCase().includes("sent") || resultText.toLowerCase().includes("success") || data.content?.some(b => b.type === "mcp_tool_result")) {
        const updated = containers.map(c => c.containerNumber === container.containerNumber ? { ...c, alertSent: true, updatedAt: new Date().toISOString() } : c);
        persist(updated);
        showToast(`Alert sent for ${container.containerNumber}`);
        setEmailTarget(null);
      } else {
        showToast("Email may not have sent — check Gmail connection.", "warning");
      }
    } catch (e) {
      showToast("Failed to send. Check Gmail MCP connection.", "danger");
    }
    setEmailSending(false);
  };

  const autoCheckAlerts = useCallback(() => {
    const due = containers.filter(c => {
      if (!c.eta || c.alertSent || c.status === "Delivered" || c.status === "Closed") return false;
      const reminder = getReminderDate(c.eta);
      return reminder && new Date() >= reminder;
    });
    return due;
  }, [containers]);

  const alertsDue = autoCheckAlerts();

  const accounts = ["All", ...Array.from(new Set(containers.map(c => c.account).filter(Boolean)))];

  const filtered = containers.filter(c => {
    const s = search.toLowerCase();
    const matchSearch = !s || c.containerNumber.toLowerCase().includes(s) || c.destination?.toLowerCase().includes(s) || c.carrier?.toLowerCase().includes(s) || c.port?.toLowerCase().includes(s) || c.account?.toLowerCase().includes(s);
    const matchStatus = filterStatus === "All" || c.status === filterStatus;
    const matchAccount = filterAccount === "All" || c.account === filterAccount;
    return matchSearch && matchStatus && matchAccount;
  }).sort((a, b) => {
    let av = a[sortKey] || "", bv = b[sortKey] || "";
    if (sortKey === "eta") { av = av || "9999"; bv = bv || "9999"; }
    const r = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? r : -r;
  });

  const stats = {
    total: containers.length,
    onWater: containers.filter(c => c.status === "On Water").length,
    arriving7: containers.filter(c => isWithin7Days(c.eta) && !["Delivered","Closed"].includes(c.status)).length,
    customsPending: containers.filter(c => c.customsStatus === "Pending" && !["Delivered","Closed"].includes(c.status)).length,
    missingTrucker: containers.filter(c => !c.truckerWarehouse && !c.truckerDistributor && !["Delivered","Closed"].includes(c.status)).length,
    atRisk: containers.filter(c => getRisks(c).length > 0).length,
    delivered: containers.filter(c => c.status === "Delivered").length,
    issues: containers.filter(c => c.status === "Issue / Hold").length,
  };

  const SortBtn = ({ k, label }) => (
    <button onClick={() => { if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } }}
      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: sortKey === k ? 500 : 400, color: sortKey === k ? "var(--color-text-primary)" : "var(--color-text-secondary)", padding: "0 2px" }}>
      {label} {sortKey === k ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </button>
  );

  const thStyle = { padding: "8px 10px", fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textAlign: "left", borderBottom: "0.5px solid var(--color-border-tertiary)", whiteSpace: "nowrap" };
  const tdStyle = { padding: "9px 10px", fontSize: 12, borderBottom: "0.5px solid var(--color-border-tertiary)", verticalAlign: "top" };

  return (
    <div style={{ fontFamily: "var(--font-sans)", color: "var(--color-text-primary)", minHeight: "100vh", background: "var(--color-background-tertiary)" }}>
      <h2 className="sr-only">Container Logistics Control Tower — tracking dashboard for inbound containers</h2>

      {/* Header */}
      <div style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "0 20px", display: "flex", alignItems: "center", gap: 16, height: 52 }}>
        <i className="ti ti-ship" style={{ fontSize: 20, color: "#378ADD" }} aria-hidden="true"></i>
        <span style={{ fontWeight: 500, fontSize: 15 }}>Container Control Tower</span>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "var(--color-background-secondary)", padding: "2px 8px", borderRadius: 10 }}>{containers.length.toLocaleString()} containers</span>
        <div style={{ flex: 1 }} />
        {alertsDue.length > 0 && (
          <span style={{ background: "#FCEBEB", color: "#A32D2D", fontSize: 12, padding: "3px 10px", borderRadius: 6, fontWeight: 500 }}>
            ⚠ {alertsDue.length} alert{alertsDue.length > 1 ? "s" : ""} due
          </span>
        )}
        <button onClick={() => setShowImport(true)} style={{ padding: "5px 12px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "none", cursor: "pointer", fontSize: 12, color: "var(--color-text-secondary)" }}>
          <i className="ti ti-upload" aria-hidden="true"></i> Import CSV
        </button>
        <button onClick={() => setShowAdd(true)} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "#1D9E75", color: "#fff", fontWeight: 500, cursor: "pointer", fontSize: 13 }}>
          + Add Container
        </button>
        <button onClick={() => setShowSettings(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 20 }}>
          <i className="ti ti-settings" aria-hidden="true"></i>
        </button>
      </div>

      {/* Alert Banner */}
      {alertsDue.length > 0 && (
        <div style={{ background: "#FAEEDA", borderBottom: "0.5px solid #FAC775", padding: "10px 20px" }}>
          <p style={{ margin: 0, fontSize: 13, color: "#412402" }}>
            <strong>7-day alerts due:</strong> {alertsDue.map(c => c.containerNumber).join(", ")} — send reminder emails now.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {alertsDue.map(c => (
              <button key={c.containerNumber} onClick={() => setEmailTarget(c)}
                style={{ padding: "4px 12px", borderRadius: 6, border: "0.5px solid #FAC775", background: "#fff", cursor: "pointer", fontSize: 12, color: "#633806" }}>
                Send alert — {c.containerNumber}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ padding: "16px 20px 0", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        {[
          { label: "Total", value: stats.total, color: "#378ADD" },
          { label: "On Water", value: stats.onWater, color: "#378ADD" },
          { label: "Arriving ≤7 Days", value: stats.arriving7, color: "#EF9F27" },
          { label: "Customs Pending", value: stats.customsPending, color: "#FAC775" },
          { label: "Missing Trucker", value: stats.missingTrucker, color: "#E24B4A" },
          { label: "At Risk", value: stats.atRisk, color: "#E24B4A" },
          { label: "Delivered", value: stats.delivered, color: "#639922" },
          { label: "Issues / Hold", value: stats.issues, color: "#A32D2D" },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: s.value > 0 && s.color === "#E24B4A" ? "#A32D2D" : "var(--color-text-primary)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...inputStyle, width: 220, padding: "6px 10px" }} placeholder="Search container, port, destination…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...selectStyle, width: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="All">All statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select style={{ ...selectStyle, width: 140 }} value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          {accounts.map(a => <option key={a}>{a}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--color-text-secondary)", marginLeft: "auto" }}>{filtered.length} of {containers.length} shown</span>
      </div>

      {/* Table */}
      <div style={{ padding: "0 20px 40px", overflowX: "auto" }}>
        {containers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--color-text-secondary)" }}>
            <i className="ti ti-box-off" style={{ fontSize: 40, display: "block", marginBottom: 12 }} aria-hidden="true"></i>
            <p style={{ fontSize: 15 }}>No containers tracked yet.</p>
            <button onClick={() => setShowAdd(true)} style={{ marginTop: 8, padding: "8px 20px", borderRadius: 8, border: "none", background: "#1D9E75", color: "#fff", fontWeight: 500, cursor: "pointer" }}>Add your first container</button>
          </div>
        ) : (
          <div style={{ background: "var(--color-background-primary)", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", minWidth: 900 }}>
              <colgroup>
                <col style={{ width: 130 }} /><col style={{ width: 80 }} /><col style={{ width: 90 }} />
                <col style={{ width: 90 }} /><col style={{ width: 140 }} /><col style={{ width: 110 }} />
                <col style={{ width: 80 }} /><col style={{ width: 90 }} /><col style={{ width: 80 }} />
                <col style={{ width: 110 }} />
              </colgroup>
              <thead>
                <tr style={{ background: "var(--color-background-secondary)" }}>
                  <th style={thStyle}><SortBtn k="containerNumber" label="Container" /></th>
                  <th style={thStyle}><SortBtn k="account" label="Account" /></th>
                  <th style={thStyle}><SortBtn k="eta" label="ETA" /></th>
                  <th style={thStyle}><SortBtn k="port" label="Port" /></th>
                  <th style={thStyle}><SortBtn k="destination" label="Destination" /></th>
                  <th style={thStyle}><SortBtn k="status" label="Status" /></th>
                  <th style={thStyle}>Customs</th>
                  <th style={thStyle}>Docs</th>
                  <th style={thStyle}>Trucker</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const missing = getMissingFields(c);
                  const risks = getRisks(c);
                  const arriving = isWithin7Days(c.eta);
                  return (
                    <tr key={c.containerNumber} style={{ background: risks.length > 0 ? "rgba(226,75,74,0.04)" : arriving ? "rgba(239,159,39,0.04)" : "transparent" }}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 500, fontSize: 12, fontFamily: "var(--font-mono)" }}>{c.containerNumber}</span>
                        {arriving && <div style={{ fontSize: 10, color: "#BA7517", marginTop: 2 }}>⚡ Arriving soon</div>}
                        {c.alertSent && <div style={{ fontSize: 10, color: "#3B6D11" }}>✓ Alert sent</div>}
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{c.account || "—"}</span></td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12 }}>{c.eta || <span style={{ color: "#A32D2D" }}>Missing</span>}</span>
                        {c.eta && <div style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>Alert: {getReminderDate(c.eta)?.toLocaleDateString() || "—"}</div>}
                      </td>
                      <td style={tdStyle}><span style={{ fontSize: 12 }}>{c.port || <span style={{ color: "#A32D2D" }}>Missing</span>}</span></td>
                      <td style={{ ...tdStyle, wordBreak: "break-word" }}><span style={{ fontSize: 12 }}>{c.destination || <span style={{ color: "#A32D2D" }}>Missing</span>}</span></td>
                      <td style={tdStyle}><Badge label={c.status} /></td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, color: c.customsStatus === "Cleared" ? "#3B6D11" : c.customsStatus === "Hold" ? "#A32D2D" : "#633806" }}>{c.customsStatus}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 11, color: c.docStatus === "Complete" ? "#3B6D11" : c.docStatus === "In Progress" ? "#633806" : "#A32D2D" }}>{c.docStatus}</span>
                      </td>
                      <td style={tdStyle}>
                        {(c.truckerWarehouse || c.truckerDistributor)
                          ? <span style={{ fontSize: 11 }}>{c.truckerWarehouse || c.truckerDistributor}</span>
                          : <span style={{ fontSize: 11, color: "#A32D2D" }}>⚠ None</span>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          <button onClick={() => setEditContainer(c)} style={{ padding: "3px 8px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "none", cursor: "pointer", fontSize: 11, color: "var(--color-text-secondary)" }}>Edit</button>
                          <button onClick={() => setEmailTarget(c)} style={{ padding: "3px 8px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "none", cursor: "pointer", fontSize: 11, color: "#185FA5" }}>
                            <i className="ti ti-mail" style={{ fontSize: 12 }} aria-hidden="true"></i>
                          </button>
                          <button onClick={() => deleteContainer(c.containerNumber)} style={{ padding: "3px 8px", borderRadius: 4, border: "0.5px solid var(--color-border-secondary)", background: "none", cursor: "pointer", fontSize: 11, color: "#A32D2D" }}>
                            <i className="ti ti-trash" style={{ fontSize: 12 }} aria-hidden="true"></i>
                          </button>
                        </div>
                        {missing.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {missing.slice(0, 2).map(m => <MissingBadge key={m} text={m} />)}
                            {missing.length > 2 && <span style={{ fontSize: 10, color: "var(--color-text-secondary)" }}>+{missing.length - 2} more</span>}
                          </div>
                        )}
                        {risks.length > 0 && (
                          <div style={{ marginTop: 2 }}>
                            {risks.slice(0, 1).map(r => <RiskBadge key={r} text={r} />)}
                            {risks.length > 1 && <span style={{ fontSize: 10, color: "#A32D2D" }}>+{risks.length - 1} more risk{risks.length > 2 ? "s" : ""}</span>}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <Modal title="Add Container" onClose={() => setShowAdd(false)}>
          <ContainerForm initial={{}} onSave={saveContainer} onClose={() => setShowAdd(false)} />
        </Modal>
      )}
      {editContainer && (
        <Modal title={`Edit — ${editContainer.containerNumber}`} onClose={() => setEditContainer(null)}>
          <ContainerForm initial={editContainer} onSave={saveContainer} onClose={() => setEditContainer(null)} />
        </Modal>
      )}
      {emailTarget && (
        <Modal title={`Alert Email — ${emailTarget.containerNumber}`} onClose={() => setEmailTarget(null)}>
          <EmailPreview
            container={emailTarget}
            recipientEmail={settings.alertEmail || "[configure in settings]"}
            onClose={() => setEmailTarget(null)}
            onSend={(subject, body) => sendEmail(emailTarget, subject, body)}
            sending={emailSending}
          />
        </Modal>
      )}
      {showSettings && (
        <Modal title="Settings" onClose={() => setShowSettings(false)}>
          <SettingsModal settings={settings} onSave={saveSettings} onClose={() => setShowSettings(false)} />
        </Modal>
      )}
      {showImport && (
        <Modal title="Import Containers (CSV)" onClose={() => setShowImport(false)}>
          <ImportModal onImport={importContainers} onClose={() => setShowImport(false)} />
        </Modal>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          background: toast.type === "danger" ? "#FCEBEB" : toast.type === "warning" ? "#FAEEDA" : "#EAF3DE",
          color: toast.type === "danger" ? "#A32D2D" : toast.type === "warning" ? "#633806" : "#3B6D11",
          padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 500,
          border: `0.5px solid ${toast.type === "danger" ? "#F7C1C1" : toast.type === "warning" ? "#FAC775" : "#C0DD97"}`,
          boxShadow: "none", maxWidth: 320
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
