import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://lltddaygonppsyvrpdsm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsdGRkYXlnb25wcHN5dnJwZHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjA5ODEsImV4cCI6MjA5NDE5Njk4MX0.1L9tV2UYanFXD4_M3gSqRd40a0rtXObxjeL77md3RtA";

const api = async (path, method = "GET", body = null) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      "Prefer": method === "POST" ? "return=representation" : method === "PATCH" ? "return=representation" : ""
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const dbToLocal = (r) => ({
  containerNumber: r.container_number, carrier: r.carrier||"", eta: r.eta||"",
  port: r.port||"", destination: r.destination||"", distributor: r.distributor||"",
  truckerWarehouse: r.trucker_warehouse||"", truckerDistributor: r.trucker_distributor||"",
  customsStatus: r.customs_status||"Pending", requiredDocs: r.required_docs||"",
  docStatus: r.doc_status||"Incomplete", pickupStatus: r.pickup_status||"Not Scheduled",
  deliveryStatus: r.delivery_status||"Pending", status: r.status||"Not Yet Tracked",
  account: r.account||"", notes: r.notes||"", alertSent: r.alert_sent||false,
  createdAt: r.created_at||"", updatedAt: r.updated_at||"", id: r.id
});

const localToDb = (c) => ({
  container_number: c.containerNumber, carrier: c.carrier||null, eta: c.eta||null,
  port: c.port||null, destination: c.destination||null, distributor: c.distributor||null,
  trucker_warehouse: c.truckerWarehouse||null, trucker_distributor: c.truckerDistributor||null,
  customs_status: c.customsStatus||"Pending", required_docs: c.requiredDocs||null,
  doc_status: c.docStatus||"Incomplete", pickup_status: c.pickupStatus||"Not Scheduled",
  delivery_status: c.deliveryStatus||"Pending", status: c.status||"Not Yet Tracked",
  account: c.account||null, notes: c.notes||null, alert_sent: c.alertSent||false,
  updated_at: new Date().toISOString()
});

const STATUSES = ["Not Yet Tracked","On Water","Arriving Within 7 Days","Arrived at Port","Customs Pending","Customs Cleared","Gated","Pickup Scheduled","Picked Up","Delivered","Closed","Issue / Hold"];

const EMPTY = {
  containerNumber:"",carrier:"",eta:"",port:"",destination:"",distributor:"",
  truckerWarehouse:"",truckerDistributor:"",customsStatus:"Pending",requiredDocs:"",
  docStatus:"Incomplete",pickupStatus:"Not Scheduled",deliveryStatus:"Pending",
  status:"Not Yet Tracked",account:"",notes:"",alertSent:false
};

function getReminderDate(eta) {
  if (!eta) return null;
  const d = new Date(eta); d.setDate(d.getDate()-7); return d;
}
function isWithin7Days(eta) {
  if (!eta) return false;
  const diff = (new Date(eta)-new Date())/86400000;
  return diff>=0 && diff<=7;
}
function isOverdue(eta) {
  if (!eta) return false;
  return new Date(eta) < new Date();
}
function getMissing(c) {
  const m=[];
  if(!c.carrier) m.push("Carrier");
  if(!c.eta) m.push("ETA");
  if(!c.port) m.push("Port");
  if(!c.destination) m.push("Destination");
  if(!c.truckerWarehouse&&!c.truckerDistributor) m.push("Trucker");
  if(!c.requiredDocs) m.push("Documents");
  return m;
}
function getRisks(c) {
  const r=[];
  if(isWithin7Days(c.eta)&&c.customsStatus==="Pending") r.push("Customs not cleared");
  if(isWithin7Days(c.eta)&&!c.truckerWarehouse&&!c.truckerDistributor) r.push("No trucker assigned");
  if(isWithin7Days(c.eta)&&c.pickupStatus==="Not Scheduled") r.push("Pickup not scheduled");
  if(isOverdue(c.eta)&&!["Delivered","Closed"].includes(c.status)) r.push("ETA passed");
  if(c.docStatus==="Incomplete"&&isWithin7Days(c.eta)) r.push("Docs incomplete");
  return r;
}

const STATUS_DOT = {
  "Not Yet Tracked":"#555","On Water":"#4a9eff","Arriving Within 7 Days":"#f0a500",
  "Arrived at Port":"#3ecf8e","Customs Pending":"#f0a500","Customs Cleared":"#3ecf8e",
  "Gated":"#a78bfa","Pickup Scheduled":"#3ecf8e","Picked Up":"#3ecf8e",
  "Delivered":"#22c55e","Closed":"#444","Issue / Hold":"#f87171"
};

const SETTINGS_KEY = "cct_settings_v3";

