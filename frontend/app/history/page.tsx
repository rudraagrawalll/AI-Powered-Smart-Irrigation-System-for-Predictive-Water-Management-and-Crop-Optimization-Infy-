"use client";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { apiGet, type IrrigationRecord, type SensorReading, type WeatherReading } from "@/lib/api";
import styles from "../data-page.module.css";
export default function HistoryPage() {
  const [fieldId, setFieldId] = useState("1");
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [irrigation, setIrrigation] = useState<IrrigationRecord[]>([]);
  const [weather, setWeather] = useState<WeatherReading[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let live = true; setLoading(true); setError(""); Promise.all([apiGet<SensorReading[]>(`/api/sensor/history/${fieldId}`), apiGet<IrrigationRecord[]>(`/api/irrigation/history/${fieldId}`), apiGet<WeatherReading[]>(`/api/weather/history/${fieldId}`)]).then(([s, i, w]) => { if (live) { setSensors(s); setIrrigation(i); setWeather(w); } }).catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : "Could not load history."); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [fieldId]);
  const chart = [...sensors].reverse().map((reading) => ({ time: new Date(reading.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), moisture: Number(reading.soil_moisture) }));
  return <main className={styles.page}><header className={styles.header}><Link href="/">← Dashboard</Link><h1>Field history</h1><label>Field ID <input type="number" min="1" value={fieldId} onChange={(e) => setFieldId(e.target.value)} /></label></header>
    {loading && <p className={styles.notice}>Loading field history…</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    {!loading && !error && <><section className={styles.card}><h2>Soil moisture trend</h2>{chart.length ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><LineChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="time" minTickGap={24} /><YAxis domain={[0, 100]} unit="%" /><Tooltip /><Line dataKey="moisture" name="Soil moisture" stroke="#268047" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div> : <p>No sensor readings recorded for this field yet.</p>}</section>
    <section className={styles.card}><h2>Weather and rainfall trend</h2>{weather.length ? <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><LineChart data={[...weather].reverse().map((item)=>({time:new Date(item.timestamp).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit"}), rainfall:item.rainfall==null?null:Number(item.rainfall), temperature:item.temperature==null?null:Number(item.temperature)}))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="time" minTickGap={24}/><YAxis yAxisId="left" unit="mm"/><YAxis yAxisId="right" orientation="right" unit="°C"/><Tooltip/><Line yAxisId="left" dataKey="rainfall" name="Rainfall" stroke="#3182ce" strokeWidth={2} connectNulls/><Line yAxisId="right" dataKey="temperature" name="Temperature" stroke="#ef8b39" strokeWidth={2} connectNulls/></LineChart></ResponsiveContainer></div> : <p>No saved weather observations are available for this field.</p>}</section>
    <section className={styles.card}><h2>Recent sensor readings</h2>{sensors.length ? <div className={styles.list}>{sensors.map((item, n) => <article className={styles.row} key={`${item.sensor_id}-${item.timestamp}-${n}`}><div><strong>{Number(item.soil_moisture).toFixed(1)}% moisture</strong><small>{item.sensor_id}</small></div><time>{new Date(item.timestamp).toLocaleString()}</time></article>)}</div> : <p>No sensor readings yet. Confirm the field has an installed sensor.</p>}</section>
    <section className={styles.card}><h2>Irrigation history</h2>{irrigation.length ? <div className={styles.list}>{irrigation.map((item) => <article className={styles.row} key={item.schedule_id}><div><strong>{item.irrigation_need} need · {item.irrigation_required ? "Scheduled" : "Not required"}</strong><small>{item.reason ?? "Recommendation saved"}</small></div><div className={styles.right}><b>{Number(item.water_quantity_litres ?? 0).toLocaleString()} L</b><time>{new Date(item.created_at).toLocaleString()}</time></div></article>)}</div> : <p>No irrigation recommendations have been saved for this field.</p>}</section></>}
  </main>;
}
