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

const STATUS_CONFIG = {
  "Not Yet Tracked":    { bg:"#1a1a1a", text:"#888", dot:"#555" },
  "On Water":           { bg:"#0a1628", text:"#4a9eff", dot:"#4a9eff" },
  "Arriving Within 7 Days": { bg:"#1a1200", text:"#f0a500", dot:"#f0a500" },
  "Arrived at Port":    { bg:"#0a1a12", text:"#3ecf8e", dot:"#3ecf8e" },
  "Customs Pending":    { bg:"#1a1200", text:"#f0a500", dot:"#f0a500" },
  "Customs Cleared":    { bg:"#0a1a12", text:"#3ecf8e", dot:"#3ecf8e" },
  "Gated":              { bg:"#120a1a", text:"#a78bfa", dot:"#a78bfa" },
  "Pickup Scheduled":   { bg:"#0a1a12", text:"#3ecf8e", dot:"#3ecf8e" },
  "Picked Up":          { bg:"#0a1a12", text:"#3ecf8e", dot:"#3ecf8e" },
  "Delivered":          { bg:"#050f08", text:"#22c55e", dot:"#22c55e" },
  "Closed":             { bg:"#111", text:"#555", dot:"#444" },
  "Issue / Hold":       { bg:"#1a0a0a", text:"#f87171", dot:"#f87171" },
};

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
  return new Date(eta)<new Date();
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

const G = {
  bg: "#0a0a0a",
  surface: "#111111",
  surface2: "#181818",
  border: "#2a2a2a",
  border2: "#333333",
  text: "#ffffff",
  textMuted: "#888888",
  textDim: "#555555",
  accent: "#ffffff",
  accentDim: "#333333",
  green: "#3ecf8e",
  red: "#f87171",
  amber: "#f0a500",
  blue: "#4a9eff",
};

const inp = {
  width:"100%", boxSizing:"border-box", padding:"8px 12px",
  border:`1px solid ${G.border2}`, borderRadius:6,
  background:G.surface2, color:G.text, fontSize:13,
  outline:"none", fontFamily:"inherit"
};

const btnPrimary = {
  padding:"8px 18px", borderRadius:6, border:"none",
  background:G.text, color:G.bg, fontWeight:600,
  cursor:"pointer", fontSize:13, letterSpacing:"0.02em"
};

const btnSecondary = {
  padding:"8px 14px", borderRadius:6,
  border:`1px solid ${G.border2}`, background:"transparent",
  color:G.textMuted, cursor:"pointer", fontSize:12, fontFamily:"inherit"
};

function StatusBadge({label}) {
  const cfg = STATUS_CONFIG[label] || { bg:"#1a1a1a", text:"#888", dot:"#555" };
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5,
      background:cfg.bg, color:cfg.text, fontSize:11, fontWeight:500,
      padding:"3px 8px", borderRadius:4, whiteSpace:"nowrap",
      border:`1px solid ${cfg.dot}22`
    }}>
      <span style={{ width:5, height:5, borderRadius:"50%", background:cfg.dot, flexShrink:0 }}></span>
      {label}
    </span>
  );
}

