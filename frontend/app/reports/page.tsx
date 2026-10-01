"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, type IrrigationRecord, type SensorReading } from "@/lib/api";
import styles from "../data-page.module.css";
type Field = { field_id:number; name:string; area:number|string; crop_name:string|null; growth_stage:string|null; soil_type:string|null };
const cell=(value:unknown)=>`"${String(value??"").replaceAll('"','""')}"`;
export default function ReportsPage(){
 const [fields,setFields]=useState<Field[]>([]); const [fieldId,setFieldId]=useState(""); const [sensors,setSensors]=useState<SensorReading[]>([]); const [irrigation,setIrrigation]=useState<IrrigationRecord[]>([]); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
 useEffect(()=>{apiGet<Field[]>("/api/fields").then((data)=>{setFields(data); if(data.length)setFieldId(String(data[0].field_id));}).catch((e:unknown)=>setError(e instanceof Error?e.message:"Could not load fields."));},[]);
 useEffect(()=>{if(!fieldId)return;let live=true;setLoading(true);Promise.all([apiGet<SensorReading[]>(`/api/sensor/history/${fieldId}`),apiGet<IrrigationRecord[]>(`/api/irrigation/history/${fieldId}`)]).then(([s,i])=>{if(live){setSensors(s);setIrrigation(i);setError("");}}).catch((e:unknown)=>{if(live)setError(e instanceof Error?e.message:"Could not load report data.");}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[fieldId]);
 const field=fields.find((x)=>String(x.field_id)===fieldId);
 function exportCsv(){if(!field)return;const rows=[...[ ["record_type","timestamp","soil_moisture","need","irrigation_required","water_litres","reason"], ...sensors.map((x)=>["sensor",x.timestamp,x.soil_moisture,"","","",""]), ...irrigation.map((x)=>["irrigation",x.created_at,"",x.irrigation_need,x.irrigation_required,x.water_quantity_litres,x.reason]) ]];const blob=new Blob([rows.map((row)=>row.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`field-${field.field_id}-irrigation-report.csv`;a.click();URL.revokeObjectURL(url);}
 return <main className={styles.page}><header className={styles.header}><Link href="/">← Dashboard</Link><h1>Farm reports</h1><label>Field<select value={fieldId} onChange={(e)=>setFieldId(e.target.value)}>{fields.map((f)=><option value={f.field_id} key={f.field_id}>{f.name} · #{f.field_id}</option>)}</select></label></header>
 {error&&<p className={styles.error} role="alert">{error}</p>}{loading&&<p className={styles.notice}>Loading actual field data…</p>}
 {field&&<article className={`${styles.card} ${styles.printReport}`}><p>FieldWise · Farmer report</p><h2>{field.name}</h2><p>Field #{field.field_id} · {field.area} hectares · {field.crop_name||"Crop not recorded"} · {field.growth_stage||"Growth stage not recorded"}</p><p>Sensor observations: {sensors.length} · Irrigation recommendations: {irrigation.length}</p><h3>Recent soil moisture observations</h3>{sensors.slice(0,20).map((x,i)=><p key={`${x.timestamp}-${i}`}>{new Date(x.timestamp).toLocaleString()} — {Number(x.soil_moisture).toFixed(1)}%</p>)}{!sensors.length&&<p>No sensor readings recorded.</p>}<h3>Irrigation recommendations</h3>{irrigation.slice(0,20).map((x)=><p key={x.schedule_id}>{new Date(x.created_at).toLocaleString()} — {x.irrigation_need}; {x.irrigation_required?"required":"not required"}; {Number(x.water_quantity_litres||0).toLocaleString()} L</p>)}{!irrigation.length&&<p>No irrigation recommendations recorded.</p>}</article>}
 {field&&<div className={styles.actions}><button type="button" onClick={exportCsv}>Download CSV</button><button type="button" onClick={()=>window.print()}>Print / Save as PDF</button></div>}
 </main>;
}