export default function App() {
  const [containers,setContainers] = useState([]);
  const [loading,setLoading] = useState(true);
  const [dbError,setDbError] = useState(null);
  const [settings,setSettings] = useState({alertEmail:"",teamName:"Source One Global"});
  const [search,setSearch] = useState("");
  const [filterStatus,setFilterStatus] = useState("All");
  const [filterAccount,setFilterAccount] = useState("All");
  const [sortKey,setSortKey] = useState("eta");
  const [sortDir,setSortDir] = useState("asc");
  const [editContainer,setEditContainer] = useState(null);
  const [showAdd,setShowAdd] = useState(false);
  const [showSettings,setShowSettings] = useState(false);
  const [showImport,setShowImport] = useState(false);
  const [emailTarget,setEmailTarget] = useState(null);
  const [emailSending,setEmailSending] = useState(false);
  const [saving,setSaving] = useState(false);
  const [toast,setToast] = useState(null);
  const [lastRefresh,setLastRefresh] = useState(null);

  const showToast = (msg,type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };

  const loadContainers = useCallback(async () => {
    try {
      setDbError(null);
      const data = await api("/containers?order=eta.asc.nullslast&limit=2000");
      setContainers((data||[]).map(dbToLocal));
      setLastRefresh(new Date());
    } catch(e) { setDbError(e.message); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{
    loadContainers();
    const iv = setInterval(loadContainers,30000);
    return ()=>clearInterval(iv);
  },[loadContainers]);

  useEffect(()=>{
    try { const r=localStorage.getItem(SETTINGS_KEY); if(r) setSettings(JSON.parse(r)); } catch{}
  },[]);

  const persistSettings = (s) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY,JSON.stringify(s)); } catch{}
  };

  const saveContainer = async (c) => {
    setSaving(true);
    try {
      const existing = containers.find(x=>x.containerNumber===c.containerNumber);
      if(existing) {
        const updated = await api(`/containers?container_number=eq.${c.containerNumber}`,"PATCH",localToDb(c));
        setContainers(prev=>prev.map(x=>x.containerNumber===c.containerNumber?dbToLocal((updated||[])[0]||localToDb(c)):x));
        showToast(`${c.containerNumber} updated.`);
      } else {
        const created = await api("/containers","POST",{...localToDb(c),created_at:new Date().toISOString()});
        setContainers(prev=>[...prev,dbToLocal((created||[])[0]||localToDb(c))]);
        showToast(`${c.containerNumber} added.`);
      }
      setShowAdd(false); setEditContainer(null);
    } catch(e) { showToast(`Save failed: ${e.message}`,"danger"); }
    setSaving(false);
  };

  const deleteContainer = async (num) => {
    if (!window.confirm(`Delete ${num}? This cannot be undone.`)) return;
    try {
      await api(`/containers?container_number=eq.${num}`,"DELETE");
      setContainers(prev=>prev.filter(c=>c.containerNumber!==num));
      showToast(`${num} deleted.`,"danger");
    } catch(e) { showToast(`Delete failed: ${e.message}`,"danger"); }
  };

  const importContainers = async (newOnes) => {
    setSaving(true);
    let added=0,updated=0,failed=0;
    for(const c of newOnes){
      try {
        const existing = containers.find(x=>x.containerNumber===c.containerNumber);
        if(existing){ await api(`/containers?container_number=eq.${c.containerNumber}`,"PATCH",localToDb(c)); updated++; }
        else { await api("/containers","POST",{...localToDb(c),created_at:new Date().toISOString()}); added++; }
      } catch { failed++; }
    }
    await loadContainers();
    setShowImport(false);
    showToast(`Import: ${added} added, ${updated} updated${failed>0?`, ${failed} failed`:""}.`);
    setSaving(false);
  };

  const sendEmail = async (container,subject,body) => {
    setEmailSending(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:1000,
          messages:[{role:"user",content:`Send an email via Gmail:\nTo: ${settings.alertEmail}\nSubject: ${subject}\nBody: ${body}`}],
          mcp_servers:[{type:"url",url:"https://gmailmcp.googleapis.com/mcp/v1",name:"gmail-mcp"}]
        })
      });
      const data = await response.json();
      const txt = (data.content||[]).map(b=>b.text||"").join(" ");
      if(txt.toLowerCase().includes("sent")||txt.toLowerCase().includes("success")||(data.content||[]).some(b=>b.type==="mcp_tool_result")){
        await api(`/containers?container_number=eq.${container.containerNumber}`,"PATCH",{alert_sent:true,updated_at:new Date().toISOString()});
        setContainers(prev=>prev.map(c=>c.containerNumber===container.containerNumber?{...c,alertSent:true}:c));
        showToast(`Alert sent for ${container.containerNumber}`);
        setEmailTarget(null);
      } else { showToast("Email may not have sent — check Gmail connection.","warning"); }
    } catch(e) { showToast("Email failed.","danger"); }
    setEmailSending(false);
  };

  const alertsDue = containers.filter(c=>{
    if(!c.eta||c.alertSent||["Delivered","Closed"].includes(c.status)) return false;
    const rem = getReminderDate(c.eta);
    return rem && new Date()>=rem;
  });

  const accounts = ["All",...Array.from(new Set(containers.map(c=>c.account).filter(Boolean))).sort()];

  const filtered = containers.filter(c=>{
    const s = search.toLowerCase();
    const ms = !s||[c.containerNumber,c.destination,c.carrier,c.port,c.account,c.distributor].some(v=>(v||"").toLowerCase().includes(s));
    return ms&&(filterStatus==="All"||c.status===filterStatus)&&(filterAccount==="All"||c.account===filterAccount);
  }).sort((a,b)=>{
    let av=a[sortKey]||"",bv=b[sortKey]||"";
    if(sortKey==="eta"){av=av||"9999";bv=bv||"9999";}
    const r=av<bv?-1:av>bv?1:0;
    return sortDir==="asc"?r:-r;
  });

  const stats = [
    {label:"Total",value:containers.length,color:"#ffffff"},
    {label:"On Water",value:containers.filter(c=>c.status==="On Water").length,color:"#4a9eff"},
    {label:"Arriving ≤7 Days",value:containers.filter(c=>isWithin7Days(c.eta)&&!["Delivered","Closed"].includes(c.status)).length,color:"#f0a500"},
    {label:"Customs Pending",value:containers.filter(c=>c.customsStatus==="Pending"&&!["Delivered","Closed"].includes(c.status)).length,color:"#f0a500"},
    {label:"Missing Trucker",value:containers.filter(c=>!c.truckerWarehouse&&!c.truckerDistributor&&!["Delivered","Closed"].includes(c.status)).length,color:"#f87171"},
    {label:"At Risk",value:containers.filter(c=>getRisks(c).length>0).length,color:"#f87171"},
    {label:"Delivered",value:containers.filter(c=>c.status==="Delivered").length,color:"#22c55e"},
    {label:"Issues",value:containers.filter(c=>c.status==="Issue / Hold").length,color:"#f87171"},
  ];

  const SortBtn = ({k,label}) => (
    <button onClick={()=>{if(sortKey===k)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(k);setSortDir("asc");}}}
      style={{background:"none",border:"none",cursor:"pointer",fontSize:10,fontWeight:sortKey===k?700:400,
        color:sortKey===k?"#ffffff":"#666",padding:"0 2px",whiteSpace:"nowrap",
        letterSpacing:"0.06em",textTransform:"uppercase",fontFamily:"inherit"}}>
      {label}{sortKey===k?(sortDir==="asc"?" ↑":" ↓"):""}
    </button>
  );

  // Shared input style for DARK backgrounds (app)
  const darkInp = {
    width:"100%",boxSizing:"border-box",padding:"8px 12px",
    border:"1px solid #333",borderRadius:6,
    background:"#1a1a1a",color:"#ffffff",fontSize:13,
    fontFamily:"inherit",outline:"none"
  };

  // Input style for WHITE modal
  const lightInp = {
    width:"100%",boxSizing:"border-box",padding:"8px 12px",
    border:"1px solid #ddd",borderRadius:6,
    background:"#f9f9f9",color:"#111111",fontSize:13,
    fontFamily:"inherit",outline:"none"
  };

  // Modal wrapper - always white
  const Modal = ({title,onClose,children}) => (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,
      backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div style={{background:"#ffffff",borderRadius:12,padding:"28px",
        width:"min(94vw,700px)",maxHeight:"92vh",overflowY:"auto",
        boxSizing:"border-box",color:"#111111"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h2 style={{margin:0,fontSize:16,fontWeight:700,color:"#111111",letterSpacing:"0.01em"}}>{title}</h2>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
            fontSize:22,color:"#999",lineHeight:1,padding:4}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );

  const Label = ({children}) => (
    <label style={{fontSize:11,color:"#666",display:"block",marginBottom:4,
      letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:600}}>{children}</label>
  );

  const ContainerForm = ({initial,onSave,onClose,isSaving}) => {
    const [form,setForm] = useState({...EMPTY,...initial});
    const set = (k,v) => setForm(f=>({...f,[k]:v}));
    const handleSave = () => {
      if(!form.containerNumber.trim()) return alert("Container number is required.");
      onSave({...form,containerNumber:form.containerNumber.trim().toUpperCase()});
    };
    const F = ({label,children}) => (
      <div style={{marginBottom:14}}>
        <Label>{label}</Label>
        {children}
      </div>
    );
    return (
      <div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
          <F label="Container Number *"><input style={lightInp} value={form.containerNumber} onChange={e=>set("containerNumber",e.target.value.toUpperCase())} placeholder="e.g. TCNU8484777"/></F>
          <F label="Account / Client"><input style={lightInp} value={form.account} onChange={e=>set("account",e.target.value)} placeholder="e.g. CAVA, TFK"/></F>
          <F label="Shipping Line / Carrier"><input style={lightInp} value={form.carrier} onChange={e=>set("carrier",e.target.value)} placeholder="e.g. Maersk, MSC"/></F>
          <F label="ETA to Port"><input type="date" style={lightInp} value={form.eta} onChange={e=>set("eta",e.target.value)}/></F>
          <F label="Port of Arrival"><input style={lightInp} value={form.port} onChange={e=>set("port",e.target.value)} placeholder="e.g. Long Beach, Charleston"/></F>
          <F label="Final Destination"><input style={lightInp} value={form.destination} onChange={e=>set("destination",e.target.value)}/></F>
          <F label="Distributor (if applicable)"><input style={lightInp} value={form.distributor} onChange={e=>set("distributor",e.target.value)}/></F>
          <F label="Status">
            <select style={{...lightInp}} value={form.status} onChange={e=>set("status",e.target.value)}>
              {STATUSES.map(s=><option key={s}>{s}</option>)}
            </select>
          </F>
          <F label="Trucker — Port to Warehouse"><input style={lightInp} value={form.truckerWarehouse} onChange={e=>set("truckerWarehouse",e.target.value)}/></F>
          <F label="Trucker — Port to Distributor"><input style={lightInp} value={form.truckerDistributor} onChange={e=>set("truckerDistributor",e.target.value)}/></F>
          <F label="Customs Status">
            <select style={{...lightInp}} value={form.customsStatus} onChange={e=>set("customsStatus",e.target.value)}>
              {["Pending","In Progress","Cleared","Hold"].map(s=><option key={s}>{s}</option>)}
            </select>
          </F>
          <F label="Document Status">
            <select style={{...lightInp}} value={form.docStatus} onChange={e=>set("docStatus",e.target.value)}>
              {["Incomplete","In Progress","Complete"].map(s=><option key={s}>{s}</option>)}
            </select>
          </F>
          <F label="Pickup Status">
            <select style={{...lightInp}} value={form.pickupStatus} onChange={e=>set("pickupStatus",e.target.value)}>
              {["Not Scheduled","Scheduled","Completed"].map(s=><option key={s}>{s}</option>)}
            </select>
          </F>
          <F label="Delivery Status">
            <select style={{...lightInp}} value={form.deliveryStatus} onChange={e=>set("deliveryStatus",e.target.value)}>
              {["Pending","In Transit","Delivered"].map(s=><option key={s}>{s}</option>)}
            </select>
          </F>
        </div>
        <F label="Required Documents"><input style={lightInp} value={form.requiredDocs} onChange={e=>set("requiredDocs",e.target.value)} placeholder="e.g. BL, Commercial Invoice, Packing List"/></F>
        <F label="Notes / Risks / Next Actions"><textarea style={{...lightInp,minHeight:80,resize:"vertical"}} value={form.notes} onChange={e=>set("notes",e.target.value)}/></F>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",borderTop:"1px solid #eee",paddingTop:16,marginTop:8}}>
          <button onClick={onClose} style={{padding:"8px 18px",borderRadius:6,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:13,color:"#555",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={handleSave} disabled={isSaving} style={{padding:"8px 20px",borderRadius:6,border:"none",background:"#111",color:"#fff",fontWeight:600,cursor:isSaving?"not-allowed":"pointer",fontSize:13,opacity:isSaving?0.6:1,fontFamily:"inherit"}}>
            {isSaving?"Saving…":"Save Container"}
          </button>
        </div>
      </div>
    );
  };

  const EmailPreview = ({container,recipientEmail,onClose,onSend,isSending}) => {
    const missing = getMissing(container);
    const risks = getRisks(container);
    const subject = `[Action Required] Container ${container.containerNumber} — Arriving ${container.eta||"TBD"}`;
    const body = `Hi Team,\n\nContainer ${container.containerNumber} is arriving${container.eta?` on ${container.eta}`:" soon"} at ${container.port||"[Port TBD]"}.\n\nPlease confirm the following before arrival:\n\n1. Assigned Trucker: ${container.truckerWarehouse||container.truckerDistributor||"⚠ NOT ASSIGNED"}\n2. Final Destination: ${container.destination||"⚠ NOT CONFIRMED"}\n3. Moving to: ${container.distributor?`Distributor — ${container.distributor}`:"Warehouse"}\n4. Customs Status: ${container.customsStatus}\n5. Document Status: ${container.docStatus}${container.requiredDocs?` (${container.requiredDocs})`:""}\n6. Pickup Scheduled: ${container.pickupStatus}${missing.length>0?`\n\nMissing Information:\n${missing.map(m=>`  • ${m}`).join("\n")}`:""}${risks.length>0?`\n\nRisks Identified:\n${risks.map(r=>`  ⚠ ${r}`).join("\n")}`:"" }\n\nPlease confirm or update the above by end of day.\n\n— Source One Global | Container Control Tower`;
    return (
      <div>
        <div style={{marginBottom:12}}>
          <Label>To</Label>
          <div style={{fontSize:13,color:"#111",padding:"6px 0"}}>{recipientEmail||"[configure in Settings]"}</div>
        </div>
        <div style={{marginBottom:12}}>
          <Label>Subject</Label>
          <div style={{fontSize:13,fontWeight:600,color:"#111"}}>{subject}</div>
        </div>
        <div style={{marginBottom:20}}>
          <Label>Body</Label>
          <pre style={{fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap",background:"#f5f5f5",
            padding:14,borderRadius:6,border:"1px solid #e0e0e0",
            fontFamily:"'SF Mono','Fira Code',monospace",color:"#333",
            maxHeight:260,overflowY:"auto",margin:0,marginTop:6}}>{body}</pre>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",borderTop:"1px solid #eee",paddingTop:16}}>
          <button onClick={onClose} style={{padding:"8px 18px",borderRadius:6,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:13,color:"#555",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={()=>onSend(subject,body)} disabled={isSending}
            style={{padding:"8px 18px",borderRadius:6,border:"none",background:"#2563eb",color:"#fff",fontWeight:600,cursor:isSending?"not-allowed":"pointer",fontSize:13,opacity:isSending?0.6:1,fontFamily:"inherit"}}>
            {isSending?"Sending…":"Send via Gmail"}
          </button>
        </div>
      </div>
    );
  };

  const ImportModal = ({onImport,onClose}) => {
    const [text,setText] = useState("");
    const [error,setError] = useState("");
    const handle = () => {
      try {
        const rows = text.trim().split("\n").filter(Boolean);
        const out = rows.map((row,i)=>{
          const p = row.split(",").map(s=>s.trim());
          if(!p[0]) throw new Error(`Row ${i+1}: missing container number`);
          return {...EMPTY,containerNumber:p[0].toUpperCase(),carrier:p[1]||"",eta:p[2]||"",port:p[3]||"",destination:p[4]||"",account:p[5]||"",status:"On Water"};
        });
        onImport(out);
      } catch(e){ setError(e.message); }
    };
    return (
      <div>
        <p style={{fontSize:13,color:"#555",marginTop:0,lineHeight:1.6}}>
          One container per line:<br/>
          <code style={{fontSize:11,background:"#f0f0f0",padding:"2px 6px",borderRadius:3,color:"#333"}}>ContainerNo, Carrier, ETA (YYYY-MM-DD), Port, Destination, Account</code>
        </p>
        <textarea style={{...lightInp,minHeight:180,resize:"vertical",fontFamily:"monospace",fontSize:12}}
          value={text} onChange={e=>{setText(e.target.value);setError("");}}
          placeholder={"TCNU8484777, Maersk, 2025-06-15, Long Beach, LA Warehouse, CAVA"}/>
        {error&&<p style={{color:"#dc2626",fontSize:12,marginTop:4}}>⚠ {error}</p>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:16,borderTop:"1px solid #eee",paddingTop:16}}>
          <button onClick={onClose} style={{padding:"8px 18px",borderRadius:6,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:13,color:"#555",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={handle} style={{padding:"8px 18px",borderRadius:6,border:"none",background:"#111",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Import</button>
        </div>
      </div>
    );
  };

  const SettingsModal = ({onClose}) => {
    const [form,setForm] = useState({...settings});
    return (
      <div>
        <div style={{marginBottom:14}}>
          <Label>Alert Recipient Email(s) — comma separated</Label>
          <input style={lightInp} value={form.alertEmail||""} onChange={e=>setForm(f=>({...f,alertEmail:e.target.value}))} placeholder="ops@sourceone.global"/>
        </div>
        <div style={{marginBottom:20}}>
          <Label>Team / Company Name</Label>
          <input style={lightInp} value={form.teamName||""} onChange={e=>setForm(f=>({...f,teamName:e.target.value}))} placeholder="Source One Global"/>
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",borderTop:"1px solid #eee",paddingTop:16}}>
          <button onClick={onClose} style={{padding:"8px 18px",borderRadius:6,border:"1px solid #ddd",background:"#fff",cursor:"pointer",fontSize:13,color:"#555",fontFamily:"inherit"}}>Cancel</button>
          <button onClick={()=>{persistSettings(form);onClose();showToast("Settings saved.");}} style={{padding:"8px 20px",borderRadius:6,border:"none",background:"#111",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Save Settings</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
      color:"#ffffff",minHeight:"100vh",background:"#0a0a0a"}}>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        body{background:#0a0a0a!important;color:#fff!important}
        #root{background:#0a0a0a!important}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#111}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        tr:hover td{background:rgba(255,255,255,0.025)!important}
      `}</style>

      {/* HEADER */}
      <div style={{background:"#111111",borderBottom:"1px solid #222",padding:"0 24px",
        display:"flex",alignItems:"center",gap:14,height:56,
        position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,background:"#ffffff",borderRadius:4,
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="1" y="5" width="16" height="10" rx="1.5" stroke="#0a0a0a" strokeWidth="1.5"/>
              <path d="M5 5V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1" stroke="#0a0a0a" strokeWidth="1.5"/>
              <path d="M1 9h16" stroke="#0a0a0a" strokeWidth="1.5"/>
              <circle cx="9" cy="9" r="1.2" fill="#0a0a0a"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:12,fontWeight:800,letterSpacing:"0.08em",color:"#ffffff",lineHeight:1.1,textTransform:"uppercase"}}>Source One Global</div>
            <div style={{fontSize:9,color:"#555",letterSpacing:"0.14em",textTransform:"uppercase",lineHeight:1.2}}>Container Control Tower</div>
          </div>
        </div>
        <div style={{width:1,height:24,background:"#2a2a2a",margin:"0 4px"}}/>
        <span style={{fontSize:12,color:"#555"}}>{containers.length.toLocaleString()} containers</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:"#22c55e",display:"inline-block"}}/>
          <span style={{fontSize:11,color:"#22c55e"}}>Live</span>
        </div>
        {lastRefresh&&<span style={{fontSize:11,color:"#444"}}>↻ {lastRefresh.toLocaleTimeString()}</span>}
        <div style={{flex:1}}/>
        {alertsDue.length>0&&(
          <span style={{background:"rgba(248,113,113,0.15)",color:"#f87171",fontSize:11,
            padding:"4px 10px",borderRadius:4,fontWeight:600,border:"1px solid rgba(248,113,113,0.3)"}}>
            ⚠ {alertsDue.length} alert{alertsDue.length>1?"s":""} due
          </span>
        )}
        <button onClick={loadContainers}
          style={{padding:"6px 10px",borderRadius:6,border:"1px solid #2a2a2a",background:"transparent",cursor:"pointer",fontSize:13,color:"#555",fontFamily:"inherit"}}>↻</button>
        <button onClick={()=>setShowImport(true)}
          style={{padding:"6px 12px",borderRadius:6,border:"1px solid #2a2a2a",background:"transparent",cursor:"pointer",fontSize:12,color:"#888",fontFamily:"inherit"}}>↑ Import CSV</button>
        <button onClick={()=>setShowAdd(true)}
          style={{padding:"6px 16px",borderRadius:6,border:"none",background:"#ffffff",color:"#0a0a0a",fontWeight:700,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>+ Add Container</button>
        <button onClick={()=>setShowSettings(true)}
          style={{padding:"6px 10px",borderRadius:6,border:"1px solid #2a2a2a",background:"transparent",cursor:"pointer",fontSize:15,color:"#555",fontFamily:"inherit"}}>⚙</button>
      </div>

      {/* DB ERROR */}
      {dbError&&(
        <div style={{background:"rgba(248,113,113,0.08)",borderBottom:"1px solid rgba(248,113,113,0.2)",padding:"10px 24px",fontSize:12,color:"#f87171"}}>
          ⚠ Database error: {dbError} — <button onClick={loadContainers} style={{background:"none",border:"none",color:"#f87171",cursor:"pointer",textDecoration:"underline",fontSize:12,padding:0}}>retry</button>
        </div>
      )}

      {/* ALERT BANNER */}
      {alertsDue.length>0&&(
        <div style={{background:"rgba(240,165,0,0.06)",borderBottom:"1px solid rgba(240,165,0,0.15)",padding:"12px 24px"}}>
          <p style={{margin:"0 0 8px",fontSize:11,color:"#f0a500",fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase"}}>7-day alerts due</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {alertsDue.map(c=>(
              <button key={c.containerNumber} onClick={()=>setEmailTarget(c)}
                style={{padding:"5px 12px",borderRadius:6,border:"1px solid rgba(240,165,0,0.3)",
                  background:"transparent",cursor:"pointer",fontSize:12,color:"#f0a500",fontFamily:"inherit"}}>
                ✉ {c.containerNumber} — ETA {c.eta}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STATS */}
      <div style={{padding:"20px 24px 0",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:12}}>
        {stats.map(s=>(
          <div key={s.label} style={{background:"#111",border:"1px solid #1e1e1e",borderRadius:8,
            padding:"14px 16px",borderTop:`2px solid ${s.value>0&&s.color!=="#ffffff"?s.color:"#222"}`}}>
            <div style={{fontSize:10,color:"#444",marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:600}}>{s.label}</div>
            <div style={{fontSize:26,fontWeight:800,color:s.value>0?s.color:"#333",letterSpacing:"-0.02em"}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div style={{padding:"16px 24px",display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <input style={{...darkInp,width:240}} placeholder="Search container, port, destination…" value={search} onChange={e=>setSearch(e.target.value)}/>
        <select style={{...darkInp,width:180}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="All">All statuses</option>
          {STATUSES.map(s=><option key={s} style={{background:"#1a1a1a",color:"#fff"}}>{s}</option>)}
        </select>
        <select style={{...darkInp,width:140}} value={filterAccount} onChange={e=>setFilterAccount(e.target.value)}>
          {accounts.map(a=><option key={a} style={{background:"#1a1a1a",color:"#fff"}}>{a}</option>)}
        </select>
        <span style={{fontSize:11,color:"#444",marginLeft:"auto"}}>{filtered.length.toLocaleString()} / {containers.length.toLocaleString()}</span>
      </div>

      {/* TABLE */}
      <div style={{padding:"0 24px 60px",overflowX:"auto"}}>
        {loading?(
          <div style={{textAlign:"center",padding:"80px 0",color:"#444"}}>
            <div style={{fontSize:28,animation:"spin 1s linear infinite",display:"inline-block",marginBottom:12}}>⟳</div>
            <p style={{fontSize:13,marginTop:8,letterSpacing:"0.04em"}}>Connecting to database…</p>
          </div>
        ):containers.length===0&&!dbError?(
          <div style={{textAlign:"center",padding:"80px 0",color:"#444"}}>
            <p style={{fontSize:14,marginBottom:4,color:"#666"}}>No containers tracked yet.</p>
            <p style={{fontSize:12,marginBottom:20}}>Add your first container or import a CSV.</p>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setShowAdd(true)} style={{padding:"8px 20px",borderRadius:8,border:"none",background:"#fff",color:"#000",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Add Container</button>
              <button onClick={()=>setShowImport(true)} style={{padding:"8px 20px",borderRadius:8,border:"1px solid #333",background:"transparent",cursor:"pointer",color:"#888",fontFamily:"inherit"}}>Import CSV</button>
            </div>
          </div>
        ):(
          <div style={{background:"#111",borderRadius:8,border:"1px solid #1e1e1e",overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",minWidth:980}}>
              <colgroup>
                <col style={{width:135}}/><col style={{width:80}}/><col style={{width:95}}/>
                <col style={{width:95}}/><col style={{width:150}}/><col style={{width:155}}/>
                <col style={{width:80}}/><col style={{width:80}}/><col style={{width:90}}/><col style={{width:130}}/>
              </colgroup>
              <thead>
                <tr style={{background:"#161616"}}>
                  {[["containerNumber","Container"],["account","Account"],["eta","ETA"],["port","Port"],["destination","Destination"],["status","Status"]].map(([k,l])=>(
                    <th key={k} style={{padding:"10px 12px",fontSize:10,color:"#444",fontWeight:700,textAlign:"left",borderBottom:"1px solid #1e1e1e",whiteSpace:"nowrap",letterSpacing:"0.06em",textTransform:"uppercase"}}>
                      <SortBtn k={k} label={l}/>
                    </th>
                  ))}
                  {["Customs","Docs","Trucker","Actions"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",fontSize:10,color:"#444",fontWeight:700,textAlign:"left",borderBottom:"1px solid #1e1e1e",letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c=>{
                  const missing=getMissing(c);
                  const risks=getRisks(c);
                  const arriving=isWithin7Days(c.eta);
                  const overdue=isOverdue(c.eta)&&!["Delivered","Closed"].includes(c.status);
                  const td={padding:"12px 12px",fontSize:12,borderBottom:"1px solid #1a1a1a",verticalAlign:"top",color:"#ccc"};
                  return (
                    <tr key={c.containerNumber}>
                      <td style={td}>
                        <span style={{fontWeight:700,fontSize:12,fontFamily:"'SF Mono','Fira Code',monospace",color:"#fff",letterSpacing:"0.04em"}}>{c.containerNumber}</span>
                        {arriving&&!overdue&&<div style={{fontSize:10,color:"#f0a500",marginTop:3}}>⚡ Arriving soon</div>}
                        {overdue&&<div style={{fontSize:10,color:"#f87171",marginTop:3}}>⚠ ETA passed</div>}
                        {c.alertSent&&<div style={{fontSize:10,color:"#22c55e",marginTop:2}}>✓ Alert sent</div>}
                      </td>
                      <td style={td}>
                        {c.account?<span style={{fontSize:11,background:"#1a1a1a",color:"#888",padding:"2px 7px",borderRadius:3,border:"1px solid #2a2a2a",fontWeight:500}}>{c.account}</span>:<span style={{color:"#333"}}>—</span>}
                      </td>
                      <td style={td}>
                        <span style={{fontSize:12,color:c.eta?"#ccc":"#f87171",fontFamily:"monospace"}}>{c.eta||"Missing"}</span>
                        {c.eta&&<div style={{fontSize:10,color:"#444",marginTop:2}}>↻ {getReminderDate(c.eta)?.toLocaleDateString()||"—"}</div>}
                      </td>
                      <td style={{...td,color:c.port?"#ccc":"#f87171"}}>{c.port||"Missing"}</td>
                      <td style={{...td,wordBreak:"break-word",color:c.destination?"#ccc":"#f87171"}}>{c.destination||"Missing"}</td>
                      <td style={td}>
                        <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:500,
                          color:STATUS_DOT[c.status]||"#888",whiteSpace:"nowrap"}}>
                          <span style={{width:5,height:5,borderRadius:"50%",background:STATUS_DOT[c.status]||"#555",flexShrink:0}}/>
                          {c.status}
                        </span>
                      </td>
                      <td style={td}><span style={{fontSize:11,color:c.customsStatus==="Cleared"?"#22c55e":c.customsStatus==="Hold"?"#f87171":"#f0a500"}}>{c.customsStatus}</span></td>
                      <td style={td}><span style={{fontSize:11,color:c.docStatus==="Complete"?"#22c55e":c.docStatus==="In Progress"?"#f0a500":"#f87171"}}>{c.docStatus}</span></td>
                      <td style={td}>
                        {(c.truckerWarehouse||c.truckerDistributor)
                          ?<span style={{fontSize:11,color:"#888"}}>{c.truckerWarehouse||c.truckerDistributor}</span>
                          :<span style={{fontSize:11,color:"#f87171"}}>⚠ None</span>}
                      </td>
                      <td style={td}>
                        <div style={{display:"flex",gap:4,marginBottom:missing.length||risks.length?5:0}}>
                          <button onClick={()=>setEditContainer(c)} style={{padding:"3px 9px",borderRadius:4,border:"1px solid #2a2a2a",background:"transparent",cursor:"pointer",fontSize:11,color:"#888",fontFamily:"inherit"}}>Edit</button>
                          <button onClick={()=>setEmailTarget(c)} style={{padding:"3px 8px",borderRadius:4,border:"1px solid #2a2a2a",background:"transparent",cursor:"pointer",fontSize:12,color:"#4a9eff",fontFamily:"inherit"}}>✉</button>
                          <button onClick={()=>deleteContainer(c.containerNumber)} style={{padding:"3px 8px",borderRadius:4,border:"1px solid #2a2a2a",background:"transparent",cursor:"pointer",fontSize:12,color:"#f87171",fontFamily:"inherit"}}>✕</button>
                        </div>
                        {missing.slice(0,2).map(m=>(
                          <span key={m} style={{display:"inline-block",background:"rgba(240,165,0,0.08)",color:"#f0a500",fontSize:10,padding:"1px 6px",borderRadius:3,marginRight:3,marginBottom:2,border:"1px solid rgba(240,165,0,0.15)"}}>✗ {m}</span>
                        ))}
                        {missing.length>2&&<span style={{fontSize:10,color:"#444"}}>+{missing.length-2}</span>}
                        {risks.slice(0,1).map(r=>(
                          <span key={r} style={{display:"block",background:"rgba(248,113,113,0.08)",color:"#f87171",fontSize:10,padding:"1px 6px",borderRadius:3,marginTop:2,border:"1px solid rgba(248,113,113,0.15)"}}>⚠ {r}</span>
                        ))}
                        {risks.length>1&&<span style={{fontSize:10,color:"#f87171"}}>+{risks.length-1} more</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODALS */}
      {showAdd&&<Modal title="Add Container" onClose={()=>setShowAdd(false)}><ContainerForm initial={{}} onSave={saveContainer} onClose={()=>setShowAdd(false)} isSaving={saving}/></Modal>}
      {editContainer&&<Modal title={`Edit — ${editContainer.containerNumber}`} onClose={()=>setEditContainer(null)}><ContainerForm initial={editContainer} onSave={saveContainer} onClose={()=>setEditContainer(null)} isSaving={saving}/></Modal>}
      {emailTarget&&<Modal title={`Alert Email — ${emailTarget.containerNumber}`} onClose={()=>setEmailTarget(null)}><EmailPreview container={emailTarget} recipientEmail={settings.alertEmail} onClose={()=>setEmailTarget(null)} onSend={(s,b)=>sendEmail(emailTarget,s,b)} isSending={emailSending}/></Modal>}
      {showSettings&&<Modal title="Settings" onClose={()=>setShowSettings(false)}><SettingsModal onClose={()=>setShowSettings(false)}/></Modal>}
      {showImport&&<Modal title="Import Containers" onClose={()=>setShowImport(false)}><ImportModal onImport={importContainers} onClose={()=>setShowImport(false)}/></Modal>}

      {/* TOAST */}
      {toast&&(
        <div style={{position:"fixed",bottom:24,right:24,zIndex:2000,
          background:toast.type==="danger"?"rgba(248,113,113,0.12)":toast.type==="warning"?"rgba(240,165,0,0.12)":"rgba(34,197,94,0.12)",
          color:toast.type==="danger"?"#f87171":toast.type==="warning"?"#f0a500":"#22c55e",
          padding:"12px 20px",borderRadius:8,fontSize:13,fontWeight:500,
          border:`1px solid ${toast.type==="danger"?"rgba(248,113,113,0.25)":toast.type==="warning"?"rgba(240,165,0,0.25)":"rgba(34,197,94,0.25)"}`,
          maxWidth:340}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