function Modal({title,onClose,children}) {
  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",
      alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)" }}
      onClick={onClose}>
      <div style={{ background:G.surface,borderRadius:10,border:`1px solid ${G.border2}`,
        padding:"24px",width:"min(94vw,700px)",maxHeight:"92vh",overflowY:"auto",
        boxSizing:"border-box" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
          <h2 style={{ margin:0,fontSize:16,fontWeight:600,color:G.text,letterSpacing:"0.01em" }}>{title}</h2>
          <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",
            fontSize:20,color:G.textDim,lineHeight:1,padding:4 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Label({children}) {
  return <label style={{ fontSize:11,color:G.textMuted,display:"block",marginBottom:4,
    letterSpacing:"0.05em",textTransform:"uppercase",fontWeight:500 }}>{children}</label>;
}

function ContainerForm({initial,onSave,onClose,saving}) {
  const [form,setForm]=useState({...EMPTY,...initial});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleSave=()=>{
    if(!form.containerNumber.trim()) return alert("Container number is required.");
    onSave({...form,containerNumber:form.containerNumber.trim().toUpperCase()});
  };
  const row = { display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px" };
  const field = (label,key,type="text",ph="",opts=null) => (
    <div style={{ marginBottom:14 }}>
      <Label>{label}</Label>
      {opts ? (
        <select style={inp} value={form[key]} onChange={e=>set(key,e.target.value)}>
          {opts.map(o=><option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={type} style={inp} value={form[key]}
          onChange={e=>set(key,key==="containerNumber"?e.target.value.toUpperCase():e.target.value)}
          placeholder={ph} />
      )}
    </div>
  );
  return (
    <div>
      <div style={row}>
        <div>{field("Container Number","containerNumber","text","e.g. TCNU8484777")}</div>
        <div>{field("Account / Client","account","text","e.g. CAVA, TFK")}</div>
        <div>{field("Shipping Line / Carrier","carrier","text","e.g. Maersk, MSC")}</div>
        <div>{field("ETA to Port","eta","date")}</div>
        <div>{field("Port of Arrival","port","text","e.g. Long Beach, Charleston")}</div>
        <div>{field("Final Destination","destination","text","Warehouse or distributor address")}</div>
        <div>{field("Distributor (if applicable)","distributor","text")}</div>
        <div>{field("Status","status","text","",STATUSES)}</div>
        <div>{field("Trucker — Port to Warehouse","truckerWarehouse")}</div>
        <div>{field("Trucker — Port to Distributor","truckerDistributor")}</div>
        <div>{field("Customs Status","customsStatus","text","",["Pending","In Progress","Cleared","Hold"])}</div>
        <div>{field("Document Status","docStatus","text","",["Incomplete","In Progress","Complete"])}</div>
        <div>{field("Pickup Status","pickupStatus","text","",["Not Scheduled","Scheduled","Completed"])}</div>
        <div>{field("Delivery Status","deliveryStatus","text","",["Pending","In Transit","Delivered"])}</div>
      </div>
      <div style={{ marginBottom:14 }}>
        <Label>Required Documents</Label>
        <input style={inp} value={form.requiredDocs} onChange={e=>set("requiredDocs",e.target.value)} placeholder="e.g. BL, Commercial Invoice, Packing List" />
      </div>
      <div style={{ marginBottom:20 }}>
        <Label>Notes / Risks / Next Actions</Label>
        <textarea style={{...inp,minHeight:80,resize:"vertical"}} value={form.notes} onChange={e=>set("notes",e.target.value)} />
      </div>
      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",borderTop:`1px solid ${G.border}`,paddingTop:16 }}>
        <button onClick={onClose} style={btnSecondary}>Cancel</button>
        <button onClick={handleSave} disabled={saving} style={{...btnPrimary,opacity:saving?0.6:1,cursor:saving?"not-allowed":"pointer"}}>
          {saving?"Saving…":"Save Container"}
        </button>
      </div>
    </div>
  );
}

function EmailPreview({container,recipientEmail,onClose,onSend,sending}) {
  const missing=getMissing(container);
  const risks=getRisks(container);
  const subject=`[Action Required] Container ${container.containerNumber} — Arriving ${container.eta||"TBD"}`;
  const body=`Hi Team,

Container ${container.containerNumber} is arriving${container.eta?` on ${container.eta}`:" soon"} at ${container.port||"[Port TBD]"}.

Please confirm the following before arrival:

1. Assigned Trucker: ${container.truckerWarehouse||container.truckerDistributor||"⚠ NOT ASSIGNED"}
2. Final Destination: ${container.destination||"⚠ NOT CONFIRMED"}
3. Moving to: ${container.distributor?`Distributor — ${container.distributor}`:"Warehouse"}
4. Customs Status: ${container.customsStatus}
5. Document Status: ${container.docStatus}${container.requiredDocs?` (${container.requiredDocs})`:""}
6. Pickup Scheduled: ${container.pickupStatus}
${missing.length>0?`\nMissing Information:\n${missing.map(m=>`  • ${m}`).join("\n")}`:""}
${risks.length>0?`\nRisks Identified:\n${risks.map(r=>`  ⚠ ${r}`).join("\n")}`:""}

Please confirm or update the above by end of day.

— Source One Global | Container Control Tower`;
  return (
    <div>
      <div style={{ marginBottom:12 }}>
        <Label>To</Label>
        <div style={{ fontSize:13,color:G.text,padding:"6px 0" }}>{recipientEmail||"[configure in Settings]"}</div>
      </div>
      <div style={{ marginBottom:12 }}>
        <Label>Subject</Label>
        <div style={{ fontSize:13,fontWeight:500,color:G.text,padding:"6px 0" }}>{subject}</div>
      </div>
      <div style={{ marginBottom:20 }}>
        <Label>Body</Label>
        <pre style={{ fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap",background:G.surface2,
          padding:14,borderRadius:6,border:`1px solid ${G.border}`,
          fontFamily:"'SF Mono','Fira Code',monospace",color:G.textMuted,
          maxHeight:280,overflowY:"auto",margin:0,marginTop:6 }}>{body}</pre>
      </div>
      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",borderTop:`1px solid ${G.border}`,paddingTop:16 }}>
        <button onClick={onClose} style={btnSecondary}>Cancel</button>
        <button onClick={()=>onSend(subject,body)} disabled={sending}
          style={{...btnPrimary,background:"#4a9eff",color:"#fff",opacity:sending?0.6:1,cursor:sending?"not-allowed":"pointer"}}>
          {sending?"Sending…":"Send via Gmail"}
        </button>
      </div>
    </div>
  );
}

function ImportModal({onImport,onClose}) {
  const [text,setText]=useState("");
  const [error,setError]=useState("");
  const handle=()=>{
    try {
      const rows=text.trim().split("\n").filter(Boolean);
      const out=rows.map((row,i)=>{
        const p=row.split(",").map(s=>s.trim());
        if(!p[0]) throw new Error(`Row ${i+1}: missing container number`);
        return {...EMPTY,containerNumber:p[0].toUpperCase(),carrier:p[1]||"",eta:p[2]||"",port:p[3]||"",destination:p[4]||"",account:p[5]||"",status:"On Water"};
      });
      onImport(out);
    } catch(e){setError(e.message);}
  };
  return (
    <div>
      <p style={{ fontSize:13,color:G.textMuted,marginTop:0,lineHeight:1.6 }}>
        One container per line — CSV format:<br/>
        <code style={{ fontSize:11,color:G.blue,background:G.surface2,padding:"2px 6px",borderRadius:3 }}>ContainerNo, Carrier, ETA (YYYY-MM-DD), Port, Destination, Account</code>
      </p>
      <textarea style={{...inp,minHeight:180,resize:"vertical",fontFamily:"'SF Mono','Fira Code',monospace",fontSize:12}}
        value={text} onChange={e=>{setText(e.target.value);setError("");}}
        placeholder={"TCNU8484777, Maersk, 2025-06-15, Long Beach, LA Warehouse, CAVA\nMSCU1234567, MSC, 2025-06-20, Charleston, NYC Dist, TFK"} />
      {error&&<p style={{color:G.red,fontSize:12,marginTop:4}}>⚠ {error}</p>}
      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",marginTop:16,borderTop:`1px solid ${G.border}`,paddingTop:16 }}>
        <button onClick={onClose} style={btnSecondary}>Cancel</button>
        <button onClick={handle} style={{...btnPrimary,background:G.blue,color:"#fff"}}>Import</button>
      </div>
    </div>
  );
}

function SettingsModal({settings,onSave,onClose}) {
  const [form,setForm]=useState({...settings});
  return (
    <div>
      <div style={{ marginBottom:14 }}>
        <Label>Alert Recipient Email(s) — comma separated</Label>
        <input style={inp} value={form.alertEmail||""} onChange={e=>setForm(f=>({...f,alertEmail:e.target.value}))} placeholder="ops@sourceone.global, manager@sourceone.global" />
      </div>
      <div style={{ marginBottom:20 }}>
        <Label>Team / Company Name</Label>
        <input style={inp} value={form.teamName||""} onChange={e=>setForm(f=>({...f,teamName:e.target.value}))} placeholder="Source One Global" />
      </div>
      <div style={{ display:"flex",gap:10,justifyContent:"flex-end",borderTop:`1px solid ${G.border}`,paddingTop:16 }}>
        <button onClick={onClose} style={btnSecondary}>Cancel</button>
        <button onClick={()=>onSave(form)} style={btnPrimary}>Save Settings</button>
      </div>
    </div>
  );
}

const SETTINGS_KEY="cct_settings_v2";

export default function App() {
  const [containers,setContainers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [dbError,setDbError]=useState(null);
  const [settings,setSettings]=useState({alertEmail:"",teamName:"Source One Global"});
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState("All");
  const [filterAccount,setFilterAccount]=useState("All");
  const [sortKey,setSortKey]=useState("eta");
  const [sortDir,setSortDir]=useState("asc");
  const [editContainer,setEditContainer]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [emailTarget,setEmailTarget]=useState(null);
  const [emailSending,setEmailSending]=useState(false);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState(null);
  const [lastRefresh,setLastRefresh]=useState(null);

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  const loadContainers=useCallback(async()=>{
    try{
      setDbError(null);
      const data=await api("/containers?order=eta.asc.nullslast&limit=2000");
      setContainers((data||[]).map(dbToLocal));
      setLastRefresh(new Date());
    }catch(e){setDbError(e.message);}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{
    loadContainers();
    const iv=setInterval(loadContainers,30000);
    return()=>clearInterval(iv);
  },[loadContainers]);

  useEffect(()=>{
    try{const r=localStorage.getItem(SETTINGS_KEY);if(r)setSettings(JSON.parse(r));}catch{}
  },[]);

  const saveSettings=(s)=>{
    setSettings(s);
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(s));}catch{}
    setShowSettings(false);
    showToast("Settings saved.");
  };

  const saveContainer=async(c)=>{
    setSaving(true);
    try{
      const existing=containers.find(x=>x.containerNumber===c.containerNumber);
      if(existing){
        const updated=await api(`/containers?container_number=eq.${c.containerNumber}`,"PATCH",localToDb(c));
        setContainers(prev=>prev.map(x=>x.containerNumber===c.containerNumber?dbToLocal((updated||[])[0]||{...localToDb(c),container_number:c.containerNumber}):x));
        showToast(`${c.containerNumber} updated.`);
      }else{
        const created=await api("/containers","POST",{...localToDb(c),created_at:new Date().toISOString()});
        setContainers(prev=>[...prev,dbToLocal((created||[])[0]||{...localToDb(c),container_number:c.containerNumber})]);
        showToast(`${c.containerNumber} added.`);
      }
      setShowAdd(false);setEditContainer(null);
    }catch(e){showToast(`Save failed: ${e.message}`,"danger");}
    setSaving(false);
  };

  const deleteContainer=async(num)=>{
    if(!window.confirm(`Delete ${num}? This cannot be undone.`)) return;
    try{
      await api(`/containers?container_number=eq.${num}`,"DELETE");
      setContainers(prev=>prev.filter(c=>c.containerNumber!==num));
      showToast(`${num} deleted.`,"danger");
    }catch(e){showToast(`Delete failed: ${e.message}`,"danger");}
  };

  const importContainers=async(newOnes)=>{
    setSaving(true);
    let added=0,updated=0,failed=0;
    for(const c of newOnes){
      try{
        const existing=containers.find(x=>x.containerNumber===c.containerNumber);
        if(existing){await api(`/containers?container_number=eq.${c.containerNumber}`,"PATCH",localToDb(c));updated++;}
        else{await api("/containers","POST",{...localToDb(c),created_at:new Date().toISOString()});added++;}
      }catch{failed++;}
    }
    await loadContainers();
    setShowImport(false);
    showToast(`Import done: ${added} added, ${updated} updated${failed>0?`, ${failed} failed`:""}.`);
    setSaving(false);
  };

  const sendEmail=async(container,subject,body)=>{
    setEmailSending(true);
    try{
      const response=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:1000,
          messages:[{role:"user",content:`Send an email via Gmail:\nTo: ${settings.alertEmail}\nSubject: ${subject}\nBody: ${body}`}],
          mcp_servers:[{type:"url",url:"https://gmailmcp.googleapis.com/mcp/v1",name:"gmail-mcp"}]
        })
      });
      const data=await response.json();
      const txt=(data.content||[]).map(b=>b.text||"").join(" ");
      if(txt.toLowerCase().includes("sent")||txt.toLowerCase().includes("success")||(data.content||[]).some(b=>b.type==="mcp_tool_result")){
        await api(`/containers?container_number=eq.${container.containerNumber}`,"PATCH",{alert_sent:true,updated_at:new Date().toISOString()});
        setContainers(prev=>prev.map(c=>c.containerNumber===container.containerNumber?{...c,alertSent:true}:c));
        showToast(`Alert sent for ${container.containerNumber}`);
        setEmailTarget(null);
      }else{showToast("Email may not have sent — check Gmail connection.","warning");}
    }catch(e){showToast("Email failed. Check Gmail MCP.","danger");}
    setEmailSending(false);
  };

  const alertsDue=containers.filter(c=>{
    if(!c.eta||c.alertSent||["Delivered","Closed"].includes(c.status)) return false;
    const rem=getReminderDate(c.eta);
    return rem&&new Date()>=rem;
  });

  const accounts=["All",...Array.from(new Set(containers.map(c=>c.account).filter(Boolean))).sort()];

  const filtered=containers.filter(c=>{
    const s=search.toLowerCase();
    const ms=!s||[c.containerNumber,c.destination,c.carrier,c.port,c.account,c.distributor].some(v=>(v||"").toLowerCase().includes(s));
    return ms&&(filterStatus==="All"||c.status===filterStatus)&&(filterAccount==="All"||c.account===filterAccount);
  }).sort((a,b)=>{
    let av=a[sortKey]||"",bv=b[sortKey]||"";
    if(sortKey==="eta"){av=av||"9999";bv=bv||"9999";}
    const r=av<bv?-1:av>bv?1:0;
    return sortDir==="asc"?r:-r;
  });

  const stats=[
    {label:"Total",value:containers.length,color:G.text},
    {label:"On Water",value:containers.filter(c=>c.status==="On Water").length,color:G.blue},
    {label:"Arriving ≤7 Days",value:containers.filter(c=>isWithin7Days(c.eta)&&!["Delivered","Closed"].includes(c.status)).length,color:G.amber},
    {label:"Customs Pending",value:containers.filter(c=>c.customsStatus==="Pending"&&!["Delivered","Closed"].includes(c.status)).length,color:G.amber},
    {label:"Missing Trucker",value:containers.filter(c=>!c.truckerWarehouse&&!c.truckerDistributor&&!["Delivered","Closed"].includes(c.status)).length,color:G.red},
    {label:"At Risk",value:containers.filter(c=>getRisks(c).length>0).length,color:G.red},
    {label:"Delivered",value:containers.filter(c=>c.status==="Delivered").length,color:G.green},
    {label:"Issues / Hold",value:containers.filter(c=>c.status==="Issue / Hold").length,color:G.red},
  ];

  const SortBtn=({k,label})=>(
    <button onClick={()=>{if(sortKey===k)setSortDir(d=>d==="asc"?"desc":"asc");else{setSortKey(k);setSortDir("asc");}}}
      style={{background:"none",border:"none",cursor:"pointer",fontSize:11,
        fontWeight:sortKey===k?600:400,
        color:sortKey===k?G.text:G.textDim,
        padding:"0 2px",whiteSpace:"nowrap",letterSpacing:"0.04em",textTransform:"uppercase",fontFamily:"inherit"}}>
      {label}{sortKey===k?(sortDir==="asc"?" ↑":" ↓"):""}
    </button>
  );

  const th={padding:"10px 12px",fontSize:10,color:G.textDim,fontWeight:600,textAlign:"left",
    borderBottom:`1px solid ${G.border}`,whiteSpace:"nowrap",
    letterSpacing:"0.06em",textTransform:"uppercase"};
  const td={padding:"12px 12px",fontSize:12,borderBottom:`1px solid ${G.border}`,verticalAlign:"top",color:G.text};

  return (
    <div style={{fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      color:G.text,minHeight:"100vh",background:G.bg}}>
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        ::placeholder{color:#444!important}
        select option{background:#1a1a1a;color:#fff}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1);opacity:0.4}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#111}
        ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
        input:focus,select:focus,textarea:focus{outline:none;border-color:#555!important}
        tr:hover td{background:rgba(255,255,255,0.02)}
      `}</style>

      {/* Header */}
      <div style={{background:G.surface,borderBottom:`1px solid ${G.border}`,
        padding:"0 24px",display:"flex",alignItems:"center",gap:14,height:56,
        position:"sticky",top:0,zIndex:100}}>
        {/* Logo mark */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginRight:8}}>
          <div style={{width:28,height:28,background:G.text,borderRadius:4,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="4" width="14" height="9" rx="1.5" stroke="#0a0a0a" strokeWidth="1.5"/>
              <path d="M4 4V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1" stroke="#0a0a0a" strokeWidth="1.5"/>
              <path d="M1 8h14" stroke="#0a0a0a" strokeWidth="1.5"/>
              <circle cx="8" cy="8" r="1" fill="#0a0a0a"/>
            </svg>
          </div>
          <div>
            <div style={{fontSize:13,fontWeight:700,letterSpacing:"0.04em",lineHeight:1.1}}>SOURCE ONE</div>
            <div style={{fontSize:9,color:G.textDim,letterSpacing:"0.12em",textTransform:"uppercase",lineHeight:1.1}}>Control Tower</div>
          </div>
        </div>

        <div style={{width:1,height:24,background:G.border,margin:"0 4px"}}></div>

        <span style={{fontSize:12,color:G.textDim}}>{containers.length.toLocaleString()} containers</span>
        <div style={{display:"flex",alignItems:"center",gap:5}}>
          <span style={{width:6,height:6,borderRadius:"50%",background:G.green,display:"inline-block"}}></span>
          <span style={{fontSize:11,color:G.green,letterSpacing:"0.02em"}}>Live</span>
        </div>
        {lastRefresh&&<span style={{fontSize:11,color:G.textDim}}>↻ {lastRefresh.toLocaleTimeString()}</span>}

        <div style={{flex:1}}/>

        {alertsDue.length>0&&(
          <span style={{background:"rgba(248,113,113,0.12)",color:G.red,fontSize:11,
            padding:"4px 10px",borderRadius:4,fontWeight:500,border:"1px solid rgba(248,113,113,0.2)"}}>
            ⚠ {alertsDue.length} alert{alertsDue.length>1?"s":""} due
          </span>
        )}
        <button onClick={loadContainers} style={{...btnSecondary,padding:"6px 10px"}} title="Refresh">↻</button>
        <button onClick={()=>setShowImport(true)} style={{...btnSecondary,padding:"6px 12px",display:"flex",alignItems:"center",gap:6}}>
          ↑ Import CSV
        </button>
        <button onClick={()=>setShowAdd(true)} style={btnPrimary}>+ Add Container</button>
        <button onClick={()=>setShowSettings(true)} style={{...btnSecondary,padding:"6px 10px",fontSize:15}}>⚙</button>
      </div>

      {/* DB Error */}
      {dbError&&(
        <div style={{background:"rgba(248,113,113,0.08)",borderBottom:`1px solid rgba(248,113,113,0.2)`,
          padding:"10px 24px",fontSize:12,color:G.red}}>
          ⚠ Database error: {dbError} —{" "}
          <button onClick={loadContainers} style={{background:"none",border:"none",color:G.red,
            cursor:"pointer",textDecoration:"underline",fontSize:12,padding:0}}>retry</button>
        </div>
      )}

      {/* Alert Banner */}
      {alertsDue.length>0&&(
        <div style={{background:"rgba(240,165,0,0.06)",borderBottom:`1px solid rgba(240,165,0,0.15)`,padding:"12px 24px"}}>
          <p style={{margin:"0 0 8px",fontSize:12,color:G.amber,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>
            7-day alerts due
          </p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {alertsDue.map(c=>(
              <button key={c.containerNumber} onClick={()=>setEmailTarget(c)}
                style={{...btnSecondary,borderColor:"rgba(240,165,0,0.3)",color:G.amber,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
                ✉ {c.containerNumber} — ETA {c.eta}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{padding:"20px 24px 0",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:12}}>
        {stats.map(s=>(
          <div key={s.label} style={{background:G.surface,border:`1px solid ${G.border}`,borderRadius:8,padding:"14px 16px",
            borderTop:`2px solid ${s.value>0&&s.color!==G.text?s.color:G.border}`}}>
            <div style={{fontSize:10,color:G.textDim,marginBottom:6,letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:500}}>{s.label}</div>
            <div style={{fontSize:26,fontWeight:700,color:s.value>0?s.color:G.textDim,letterSpacing:"-0.02em"}}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{padding:"16px 24px",display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:G.textDim,fontSize:13,pointerEvents:"none"}}>⌕</span>
          <input style={{...inp,width:240,paddingLeft:28}} placeholder="Search container, port, destination…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select style={{...inp,width:180}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="All">All statuses</option>
          {STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <select style={{...inp,width:140}} value={filterAccount} onChange={e=>setFilterAccount(e.target.value)}>
          {accounts.map(a=><option key={a}>{a}</option>)}
        </select>
        <span style={{fontSize:11,color:G.textDim,marginLeft:"auto",letterSpacing:"0.04em"}}>
          {filtered.length.toLocaleString()} / {containers.length.toLocaleString()} containers
        </span>
      </div>

      {/* Table */}
      <div style={{padding:"0 24px 40px",overflowX:"auto"}}>
        {loading?(
          <div style={{textAlign:"center",padding:"80px 0",color:G.textDim}}>
            <div style={{fontSize:28,display:"block",marginBottom:12,animation:"spin 1s linear infinite",display:"inline-block"}}>⟳</div>
            <p style={{fontSize:13,marginTop:12,letterSpacing:"0.04em"}}>Connecting to database…</p>
          </div>
        ):containers.length===0&&!dbError?(
          <div style={{textAlign:"center",padding:"80px 0",color:G.textDim}}>
            <div style={{fontSize:48,marginBottom:16,opacity:0.3}}>▦</div>
            <p style={{fontSize:14,marginBottom:4}}>No containers tracked yet.</p>
            <p style={{fontSize:12,color:G.textDim,marginBottom:20}}>Add your first container or import a CSV to get started.</p>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={()=>setShowAdd(true)} style={btnPrimary}>Add Container</button>
              <button onClick={()=>setShowImport(true)} style={btnSecondary}>Import CSV</button>
            </div>
          </div>
        ):(
          <div style={{background:G.surface,borderRadius:8,border:`1px solid ${G.border}`,overflow:"hidden"}}>
            <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",minWidth:980}}>
              <colgroup>
                <col style={{width:135}}/><col style={{width:80}}/><col style={{width:95}}/>
                <col style={{width:95}}/><col style={{width:150}}/><col style={{width:160}}/>
                <col style={{width:80}}/><col style={{width:80}}/><col style={{width:90}}/><col style={{width:130}}/>
              </colgroup>
              <thead>
                <tr style={{background:G.surface2}}>
                  <th style={th}><SortBtn k="containerNumber" label="Container" /></th>
                  <th style={th}><SortBtn k="account" label="Account" /></th>
                  <th style={th}><SortBtn k="eta" label="ETA" /></th>
                  <th style={th}><SortBtn k="port" label="Port" /></th>
                  <th style={th}><SortBtn k="destination" label="Destination" /></th>
                  <th style={th}><SortBtn k="status" label="Status" /></th>
                  <th style={th}>Customs</th>
                  <th style={th}>Docs</th>
                  <th style={th}>Trucker</th>
                  <th style={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c=>{
                  const missing=getMissing(c);
                  const risks=getRisks(c);
                  const arriving=isWithin7Days(c.eta);
                  const overdue=isOverdue(c.eta)&&!["Delivered","Closed"].includes(c.status);
                  return (
                    <tr key={c.containerNumber}>
                      <td style={td}>
                        <span style={{fontWeight:600,fontSize:12,fontFamily:"'SF Mono','Fira Code',monospace",
                          letterSpacing:"0.04em",color:G.text}}>{c.containerNumber}</span>
                        {arriving&&!overdue&&<div style={{fontSize:10,color:G.amber,marginTop:3,display:"flex",alignItems:"center",gap:3}}>
                          <span style={{width:4,height:4,borderRadius:"50%",background:G.amber,display:"inline-block"}}></span> Arriving soon
                        </div>}
                        {overdue&&<div style={{fontSize:10,color:G.red,marginTop:3,display:"flex",alignItems:"center",gap:3}}>
                          <span style={{width:4,height:4,borderRadius:"50%",background:G.red,display:"inline-block"}}></span> ETA passed
                        </div>}
                        {c.alertSent&&<div style={{fontSize:10,color:G.green,marginTop:2}}>✓ Alert sent</div>}
                      </td>
                      <td style={{...td}}>
                        {c.account
                          ?<span style={{fontSize:11,background:G.surface2,color:G.textMuted,
                            padding:"2px 7px",borderRadius:3,border:`1px solid ${G.border}`,
                            fontWeight:500,letterSpacing:"0.03em"}}>{c.account}</span>
                          :<span style={{color:G.textDim,fontSize:11}}>—</span>}
                      </td>
                      <td style={td}>
                        <span style={{fontSize:12,color:c.eta?G.text:G.red,fontFamily:"'SF Mono','Fira Code',monospace"}}>
                          {c.eta||"Missing"}
                        </span>
                        {c.eta&&<div style={{fontSize:10,color:G.textDim,marginTop:2}}>
                          ↻ {getReminderDate(c.eta)?.toLocaleDateString()||"—"}
                        </div>}
                      </td>
                      <td style={{...td,color:c.port?G.text:G.red,fontSize:12}}>{c.port||"Missing"}</td>
                      <td style={{...td,wordBreak:"break-word",fontSize:12,color:c.destination?G.text:G.red}}>
                        {c.destination||"Missing"}
                      </td>
                      <td style={td}><StatusBadge label={c.status}/></td>
                      <td style={td}>
                        <span style={{fontSize:11,color:c.customsStatus==="Cleared"?G.green:c.customsStatus==="Hold"?G.red:G.amber}}>
                          {c.customsStatus}
                        </span>
                      </td>
                      <td style={td}>
                        <span style={{fontSize:11,color:c.docStatus==="Complete"?G.green:c.docStatus==="In Progress"?G.amber:G.red}}>
                          {c.docStatus}
                        </span>
                      </td>
                      <td style={td}>
                        {(c.truckerWarehouse||c.truckerDistributor)
                          ?<span style={{fontSize:11,color:G.textMuted}}>{c.truckerWarehouse||c.truckerDistributor}</span>
                          :<span style={{fontSize:11,color:G.red}}>⚠ None</span>}
                      </td>
                      <td style={td}>
                        <div style={{display:"flex",gap:5,marginBottom:missing.length||risks.length?6:0}}>
                          <button onClick={()=>setEditContainer(c)}
                            style={{padding:"3px 9px",borderRadius:4,border:`1px solid ${G.border2}`,
                              background:"transparent",cursor:"pointer",fontSize:11,color:G.textMuted,fontFamily:"inherit"}}>Edit</button>
                          <button onClick={()=>setEmailTarget(c)} title="Send alert email"
                            style={{padding:"3px 8px",borderRadius:4,border:`1px solid ${G.border2}`,
                              background:"transparent",cursor:"pointer",fontSize:12,color:G.blue}}>✉</button>
                          <button onClick={()=>deleteContainer(c.containerNumber)} title="Delete"
                            style={{padding:"3px 8px",borderRadius:4,border:`1px solid ${G.border2}`,
                              background:"transparent",cursor:"pointer",fontSize:12,color:G.red}}>✕</button>
                        </div>
                        {missing.slice(0,2).map(m=>(
                          <span key={m} style={{display:"inline-block",background:"rgba(240,165,0,0.08)",
                            color:G.amber,fontSize:10,padding:"1px 6px",borderRadius:3,marginRight:3,marginBottom:2,
                            border:"1px solid rgba(240,165,0,0.15)"}}>✗ {m}</span>
                        ))}
                        {missing.length>2&&<span style={{fontSize:10,color:G.textDim}}>+{missing.length-2}</span>}
                        {risks.slice(0,1).map(r=>(
                          <span key={r} style={{display:"block",background:"rgba(248,113,113,0.08)",
                            color:G.red,fontSize:10,padding:"1px 6px",borderRadius:3,marginTop:2,
                            border:"1px solid rgba(248,113,113,0.15)"}}>⚠ {r}</span>
                        ))}
                        {risks.length>1&&<span style={{fontSize:10,color:G.red}}>+{risks.length-1} more</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd&&<Modal title="Add Container" onClose={()=>setShowAdd(false)}><ContainerForm initial={{}} onSave={saveContainer} onClose={()=>setShowAdd(false)} saving={saving}/></Modal>}
      {editContainer&&<Modal title={`Edit — ${editContainer.containerNumber}`} onClose={()=>setEditContainer(null)}><ContainerForm initial={editContainer} onSave={saveContainer} onClose={()=>setEditContainer(null)} saving={saving}/></Modal>}
      {emailTarget&&<Modal title={`Alert Email — ${emailTarget.containerNumber}`} onClose={()=>setEmailTarget(null)}><EmailPreview container={emailTarget} recipientEmail={settings.alertEmail} onClose={()=>setEmailTarget(null)} onSend={(s,b)=>sendEmail(emailTarget,s,b)} sending={emailSending}/></Modal>}
      {showSettings&&<Modal title="Settings" onClose={()=>setShowSettings(false)}><SettingsModal settings={settings} onSave={saveSettings} onClose={()=>setShowSettings(false)}/></Modal>}
      {showImport&&<Modal title="Import Containers" onClose={()=>setShowImport(false)}><ImportModal onImport={importContainers} onClose={()=>setShowImport(false)}/></Modal>}

      {toast&&(
        <div style={{position:"fixed",bottom:24,right:24,zIndex:2000,
          background:toast.type==="danger"?"rgba(248,113,113,0.12)":toast.type==="warning"?"rgba(240,165,0,0.12)":"rgba(62,207,142,0.12)",
          color:toast.type==="danger"?G.red:toast.type==="warning"?G.amber:G.green,
          padding:"12px 20px",borderRadius:8,fontSize:13,fontWeight:500,
          border:`1px solid ${toast.type==="danger"?"rgba(248,113,113,0.25)":toast.type==="warning"?"rgba(240,165,0,0.25)":"rgba(62,207,142,0.25)"}`,
          backdropFilter:"blur(8px)",maxWidth:340}}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
