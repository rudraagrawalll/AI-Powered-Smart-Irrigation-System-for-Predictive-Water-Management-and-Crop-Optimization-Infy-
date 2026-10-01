export const EXPRESS_API = "";
export const FASTAPI_API = process.env.NEXT_PUBLIC_FASTAPI_API ?? "http://localhost:8000";
export type SensorReading = { sensor_id: string; field_id: number; soil_moisture: number | string; timestamp: string };
export type IrrigationRecord = { schedule_id: number; field_id: number; irrigation_need: string; confidence: number | string | null; water_depth_mm: number | string | null; water_quantity_litres: number | string | null; irrigation_required: boolean; recommended_time: string | null; frequency: string | null; overwatering_prevented: boolean; reason: string | null; created_at: string };
export type FieldAnalytics = { field_id: number; sensor: { reading_count: number; average_soil_moisture: number | null; minimum_soil_moisture: number | null; maximum_soil_moisture: number | null }; irrigation: { irrigation_count: number; total_water_litres: number | string } };
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${EXPRESS_API}${path}`, { cache: "no-store", signal, credentials: "include" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? body.detail ?? `Request failed (${response.status})`);
  return body as T;
}

export type WeatherReading = { temperature: number|string|null; humidity: number|string|null; rainfall: number|string|null; wind_speed_kmh: number|string|null; forecast: string|null; timestamp: string };
