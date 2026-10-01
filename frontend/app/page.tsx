"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSession, type Farmer } from "@/lib/auth";
import { enableWebPush } from "@/lib/push";
import { classifyVoiceQuery, speak } from "@/lib/voice";
import { requestBrowserNotifications } from "@/lib/notifications";

/* ============================================================
   TYPES
============================================================ */

type Field = {
  field_id: number;
  farmer_id: number;
  name: string;
  latitude: string;
  longitude: string;
  area: string;

  soil_type: string | null;
  soil_ph: string | null;
  organic_carbon: string | null;

  irrigation_type: string | null;
  water_source: string | null;
  mulching_used: string | null;
  electrical_conductivity: string | number | null;
  sunlight_hours: string | number | null;
  region: string | null;

  created_at: string;

  crop_id: number | null;
  crop_name: string | null;
  growth_stage: string | null;
  planting_date: string | null;
};

type SensorData = {
  sensor_id: string;
  field_id: number;
  soil_moisture: string | number;
  timestamp: string;
};

type PredictionData = {
  status: string;

  schedule_id?: number;

  field_id: number;

  sensor: {
    soil_moisture: number;
    timestamp: string;
  };

  irrigation_prediction: {
    irrigation_need: string;
    confidence: number;
  };

  weather: {
    forecast_temperature_c: number;
    forecast_rainfall_mm: number;
    source?: string;
  };

  water_requirement: {
    water_depth_mm: number;
    water_quantity_litres: number;
  };

  schedule: {
    irrigation_required: boolean;
    recommended_time: string;
    frequency: string;
    overwatering_prevented: boolean;
    reason: string;
  };

  database?: {
    stored: boolean;
    schedule_id: number;
  };
};

type SensorState = {
  loading: boolean;
  data: SensorData | null;
  error: string | null;
};

type IrrigationRecord = {
  schedule_id: number;
  irrigation_need: string;
  confidence: string | number;
  water_quantity_litres: string | number;
  recommended_time: string;
  irrigation_required: boolean;
  created_at: string;
};

type Analytics = {
  sensor: {
    reading_count: number;
    average_soil_moisture: string | number | null;
    minimum_soil_moisture: string | number | null;
    maximum_soil_moisture: string | number | null;
  };
  irrigation: {
    irrigation_count: number;
    total_water_litres: string | number;
  };
};

type Tab = "home" | "fields" | "history" | "profile";

/* ============================================================
   CONFIG
============================================================ */

const EXPRESS_API = "";
const FASTAPI_API = "";
function fetchAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: "include" });
}

/* ============================================================
   MAIN PAGE
============================================================ */

export default function Home() {
  /* ----------------------------------------------------------
     NAVIGATION
  ---------------------------------------------------------- */

  const [activeTab, setActiveTab] =
    useState<Tab>("home");

  /* ----------------------------------------------------------
     FIELD STATE
  ---------------------------------------------------------- */

  const [fields, setFields] =
    useState<Field[]>([]);

  const [selectedFieldId, setSelectedFieldId] =
    useState<number | null>(null);

  /* ----------------------------------------------------------
     SENSOR STATE
  ---------------------------------------------------------- */

  const [sensor, setSensor] =
    useState<SensorState>({
      loading: true,
      data: null,
      error: null,
    });

  /* ----------------------------------------------------------
     PREDICTION STATE
  ---------------------------------------------------------- */

  const [prediction, setPrediction] =
    useState<PredictionData | null>(null);

  const [predictionLoading, setPredictionLoading] =
    useState(false);

  const [predictionError, setPredictionError] =
    useState<string | null>(null);

  const [history, setHistory] = useState<IrrigationRecord[]>([]);
  const [sensorHistory, setSensorHistory] = useState<SensorData[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [currentUser, setCurrentUser] = useState<Farmer | null>(null);
  const [weatherObservation, setWeatherObservation] = useState<{temperature:number; humidity:number; rainfall:number; windSpeed:number; source?:string} | null>(null);
  const [voiceText, setVoiceText] = useState("");
  const [voiceQuery, setVoiceQuery] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const voiceRecognitionRef = useRef<{ stop: () => void } | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceQueryInputRef = useRef<HTMLInputElement | null>(null);
  const [translatedRecommendation, setTranslatedRecommendation] = useState("");
  const [translateLoading, setTranslateLoading] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState("");
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [notificationChannels, setNotificationChannels] = useState({browser_push:false, sms:false, email:false});
  const [irrigationCompleteLoading, setIrrigationCompleteLoading] = useState(false);
  const [irrigationCompleteStatus, setIrrigationCompleteStatus] = useState("");

  /* ----------------------------------------------------------
     UI STATE
  ---------------------------------------------------------- */

  const [showAddField, setShowAddField] =
    useState(false);

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const [language, setLanguage] = useState<"English" | "Hindi" | "Kannada">("English");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const translations = {
    English: { greeting: "Hello,", dashboard: "Today's Dashboard", recommendation: "AI irrigation recommendation", home: "Home", fields: "Fields", history: "History", profile: "Profile", moisture: "Soil moisture", weather: "Weather", alerts: "Alerts", addField: "Add field", voice: "Ask by voice", overview: "Farm overview", fieldManagement: "Farm management", myFields: "My fields", sensor: "Sensor", temperature: "Temperature", humidity: "Humidity", rainfall: "Rainfall", forecast: "Forecast", current: "Current observation", fieldInfo: "Field information", crop: "Crop", growthStage: "Growth stage", area: "Area", soil: "Soil", soilPh: "Soil pH", irrigation: "Irrigation", waterSource: "Water source", mulching: "Mulching", online: "Online", offline: "Unavailable", checking: "Checking...", lastReading: "Last reading", recommendedTime: "Recommended time", waterRequired: "Water required", required: "Irrigation required", protected: "Overwatering prevented", tryAgain: "Try again", noReading: "No reading", latestReading: "Latest sensor reading", liveData: "Live sensor data", moistureTrend: "Soil moisture trend", live: "Live", waterUsage: "Water usage", account: "Account", language: "Language", notifications: "Notifications", readAloud: "Read recommendation aloud", download: "Download", noFields: "No fields registered", registerFirst: "Register your first field" },
    Hindi: { greeting: "नमस्ते,", dashboard: "आज का डैशबोर्ड", recommendation: "AI सिंचाई सुझाव", home: "मुख्य पृष्ठ", fields: "खेत", history: "इतिहास", profile: "प्रोफ़ाइल", moisture: "मिट्टी की नमी", weather: "मौसम", alerts: "सूचनाएँ", addField: "खेत जोड़ें", voice: "बोलकर पूछें", overview: "खेत का अवलोकन", fieldManagement: "खेत प्रबंधन", myFields: "मेरे खेत", sensor: "सेंसर", temperature: "तापमान", humidity: "नमी", rainfall: "वर्षा", forecast: "पूर्वानुमान", current: "वर्तमान जानकारी", fieldInfo: "खेत की जानकारी", crop: "फसल", growthStage: "विकास चरण", area: "क्षेत्रफल", soil: "मिट्टी", soilPh: "मिट्टी का pH", irrigation: "सिंचाई", waterSource: "जल स्रोत", mulching: "मल्चिंग", online: "ऑनलाइन", offline: "उपलब्ध नहीं", checking: "जाँच जारी...", lastReading: "अंतिम रीडिंग", recommendedTime: "सुझाया गया समय", waterRequired: "आवश्यक पानी", required: "सिंचाई आवश्यक", protected: "अधिक सिंचाई रोकी गई", tryAgain: "फिर कोशिश करें", noReading: "कोई रीडिंग नहीं", latestReading: "नवीनतम सेंसर रीडिंग", liveData: "लाइव सेंसर डेटा", moistureTrend: "मिट्टी की नमी का रुझान", live: "लाइव", waterUsage: "जल उपयोग", account: "खाता", language: "भाषा", notifications: "सूचनाएँ", readAloud: "सुझाव सुनें", download: "डाउनलोड", noFields: "कोई खेत पंजीकृत नहीं", registerFirst: "अपना पहला खेत पंजीकृत करें" },
    Kannada: { greeting: "ನಮಸ್ಕಾರ,", dashboard: "ಇಂದಿನ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", recommendation: "AI ನೀರಾವರಿ ಸಲಹೆ", home: "ಮುಖಪುಟ", fields: "ಹೊಲಗಳು", history: "ಇತಿಹಾಸ", profile: "ಪ್ರೊಫೈಲ್", moisture: "ಮಣ್ಣಿನ ತೇವಾಂಶ", weather: "ಹವಾಮಾನ", alerts: "ಅಧಿಸೂಚನೆಗಳು", addField: "ಹೊಲ ಸೇರಿಸಿ", voice: "ಧ್ವನಿಯಲ್ಲಿ ಕೇಳಿ", overview: "ಹೊಲದ ಅವಲೋಕನ", fieldManagement: "ಹೊಲ ನಿರ್ವಹಣೆ", myFields: "ನನ್ನ ಹೊಲಗಳು", sensor: "ಸೆನ್ಸರ್", temperature: "ತಾಪಮಾನ", humidity: "ತೇವಾಂಶ", rainfall: "ಮಳೆ", forecast: "ಮುನ್ಸೂಚನೆ", current: "ಪ್ರಸ್ತುತ ಮಾಹಿತಿ", fieldInfo: "ಹೊಲದ ಮಾಹಿತಿ", crop: "ಬೆಳೆ", growthStage: "ಬೆಳವಣಿಗೆಯ ಹಂತ", area: "ವಿಸ್ತೀರ್ಣ", soil: "ಮಣ್ಣು", soilPh: "ಮಣ್ಣಿನ pH", irrigation: "ನೀರಾವರಿ", waterSource: "ನೀರಿನ ಮೂಲ", mulching: "ಮಲ್ಚಿಂಗ್", online: "ಆನ್‌ಲೈನ್", offline: "ಲಭ್ಯವಿಲ್ಲ", checking: "ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ...", lastReading: "ಕೊನೆಯ ರೀಡಿಂಗ್", recommendedTime: "ಶಿಫಾರಸು ಸಮಯ", waterRequired: "ಅಗತ್ಯವಿರುವ ನೀರು", required: "ನೀರಾವರಿ ಅಗತ್ಯ", protected: "ಅತಿಯಾದ ನೀರಾವರಿ ತಡೆಯಲಾಗಿದೆ", tryAgain: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ", noReading: "ರೀಡಿಂಗ್ ಇಲ್ಲ", latestReading: "ಇತ್ತೀಚಿನ ಸೆನ್ಸರ್ ರೀಡಿಂಗ್", liveData: "ಲೈವ್ ಸೆನ್ಸರ್ ಡೇಟಾ", moistureTrend: "ಮಣ್ಣಿನ ತೇವಾಂಶದ ಪ್ರವೃತ್ತಿ", live: "ಲೈವ್", waterUsage: "ನೀರಿನ ಬಳಕೆ", account: "ಖಾತೆ", language: "ಭಾಷೆ", notifications: "ಅಧಿಸೂಚನೆಗಳು", readAloud: "ಸಲಹೆಯನ್ನು ಓದಿ", download: "ಡೌನ್‌ಲೋಡ್", noFields: "ಯಾವುದೇ ಹೊಲ ನೋಂದಾಯಿಸಿಲ್ಲ", registerFirst: "ನಿಮ್ಮ ಮೊದಲ ಹೊಲವನ್ನು ನೋಂದಾಯಿಸಿ" },
  }[language];

  const localize = (value: string) => {
    const labels: Record<string, keyof typeof translations> = {
      Low: "offline", Normal: "current", High: "required", Medium: "current", Unavailable: "offline", Online: "online", Checking: "checking",
      "No field selected": "noReading", "No sensor reading available for this field": "noReading",
    };
    const key = labels[value];
    return key ? translations[key] : value;
  };

  /* ----------------------------------------------------------
     FIELD FORM
  ---------------------------------------------------------- */

  const [fieldForm, setFieldForm] = useState({
    name: "",
    area: "",

    soil_type: "Loamy",
    soil_ph: "6.5",
    organic_carbon: "0.8",
    electrical_conductivity: "0.8",
    sunlight_hours: "8",
    region: "Central",

    latitude: "22.719600",
    longitude: "75.857700",

    irrigation_type: "Drip",
    water_source: "Borewell",
    mulching_used: "No",

    crop_name: "Wheat",
    growth_stage: "Vegetative",
  });

  /* ==========================================================
     SELECTED FIELD
  ========================================================== */

  const selectedField = useMemo(
    () =>
      fields.find(
        (field) =>
          field.field_id === selectedFieldId
      ) ?? null,
    [fields, selectedFieldId]
  );

  /* ==========================================================
     FETCH FIELDS
  ========================================================== */

  async function fetchFields() {
    try {
      const response = await fetchAuth(
        `${EXPRESS_API}/api/fields`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Failed to load fields"
        );
      }

      const data: Field[] =
        await response.json();

      setFields(data);

      if (data.length > 0) {
        setSelectedFieldId(
          (current) => {
            if (
              current !== null &&
              data.some(
                (field) =>
                  field.field_id === current
              )
            ) {
              return current;
            }

            return data[0].field_id;
          }
        );
      } else {
        setSelectedFieldId(null);
      }
    } catch (error) {
      console.error(
        "Failed to fetch fields:",
        error
      );

      setFields([]);
      setSelectedFieldId(null);
    }
  }

  /* ==========================================================
     FETCH LATEST SENSOR
  ========================================================== */

  async function fetchSensor(
    fieldId: number,
    showLoading = true
  ) {
    if (showLoading) {
      setSensor((current) => ({
        ...current,
        loading: true,
        error: null,
      }));
    }

    try {
      const response = await fetchAuth(
        `${EXPRESS_API}/api/sensor/latest/${fieldId}`,
        {
          cache: "no-store",
        }
      );

      if (response.status === 404) {
        setSensor({
          loading: false,
          data: null,
          error:
            "No sensor reading available for this field",
        });

        return;
      }

      if (!response.ok) {
        throw new Error(
          "Failed to fetch sensor data"
        );
      }

      const data: SensorData =
        await response.json();

      setSensor({
        loading: false,
        data,
        error: null,
      });
    } catch (error) {
      console.error(
        "Sensor request failed:",
        error
      );

      setSensor({
        loading: false,
        data: null,
        error:
          "Unable to connect to sensor",
      });
    }
  }

  async function fetchHistory(fieldId: number) {
    try {
      const [historyResponse, sensorResponse, analyticsResponse] = await Promise.all([
        fetchAuth(`${EXPRESS_API}/api/irrigation/history/${fieldId}`, { cache: "no-store" }),
        fetchAuth(`${EXPRESS_API}/api/sensor/history/${fieldId}`, { cache: "no-store" }),
        fetchAuth(`${EXPRESS_API}/api/analytics/${fieldId}`, { cache: "no-store" }),
      ]);

      if (historyResponse.ok) setHistory(await historyResponse.json());
      if (sensorResponse.ok) setSensorHistory(await sensorResponse.json());
      if (analyticsResponse.ok) setAnalytics(await analyticsResponse.json());
    } catch (error) {
      console.error("History request failed:", error);
    }
  }

  /* ==========================================================
     FETCH AI PREDICTION
  ========================================================== */

  async function fetchPrediction(
    fieldId: number
  ) {
    setPredictionLoading(true);
    setPredictionError(null);

    try {
      const field = fields.find(
        (item) =>
          item.field_id === fieldId
      );

      if (!field) {
        throw new Error(
          "Field not found"
        );
      }

      /*
       * Get latest sensor reading.
       */

      const sensorResponse =
        await fetchAuth(
          `${EXPRESS_API}/api/sensor/latest/${fieldId}`,
          {
            cache: "no-store",
          }
        );

      if (!sensorResponse.ok) {
        throw new Error(
          "No sensor reading available for this field"
        );
      }

      await sensorResponse.json();

      /*
       * Weather.
       *
       * Use current provider values or a saved database observation. Never replace missing weather with fabricated values.
       */

      let weather: { temperature: number | null; humidity: number | null; rainfall: number | null; windSpeed: number | null; source?: string } = {
        temperature: null, humidity: null, rainfall: null, windSpeed: null,
      };

      try {
        const weatherResponse =
          await fetchAuth(
            `${EXPRESS_API}/api/weather/${fieldId}`,
            {
              cache: "no-store",
            }
          );

        if (weatherResponse.ok) {
          const weatherData =
            await weatherResponse.json();

          const readNumber = (...values: unknown[]) => {
            const value = values.find((item) => item !== null && item !== undefined && item !== "");
            return value === undefined || !Number.isFinite(Number(value)) ? null : Number(value);
          };
          weather = {
            temperature: readNumber(weatherData.temperature, weatherData.temperature_c, weatherData.current?.temperature),
            humidity: readNumber(weatherData.humidity, weatherData.current?.humidity),
            rainfall: readNumber(weatherData.rainfall, weatherData.rainfall_mm, weatherData.current?.rainfall),
            windSpeed: readNumber(weatherData.wind_speed_kmh, weatherData.windSpeedKmh, weatherData.wind_speed),
            source: weatherData.source,
          };
          if (weather.temperature !== null && weather.humidity !== null && weather.rainfall !== null && weather.windSpeed !== null) setWeatherObservation({ temperature: weather.temperature, humidity: weather.humidity, rainfall: weather.rainfall, windSpeed: weather.windSpeed, source: weather.source });
        }
      } catch (weatherError) {
        console.warn("Weather unavailable:", weatherError);
      }
      if (weather.temperature === null || weather.humidity === null || weather.rainfall === null || weather.windSpeed === null) {
        throw new Error("Current and saved weather data are unavailable. Configure OpenWeather or add a weather reading, then try again.");
      }

      /*
       * Determine agricultural season.
       */

      const month =
        new Date().getMonth() + 1;

      let season = "Rabi";

      if (month >= 6 && month <= 9) {
        season = "Kharif";
      } else if (
        month >= 10 ||
        month <= 2
      ) {
        season = "Rabi";
      } else {
        season = "Zaid";
      }

      /*
       * Build FastAPI payload.
       */

      const payload = {
        Soil_Type:
          field.soil_type || "Loamy",

        Soil_pH:
          Number(field.soil_ph) || 6.5,

        Organic_Carbon:
          Number(field.organic_carbon) || 0.8,

        Electrical_Conductivity: Number(field.electrical_conductivity ?? 0.8),

        Temperature_C:
          weather.temperature,

        Humidity:
          weather.humidity,

        Rainfall_mm:
          weather.rainfall,

        Sunlight_Hours: Number(field.sunlight_hours ?? 8),

        Wind_Speed_kmh:
          weather.windSpeed,

        Crop_Type:
          field.crop_name || "Wheat",

        Crop_Growth_Stage:
          field.growth_stage ||
          "Vegetative",

        Season: season,

        Irrigation_Type:
          field.irrigation_type ||
          "Drip",

        Water_Source:
          field.water_source ||
          "Borewell",

        Field_Area_hectare:
          Number(field.area) || 1,

        Mulching_Used:
          field.mulching_used || "No",

        Previous_Irrigation_mm: 0,

        Region: field.region || "Central",

        Latitude: field.latitude == null ? 22.7196 : Number(field.latitude),
        Longitude: field.longitude == null ? 75.8577 : Number(field.longitude),

        field_id: fieldId,
      };

      /*
       * Send prediction request.
       */

      const response =
        await fetchAuth(
          `${FASTAPI_API}/ml-api/predict-irrigation`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify(payload),
            credentials: "include",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ||
            "Irrigation prediction failed"
        );
      }

      setPrediction(data);
    } catch (error) {
      console.error(
        "Prediction failed:",
        error
      );

      setPrediction(null);

      setPredictionError(
        error instanceof Error
          ? error.message
          : "Unable to generate prediction"
      );
    } finally {
      setPredictionLoading(false);
    }
  }

  /* ==========================================================
     INITIAL LOAD
  ========================================================== */

  useEffect(() => {
    fetchFields();
    const savedFarmer = getSession();
    setCurrentUser(savedFarmer);
    setProfileName(savedFarmer?.name || "");
    setProfilePhone(savedFarmer?.phone || "");
    const savedLanguage = window.localStorage.getItem("smart-irrigation-language");
    if (savedLanguage === "Hindi" || savedLanguage === "Kannada") setLanguage(savedLanguage);
    fetchAuth(`${EXPRESS_API}/api/notifications/preferences`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const preferences = await response.json();
      setNotificationsEnabled(preferences.in_app === true);
      setNotificationChannels({ browser_push: preferences.browser_push === true, sms: preferences.sms === true, email: preferences.email === true });
    }).catch(() => undefined);
  }, []);

  /* ==========================================================
     FIELD CHANGE
  ========================================================== */

  useEffect(() => {
    if (selectedFieldId === null) {
      setSensor({
        loading: false,
        data: null,
        error: "No field selected",
      });

      setPrediction(null);

      return;
    }

    fetchSensor(selectedFieldId);
    fetchPrediction(selectedFieldId);
    fetchHistory(selectedFieldId);
    // The selected field controls this synchronization; helper functions are recreated during render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFieldId]);

  /* ==========================================================
     SENSOR AUTO REFRESH
  ========================================================== */

  useEffect(() => {
    if (selectedFieldId === null) {
      return;
    }

    const interval =
      setInterval(() => {
        fetchSensor(
          selectedFieldId,
          false
        );
        fetchHistory(selectedFieldId);
      }, 5000);

    return () =>
      clearInterval(interval);
  }, [selectedFieldId]);

  /* ==========================================================
     REFRESH
  ========================================================== */

  async function refreshDashboard() {
    setIsRefreshing(true);

    await fetchFields();

    if (selectedFieldId !== null) {
      await fetchSensor(
        selectedFieldId
      );

      await fetchPrediction(
        selectedFieldId
      );
    }

    setIsRefreshing(false);
  }

  /* ==========================================================
     REGISTER FIELD
  ========================================================== */

  async function registerField() {
    if (!fieldForm.name.trim()) {
      alert(
        "Please enter a field name."
      );

      return;
    }

    if (!fieldForm.area || !Number.isFinite(Number(fieldForm.area)) || Number(fieldForm.area) <= 0) {
      alert("Enter a field area greater than zero hectares.");
      return;
    }
    if (Number(fieldForm.latitude) < -90 || Number(fieldForm.latitude) > 90 || Number(fieldForm.longitude) < -180 || Number(fieldForm.longitude) > 180) {
      alert("Enter valid latitude and longitude values.");
      return;
    }
    if (Number(fieldForm.soil_ph) < 0 || Number(fieldForm.soil_ph) > 14 || Number(fieldForm.sunlight_hours) < 0 || Number(fieldForm.sunlight_hours) > 24) {
      alert("Check the pH (0–14) and sunlight (0–24 hours) values.");
      return;
    }

    try {
      /*
       * Create field.
       */

      const fieldResponse =
        await fetchAuth(
          `${EXPRESS_API}/api/fields`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              farmer_id: currentUser?.farmer_id,

              name: fieldForm.name,

              latitude:
                Number(
                  fieldForm.latitude
                ),

              longitude:
                Number(
                  fieldForm.longitude
                ),

              area:
                Number(
                  fieldForm.area
                ),

              soil_type:
                fieldForm.soil_type ||
                null,

              soil_ph:
                fieldForm.soil_ph
                  ? Number(
                      fieldForm.soil_ph
                    )
                  : null,

              organic_carbon: Number(fieldForm.organic_carbon),
              electrical_conductivity: Number(fieldForm.electrical_conductivity),
              sunlight_hours: Number(fieldForm.sunlight_hours),
              region: fieldForm.region,

              irrigation_type:
                fieldForm
                  .irrigation_type ||
                null,

              water_source:
                fieldForm
                  .water_source ||
                null,

              mulching_used:
                fieldForm
                  .mulching_used ||
                null,
            }),
          }
        );

      if (!fieldResponse.ok) {
        throw new Error(
          "Failed to create field"
        );
      }

      const createdField =
        await fieldResponse.json();

      /*
       * Create crop.
       */

      if (createdField?.field_id) {
        const cropResponse =
          await fetchAuth(
            `${EXPRESS_API}/api/crops`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                field_id:
                  createdField.field_id,

                crop_name:
                  fieldForm.crop_name,

                growth_stage:
                  fieldForm.growth_stage,

                planting_date:
                  new Date()
                    .toISOString()
                    .split("T")[0],
              }),
            }
          );

        if (!cropResponse.ok) {
          console.warn(
            "Field created but crop creation failed."
          );
        }
      }

      await fetchFields();

      if (createdField?.field_id) {
        setSelectedFieldId(
          createdField.field_id
        );
      }

      /*
       * Reset form.
       */

      setFieldForm({
        name: "",
        area: "",

        soil_type: "Loamy",
        soil_ph: "6.5",
        organic_carbon: "0.8",
        electrical_conductivity: "0.8",
        sunlight_hours: "8",
        region: "Central",

        latitude: "22.719600",
        longitude: "75.857700",

        irrigation_type: "Drip",
        water_source: "Borewell",
        mulching_used: "No",

        crop_name: "Wheat",
        growth_stage: "Vegetative",
      });

      setShowAddField(false);

      alert(
        "Field registered successfully."
      );
    } catch (error) {
      console.error(
        "Field registration failed:",
        error
      );

      alert(
        "Failed to register field. Check the backend server."
      );
    }
  }

  async function saveProfile() {
    try {
      const response = await fetchAuth(`${EXPRESS_API}/api/farmers/me`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: profileName, phone: profilePhone }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your profile.");
      setCurrentUser(data); setProfileName(data.name); setProfilePhone(data.phone || ""); setProfileStatus("Profile updated.");
    } catch (error) { setProfileStatus(error instanceof Error ? error.message : "Profile update failed."); }
  }

  async function saveNotificationPreference(key: "in_app" | "browser_push" | "sms" | "email", value: boolean) {
    const next = { in_app: notificationsEnabled, ...notificationChannels, [key]: value };
    if (key === "in_app") next.in_app = value;
    try {
      const response = await fetchAuth(`${EXPRESS_API}/api/notifications/preferences`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save preferences.");
      setNotificationsEnabled(data.in_app === true);
      setNotificationChannels({ browser_push: data.browser_push === true, sms: data.sms === true, email: data.email === true });
      setNotificationStatus("Notification preferences saved.");
    } catch (error) { setNotificationStatus(error instanceof Error ? error.message : "Could not save preferences."); }
  }

  async function enablePushNotifications() {
    try {
      const message = await enableWebPush();
      setNotificationStatus(message);
      setNotificationChannels((current) => ({ ...current, browser_push: true }));
      await saveNotificationPreference("browser_push", true);
    } catch (error) { setNotificationStatus(error instanceof Error ? error.message : "Could not enable browser alerts."); }
  }

  async function enableDeviceNotifications() {
    if (!("Notification" in window)) {
      setNotificationStatus("Browser notifications are not supported on this device.");
      return;
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") {
      setNotificationStatus("Notification permission was not granted. Allow notifications for this site and try again.");
      return;
    }
    setNotificationsEnabled(true);
    await saveNotificationPreference("in_app", true);
    const result = await requestBrowserNotifications([{ id: "test", severity: "info", title: "FieldWise notifications enabled", message: "This device can display farm alerts." }]);
    setNotificationStatus(result);
    if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) await enablePushNotifications();
  }

  async function readRecommendationAloud() {
    let text = translatedRecommendation || prediction?.schedule.reason || "No irrigation recommendation is available yet.";
    const voiceLanguage = language === "Hindi" ? "hi" : language === "Kannada" ? "kn" : "en";
    if (voiceLanguage !== "en" && prediction && !translatedRecommendation) {
      setVoiceText(`Translating recommendation to ${language}…`);
      try {
        const response = await fetchAuth(`${EXPRESS_API}/api/translate/recommendation`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: prediction.schedule.reason, targetLanguage: voiceLanguage }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Translation is unavailable.");
        text = data.translated_text;
        setTranslatedRecommendation(text);
      } catch (error) {
        setVoiceText(error instanceof Error ? error.message : "Hindi/Kannada translation is unavailable.");
        return;
      }
    }
    const spoken = speak(text, voiceLanguage, (errMsg) => {
      setVoiceText(errMsg || "🔊 Reading the irrigation recommendation aloud...");
    });
    if (!spoken) setVoiceText("Read aloud is not supported in this browser.");
    else setVoiceText(`Starting read aloud in ${language}…`);
  }

  async function markIrrigationCompleted() {
    if (!selectedFieldId) return;
    setIrrigationCompleteLoading(true);
    setIrrigationCompleteStatus("");
    try {
      const waterLitres = prediction?.water_requirement?.water_quantity_litres ?? 1000;
      const response = await fetchAuth(`${EXPRESS_API}/api/irrigation/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field_id: selectedFieldId, water_quantity_litres: waterLitres }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record irrigation.");
      setIrrigationCompleteStatus("✅ Irrigation recorded! Moisture reset to high.");
      // The server has committed the irrigation. Refreshes must not turn that success into a failure.
      void Promise.allSettled([
        fetchSensor(selectedFieldId, false),
        fetchPrediction(selectedFieldId),
        fetchHistory(selectedFieldId),
      ]);
    } catch (err) {
      setIrrigationCompleteStatus(err instanceof Error ? `❌ ${err.message}` : "❌ Failed to record irrigation.");
    } finally {
      setIrrigationCompleteLoading(false);
    }
  }

  async function sendTestNotification() {
    const alertText = alerts[0] || "Your irrigation dashboard is ready.";
    try {
      const response = await fetchAuth(`${EXPRESS_API}/api/notifications/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "FieldWise alert", body: alertText }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Notification could not be sent.");
      setNotificationStatus(`Delivery status — push: ${data.deliveries.push}; SMS: ${data.deliveries.sms}; email: ${data.deliveries.email}.`);
    } catch (error) { setNotificationStatus(error instanceof Error ? error.message : "Notification failed."); }
  }

  async function translateRecommendation() {
    if (!prediction || language === "English") return;
    setTranslateLoading(true); setTranslatedRecommendation("");
    try {
      const response = await fetchAuth(`${EXPRESS_API}/api/translate/recommendation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: prediction.schedule.reason, targetLanguage: language === "Hindi" ? "hi" : "kn" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Dynamic translation is unavailable.");
      setTranslatedRecommendation(data.translated_text);
    } catch (error) { setTranslatedRecommendation(error instanceof Error ? error.message : "Translation is unavailable."); }
    finally { setTranslateLoading(false); }
  }

  function answerVoiceQuery(transcript: string) {
    const query = classifyVoiceQuery(transcript);
    const voiceLanguage = /[\u0900-\u097f]/.test(transcript) ? "hi"
      : /[\u0c80-\u0cff]/.test(transcript) ? "kn"
      : language === "Hindi" ? "hi" : language === "Kannada" ? "kn" : "en";
    const moisture = sensor.data ? Number(sensor.data.soil_moisture).toFixed(1) : "";
    const temperature = weatherObservation?.temperature.toFixed(1) || "";
    const humidity = weatherObservation?.humidity.toFixed(0) || "";
    const rainfall = weatherObservation?.rainfall.toFixed(1) || "";
    const litres = prediction ? Math.round(prediction.water_requirement.water_quantity_litres).toLocaleString("en-IN") : "";
    const recommendedTime = prediction?.schedule.recommended_time || "";

    let responseText = "";
    if (voiceLanguage === "hi") {
      responseText = query.intent === "moisture" ? sensor.data ? `${selectedField?.name || "इस खेत"} की मिट्टी में नमी ${moisture} प्रतिशत है।` : "इस खेत की मिट्टी की नमी का डेटा अभी उपलब्ध नहीं है।"
        : query.intent === "weather" ? weatherObservation ? `तापमान ${temperature} डिग्री सेल्सियस, आर्द्रता ${humidity} प्रतिशत और वर्षा ${rainfall} मिलीमीटर है।` : "मौसम का डेटा अभी उपलब्ध नहीं है।"
        : query.intent === "fields" ? fields.length ? `आपके खेत हैं: ${fields.map((field) => field.name).join(", ")}।` : "आपने अभी तक कोई खेत नहीं जोड़ा है।"
        : query.intent === "time" ? prediction ? `अगली सिंचाई का सुझाया गया समय ${recommendedTime} है।` : "सिंचाई का कोई समय अभी उपलब्ध नहीं है।"
        : query.intent === "water" ? prediction ? `सिंचाई के लिए ${litres} लीटर पानी की सलाह दी गई है।` : "पानी की कोई सिफारिश अभी उपलब्ध नहीं है।"
        : query.intent === "irrigation" ? prediction ? prediction.schedule.irrigation_required ? `सिंचाई की सलाह दी गई है। ${litres} लीटर पानी की आवश्यकता है।` : "अभी सिंचाई की आवश्यकता नहीं है।" : "सिंचाई की सिफारिश अभी उपलब्ध नहीं है।"
        : "मिट्टी की नमी, सिंचाई, मौसम, खेत, समय या पानी की मात्रा के बारे में पूछें।";
    } else if (voiceLanguage === "kn") {
      responseText = query.intent === "moisture" ? sensor.data ? `${selectedField?.name || "ಈ ಹೊಲ"}ದ ಮಣ್ಣಿನ ತೇವಾಂಶ ${moisture} ಪ್ರತಿಶತ ಇದೆ.` : "ಈ ಹೊಲದ ಮಣ್ಣಿನ ತೇವಾಂಶದ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ."
        : query.intent === "weather" ? weatherObservation ? `ತಾಪಮಾನ ${temperature} ಡಿಗ್ರಿ ಸೆಲ್ಸಿಯಸ್, ಆರ್ದ್ರತೆ ${humidity} ಪ್ರತಿಶತ ಮತ್ತು ಮಳೆ ${rainfall} ಮಿಲಿಮೀಟರ್ ಇದೆ.` : "ಹವಾಮಾನ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ."
        : query.intent === "fields" ? fields.length ? `ನಿಮ್ಮ ಹೊಲಗಳು: ${fields.map((field) => field.name).join(", ")}.` : "ನೀವು ಇನ್ನೂ ಯಾವುದೇ ಹೊಲವನ್ನು ಸೇರಿಸಿಲ್ಲ."
        : query.intent === "time" ? prediction ? `ಮುಂದಿನ ನೀರಾವರಿಗೆ ಶಿಫಾರಸು ಮಾಡಿದ ಸಮಯ ${recommendedTime}.` : "ನೀರಾವರಿ ಸಮಯದ ಶಿಫಾರಸು ಲಭ್ಯವಿಲ್ಲ."
        : query.intent === "water" ? prediction ? `ನೀರಾವರಿಗೆ ${litres} ಲೀಟರ್ ನೀರನ್ನು ಶಿಫಾರಸು ಮಾಡಲಾಗಿದೆ.` : "ನೀರಿನ ಪ್ರಮಾಣದ ಶಿಫಾರಸು ಲಭ್ಯವಿಲ್ಲ."
        : query.intent === "irrigation" ? prediction ? prediction.schedule.irrigation_required ? `ನೀರಾವರಿ ಮಾಡಲು ಶಿಫಾರಸು ಮಾಡಲಾಗಿದೆ. ${litres} ಲೀಟರ್ ನೀರು ಬೇಕಾಗುತ್ತದೆ.` : "ಈಗ ನೀರಾವರಿ ಮಾಡುವ ಅಗತ್ಯವಿಲ್ಲ." : "ನೀರಾವರಿ ಶಿಫಾರಸು ಲಭ್ಯವಿಲ್ಲ."
        : "ಮಣ್ಣಿನ ತೇವಾಂಶ, ನೀರಾವರಿ, ಹವಾಮಾನ, ಹೊಲ, ಸಮಯ ಅಥವಾ ನೀರಿನ ಪ್ರಮಾಣದ ಬಗ್ಗೆ ಕೇಳಿ.";
    } else {
      responseText = query.intent === "moisture"
        ? sensor.data ? `${selectedField?.name || "This field"} soil moisture is ${moisture} percent.` : "There is no sensor reading for this field yet."
        : query.intent === "weather" ? weatherObservation ? `Temperature ${temperature} degrees, humidity ${humidity} percent, rainfall ${rainfall} millimeters.` : "Weather data is not available yet."
        : query.intent === "fields" ? fields.length ? `Your fields are ${fields.map((field) => field.name).join(", ")}.` : "You have not registered a field yet."
        : query.intent === "time" ? prediction ? `Recommended irrigation time is ${recommendedTime}.` : "There is no irrigation schedule yet."
        : query.intent === "water" ? prediction ? `Recommended water quantity is ${litres} litres.` : "There is no water recommendation yet."
        : query.intent === "irrigation" ? prediction ? prediction.schedule.reason : "There is no irrigation recommendation yet."
        : "Try asking about soil moisture, irrigation, weather, fields, timing, or water quantity.";
    }
    setVoiceText(`${transcript} — ${responseText}`);
    speak(responseText, voiceLanguage);
  }

  async function startVoiceInput() {
    if (voiceRecorderRef.current?.state === "recording") {
      voiceRecorderRef.current.stop();
      return;
    }
    if (voiceTranscribing) return;

    // MediaRecorder works across mobile Chrome, Firefox, and Brave; Web Speech
    // recognition is retained as a fallback for browsers that expose it.
    if (window.isSecureContext && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        voiceStreamRef.current = stream;
        const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        voiceRecorderRef.current = recorder;
        voiceChunksRef.current = [];
        recorder.ondataavailable = (event) => { if (event.data.size) voiceChunksRef.current.push(event.data); };
        recorder.onerror = () => {
          setVoiceText("Recording failed. Check this site’s microphone permission and try again.");
          recorder.stop();
        };
        recorder.onstop = async () => {
          if (voiceTimerRef.current) clearTimeout(voiceTimerRef.current);
          voiceTimerRef.current = null;
          voiceRecorderRef.current = null;
          voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
          voiceStreamRef.current = null;
          setVoiceListening(false);
          const audio = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          voiceChunksRef.current = [];
          if (!audio.size) { setVoiceText("The recording was empty. Tap the microphone and try again."); return; }
          setVoiceTranscribing(true);
          setVoiceText("Transcribing your question…");
          try {
            const languageCode = language === "Hindi" ? "hi-IN" : language === "Kannada" ? "kn-IN" : "en-IN";
            const response = await fetchAuth(`${EXPRESS_API}/api/voice/transcribe`, {
              method: "POST",
              headers: { "Content-Type": audio.type.split(";")[0] || "audio/webm", "X-Voice-Language": languageCode },
              body: audio
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Voice transcription failed. Try again.");
            const transcript = String(data.transcript || "").trim();
            if (!transcript) throw new Error("No speech was recognized. Please try again.");
            setVoiceQuery(transcript);
            answerVoiceQuery(transcript);
          } catch (error) {
            setVoiceText(error instanceof Error ? error.message : "Voice transcription failed. Try again.");
          } finally {
            setVoiceTranscribing(false);
          }
        };
        recorder.start();
        setVoiceListening(true);
        setVoiceText("Listening… tap Stop when you finish. Recording stops automatically after 12 seconds.");
        voiceTimerRef.current = setTimeout(() => { if (recorder.state === "recording") recorder.stop(); }, 12000);
        return;
      } catch (error) {
        const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
        setVoiceText(denied ? "Microphone access was denied. Allow microphone access in browser settings and try again." : "Could not start microphone recording. Check microphone permission and try again.");
        return;
      }
    }

    if (!window.isSecureContext) {
      setVoiceText("This page uses HTTP, which blocks microphone recording on mobile. Open the site over trusted HTTPS, then tap the microphone again.");
      voiceQueryInputRef.current?.focus();
      return;
    }
    type ResultLike = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
    type ErrorLike = { error?: string };
    type RecognitionLike = { lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((event: ResultLike) => void) | null; onerror: ((event: ErrorLike) => void) | null; onnomatch: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
    type RecognitionConstructor = new () => RecognitionLike;
    const speechWindow = window as Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceText("Voice capture is unavailable in this browser. Open this site over HTTPS and allow microphone access.");
      voiceQueryInputRef.current?.focus();
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = language === "Hindi" ? "hi-IN" : language === "Kannada" ? "kn-IN" : "en-IN";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      voiceRecognitionRef.current = recognition;
      setVoiceListening(true);
      setVoiceText("Listening… tap Stop when you finish.");
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
        if (transcript) { setVoiceQuery(transcript); answerVoiceQuery(transcript); }
        else setVoiceText("I didn’t hear anything. Try again.");
      };
      recognition.onerror = (event) => setVoiceText(event.error === "not-allowed" ? "Microphone permission was denied. Allow access and try again." : `Voice recognition failed (${event.error || "unknown error"}). Try again.`);
      recognition.onnomatch = () => setVoiceText("No speech was recognized. Try again.");
      recognition.onend = () => { setVoiceListening(false); voiceRecognitionRef.current = null; };
      recognition.start();
    } catch {
      setVoiceListening(false);
      voiceRecognitionRef.current = null;
      setVoiceText("Could not start voice recognition. Check microphone access and try again.");
    }
  }

  /* ==========================================================
     DISPLAY VALUES
  ========================================================== */

  const soilMoisture =
    sensor.data !== null
      ? Number(
          sensor.data.soil_moisture
        ).toFixed(1)
      : null;

  const sensorTimestamp =
    sensor.data
      ? new Date(
          sensor.data.timestamp
        ).toLocaleString(
          "en-IN",
          {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }
        )
      : null;

  const moistureStatus =
    sensor.data === null
      ? "Unavailable"
      : Number(
            sensor.data.soil_moisture
          ) < 25
        ? "Low"
        : Number(
              sensor.data.soil_moisture
            ) < 45
          ? "Normal"
          : "High";

  const temperature =
    prediction?.weather
      .forecast_temperature_c;

  const rainfall =
    prediction?.weather
      .forecast_rainfall_mm;

  const alerts = [
    !sensor.data && sensor.error ? `${translations.sensor}: ${localize(sensor.error)}` : null,
    sensor.data && Number(sensor.data.soil_moisture) < 25
      ? language === "Hindi" ? "मिट्टी की नमी कम है: जल्द सिंचाई की आवश्यकता हो सकती है।" : language === "Kannada" ? "ಮಣ್ಣಿನ ತೇವಾಂಶ ಕಡಿಮೆಯಾಗಿದೆ: ಶೀಘ್ರದಲ್ಲೇ ನೀರಾವರಿ ಬೇಕಾಗಬಹುದು." : "Low soil moisture: irrigation may be needed soon."
      : null,
    prediction && prediction.weather.forecast_rainfall_mm >= 10
      ? language === "Hindi" ? "भारी वर्षा का पूर्वानुमान: संभव हो तो सिंचाई टालें।" : language === "Kannada" ? "ಭಾರಿ ಮಳೆಯ ಮುನ್ಸೂಚನೆ: ಸಾಧ್ಯವಾದರೆ ನೀರಾವರಿಯನ್ನು ಮುಂದೂಡಿ." : "Heavy rainfall forecast: postpone irrigation if possible."
      : null,
    prediction?.schedule.overwatering_prevented
      ? language === "Hindi" ? "इस खेत के लिए अधिक सिंचाई सुरक्षा सक्रिय है।" : language === "Kannada" ? "ಈ ಹೊಲಕ್ಕೆ ಅತಿಯಾದ ನೀರಾವರಿ ರಕ್ಷಣೆ ಸಕ್ರಿಯವಾಗಿದೆ." : "Over-watering protection is active for this field."
      : null,
  ].filter((alert): alert is string => Boolean(alert));

  /* ==========================================================
     RENDER
  ========================================================== */

  return (
    <main className="agro-dashboard min-h-screen pb-24 text-slate-900 lg:pb-0">

      <div className="agro-layout-shell">
        <aside className="agro-desktop-sidebar" aria-label="Main navigation">
          <div className="agro-sidebar-brand">
            <span className="agro-brand-mark">◒</span>
            <span className="agro-brand-name">FieldWise</span>
          </div>
          <p className="agro-sidebar-caption">FARM WORKSPACE</p>
          <nav className="agro-sidebar-nav">
            <NavButton icon="⌂" label={translations.home} active={activeTab === "home"} onClick={() => setActiveTab("home")} />
            <NavButton icon="▦" label={translations.fields} active={activeTab === "fields"} onClick={() => setActiveTab("fields")} />
            <NavButton icon="◷" label={translations.history} active={activeTab === "history"} onClick={() => setActiveTab("history")} />
            <NavButton icon="●" label={translations.profile} active={activeTab === "profile"} onClick={() => setActiveTab("profile")} />
          </nav>
          <div className="agro-sidebar-footer">
            <span className="agro-sidebar-avatar">{(currentUser?.name || "F").slice(0, 1).toUpperCase()}</span>
            <span className="min-w-0"><strong>{currentUser?.name || "Farmer"}</strong><small>Farm account</small></span>
          </div>
        </aside>
        <div className="agro-workspace">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="agro-header sticky top-0 z-40 border-b border-slate-200 bg-white">

        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">

          <div>
            <div className="flex items-center gap-2"><span className="agro-brand-mark">◒</span><span className="agro-brand-name">FieldWise</span></div>

            <h1 className="text-lg font-bold">
              {translations.greeting} {currentUser?.name || "Farmer"} 👋
            </h1>
          </div>

          <button
            onClick={
              refreshDashboard
            }
            disabled={isRefreshing}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-base shadow-sm transition hover:bg-green-50 disabled:opacity-50"
          >
            {isRefreshing
              ? "↻"
              : "👨‍🌾"}
          </button>

        </div>

      </header>

      <div className="agro-content mx-auto max-w-4xl px-5">

        {/* ====================================================
            HOME
        ==================================================== */}

        {activeTab === "home" && (
          <section className="agro-home-section space-y-4 pt-5">

            <div className="agro-home-wide flex items-end justify-between gap-3">

              <div>

                <p className="agro-section-label">
                  {translations.overview}
                </p>

                <h2 className="mt-1 text-2xl font-bold tracking-tight">
                  {selectedField?.name || "GreenField Cooperative"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">Season: 2026 · Wet Season · Last sync: {sensorTimestamp || "awaiting data"}</p>

              </div>

              <button
                onClick={() =>
                  setShowAddField(true)
                }
                className="rounded-xl bg-[#78b943] px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#659f35]"
              >
                + {translations.addField}
              </button>

              <button type="button" onClick={startVoiceInput} className="rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm font-bold text-green-800">{voiceListening ? "⏹ Stop" : voiceTranscribing ? "Transcribing…" : `🎙 ${translations.voice}`}</button>
              <button type="button" onClick={readRecommendationAloud} className="rounded-xl border border-green-200 bg-white px-3 py-2.5 text-sm font-bold text-green-800">🔊 {translations.readAloud}</button>
              <button type="button" onClick={enableDeviceNotifications} className="rounded-xl bg-[#17231a] px-3 py-2.5 text-sm font-bold text-white">🔔 Enable notifications</button>

            </div>

            {voiceText && <p className="agro-home-wide rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950" aria-live="polite">{voiceText}</p>}
            <form onSubmit={(event) => { event.preventDefault(); if (voiceQuery.trim()) { answerVoiceQuery(voiceQuery.trim()); setVoiceQuery(""); } }} className="agro-home-wide flex gap-2 rounded-xl border border-slate-300 bg-white p-2 shadow-sm">
              <input ref={voiceQueryInputRef} value={voiceQuery} onChange={(event) => setVoiceQuery(event.target.value)} placeholder={language === "Hindi" ? "यहाँ सवाल बोलें या लिखें..." : language === "Kannada" ? "ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಹೇಳಿ ಅಥವಾ ಬರೆಯಿರಿ..." : "Ask by voice, or type your question…"} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-green-600" aria-label="Type a voice question" />
              <button type="submit" className="rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white">Ask</button>
            </form>
            <div className="agro-home-wide flex flex-wrap gap-2 text-xs font-bold"><a className="rounded-full border border-[#b7c9ad] bg-white px-3 py-2 text-green-900 shadow-sm" href="/history">Full history</a><a className="rounded-full border border-[#b7c9ad] bg-white px-3 py-2 text-green-900 shadow-sm" href="/analytics">Field analytics</a><a className="rounded-full border border-[#b7c9ad] bg-white px-3 py-2 text-green-900 shadow-sm" href="/reports">Reports / CSV / PDF</a></div>

            {/* FIELD SELECTOR */}

            {fields.length > 0 ? (
              <select
                value={
                  selectedFieldId ?? ""
                }
                onChange={(event) =>
                  setSelectedFieldId(
                    Number(
                      event.target.value
                    )
                  )
                }
                className="agro-home-wide agro-card w-full px-4 py-3 text-sm font-medium shadow-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
              >

                {fields.map(
                  (field) => (
                    <option
                      key={
                        field.field_id
                      }
                      value={
                        field.field_id
                      }
                    >
                      {field.name}
                    </option>
                  )
                )}

              </select>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-center">

                <p className="font-semibold">
                  {translations.noFields}
                </p>

                <button
                  onClick={() =>
                    setShowAddField(true)
                  }
                  className="mt-3 rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white"
                >
                  {translations.registerFirst}
                </button>

              </div>
            )}

            {selectedFieldId !== null && <a href={`/fields/${selectedFieldId}`} className="agro-home-wide block rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-semibold text-green-900 shadow-sm">Open {selectedField?.name || "selected field"} details →</a>}

            {/* =================================================
                AI RECOMMENDATION
            ================================================= */}

            <div className="agro-recommendation agro-card border-l-4 border-l-[#5b9d2d] p-5 text-slate-900">

              <div className="agro-section-label">
                {translations.recommendation}
              </div>

              {predictionLoading ? (
                <>
                  <h3 className="mt-2 text-xl font-bold">
                    Analyzing field...
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    AI is analyzing soil
                    moisture, weather and
                    crop conditions.
                  </p>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">

                    <div className="h-full w-1/2 animate-pulse rounded-full bg-[#78b943]" />

                  </div>
                </>
              ) : prediction ? (
                <>
                  <div className="mt-3 flex items-center justify-between gap-3">

                    <h3 className="text-2xl font-bold">
                      {
                        localize(prediction.irrigation_prediction.irrigation_need)
                      }
                    </h3>

                    <span className="rounded-full bg-[#edf5e8] px-3 py-1 text-xs font-bold text-green-800">
                      {(
                        prediction
                          .irrigation_prediction
                          .confidence * 100
                      ).toFixed(1)}
                      % confidence
                    </span>

                  </div>

                  <p className="mt-2 text-sm text-slate-600">{translatedRecommendation || prediction.schedule.reason}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {language !== "English" && <button type="button" onClick={translateRecommendation} disabled={translateLoading} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold disabled:opacity-60">{translateLoading ? "Translating…" : `Translate to ${language}`}</button>}
                    <button type="button" onClick={readRecommendationAloud} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">Read aloud</button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">

                    <div className="rounded-xl bg-[#f4f7f0] p-3">

                      <p className="text-[10px] text-slate-500">
                        {translations.recommendedTime}
                      </p>

                      <p className="mt-1 font-bold">
                        {
                          prediction
                            .schedule
                            .recommended_time
                        }
                      </p>

                    </div>

                    <div className="rounded-xl bg-[#f4f7f0] p-3">

                      <p className="text-[10px] text-slate-500">
                        {translations.waterRequired}
                      </p>

                      <p className="mt-1 font-bold">
                        {Math.round(
                          prediction
                            .water_requirement
                            .water_quantity_litres
                        ).toLocaleString(
                          "en-IN"
                        )}{" "}
                        L
                      </p>

                    </div>

                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">

                    {prediction
                      .schedule
                      .irrigation_required && (
                      <span className="rounded-full bg-[#edf5e8] px-3 py-1 text-xs font-bold text-green-800">
                        {translations.required}
                      </span>
                    )}

                    {prediction
                      .schedule
                      .overwatering_prevented && (
                      <span className="rounded-full bg-[#f4f7f0] px-3 py-1 text-xs font-bold text-slate-700">
                        {translations.protected}
                      </span>
                    )}

                  </div>

                  {/* IRRIGATION COMPLETED BUTTON */}
                  <div className="mt-4 border-t border-green-100 pt-4">
                    <button
                      type="button"
                      onClick={markIrrigationCompleted}
                      disabled={irrigationCompleteLoading || !selectedFieldId}
                      className="w-full rounded-xl bg-[#17231a] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#2a4035] active:scale-95 disabled:opacity-60"
                    >
                      {irrigationCompleteLoading ? "Recording…" : "💧 Irrigation Completed"}
                    </button>
                    {irrigationCompleteStatus && (
                      <p className="mt-2 text-center text-xs font-semibold text-green-800" aria-live="polite">
                        {irrigationCompleteStatus}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="mt-2 text-xl font-bold">
                    Prediction unavailable
                  </h3>

                  <p className="mt-1 text-sm text-green-50">
                    {predictionError || "No AI prediction is currently available."}
                  </p>

                  <button
                    onClick={() => {
                      if (
                        selectedFieldId !==
                        null
                      ) {
                        fetchPrediction(
                          selectedFieldId
                        );
                      }
                    }}
                    className="mt-4 rounded-lg bg-[#78b943] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#659f35]"
                  >
                    {translations.tryAgain}
                  </button>
                </>
              )}

            </div>

            {/* =================================================
                METRICS
            ================================================= */}

            <div className="agro-metrics agro-card p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Sensor Insights</h3><span className="agro-icon">›</span></div>
              <div className="agro-insight-grid">

              <MetricCard
                icon="💧"
                title={translations.moisture}
                source={translations.sensor}
                value={
                  sensor.loading
                    ? "Loading..."
                    : soilMoisture !==
                        null
                      ? `${soilMoisture}%`
                      : "—"
                }
                subtitle={
                    sensor.data
                    ? localize(moistureStatus)
                    : sensor.error ??
                      translations.noReading
                }
              />

              <MetricCard
                icon="🌡️"
                title={translations.temperature}
                source={translations.weather}
                value={
                  temperature !==
                  undefined
                    ? `${temperature.toFixed(
                        1
                      )}°C`
                    : "—"
                }
                subtitle={translations.forecast}
              />

              <MetricCard
                icon="💦"
                title={translations.humidity}
                source={translations.weather}
                value={weatherObservation ? `${weatherObservation.humidity}%` : "—"}
                subtitle={weatherObservation?.source === "stored_cache" ? translations.liveData : translations.current}
              />

              <MetricCard
                icon="🌧️"
                title={translations.rainfall}
                source={translations.weather}
                value={
                  rainfall !==
                  undefined
                    ? `${rainfall.toFixed(
                        1
                      )} mm`
                    : "—"
                }
                subtitle={translations.forecast}
              />

              </div>
            </div>

            {notificationsEnabled && alerts.length > 0 && (
              <div className="agro-alerts space-y-2 rounded-2xl border border-amber-300 bg-amber-50 p-4">
                <h3 className="font-bold text-amber-900">Alerts</h3>
                {alerts.map((alert) => <p key={alert} className="text-sm text-amber-800">{alert}</p>)}
                <button type="button" onClick={enableDeviceNotifications} className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white">Enable notifications</button>
                <button type="button" onClick={sendTestNotification} className="ml-2 rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900">Send configured alert test</button>
                {notificationStatus && <p className="text-xs text-amber-900" role="status">{notificationStatus}</p>}
              </div>
            )}

            {/* =================================================
                SENSOR STATUS
            ================================================= */}

            <div className="agro-sensor-status agro-card p-4">

              <div className="flex items-center justify-between">

                <div>

                  <h3 className="font-bold">
                    {translations.sensor} {language === "English" ? "status" : language === "Hindi" ? "स्थिति" : "ಸ್ಥಿತಿ"}
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    {selectedField?.name ??
                      localize("No field selected")}
                  </p>

                </div>

                <div className="flex items-center gap-2">

                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      sensor.data
                        ? "bg-green-500"
                        : sensor.loading
                          ? "bg-yellow-400"
                          : "bg-slate-300"
                    }`}
                  />

                  <span className="text-sm font-semibold">
                    {sensor.loading
                      ? "Checking..."
                      : sensor.data
                        ? translations.online
                        : translations.offline}
                  </span>

                </div>

              </div>

              {sensor.data && (
                <div className="mt-4 grid grid-cols-2 gap-3">

                  <SmallInfo
                    label={translations.sensor}
                    value={
                      sensor.data
                        .sensor_id
                    }
                  />

                  <SmallInfo
                    label={translations.lastReading}
                    value={
                      sensorTimestamp ??
                      "—"
                    }
                  />

                </div>
              )}

              {sensor.error &&
                !sensor.loading && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    {sensor.error}
                  </div>
                )}

            </div>

            {/* =================================================
                FIELD INFORMATION
            ================================================= */}

            {selectedField && (
              <div className="agro-field-info agro-card p-4">

                <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Soil Conditions</h3><span className="agro-icon">›</span></div>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedField.name}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">

                  <SmallInfo
                    label={translations.crop}
                    value={
                      selectedField.crop_name ??
                      "Not set"
                    }
                  />

                  <SmallInfo
                    label={translations.growthStage}
                    value={
                      selectedField.growth_stage ??
                      "Not set"
                    }
                  />

                  <SmallInfo
                    label={translations.area}
                    value={`${selectedField.area} hectare`}
                  />

                  <SmallInfo
                    label={translations.soil}
                    value={
                      selectedField.soil_type ??
                      "Not set"
                    }
                  />

                  <SmallInfo
                    label={translations.soilPh}
                    value={
                      selectedField.soil_ph ??
                      "Not set"
                    }
                  />

                  <SmallInfo
                    label={translations.irrigation}
                    value={
                      selectedField.irrigation_type ??
                      "Not set"
                    }
                  />

                  <SmallInfo
                    label={translations.waterSource}
                    value={
                      selectedField.water_source ??
                      "Not set"
                    }
                  />

                  <SmallInfo
                    label={translations.mulching}
                    value={
                      selectedField.mulching_used ??
                      "Not set"
                    }
                  />

                </div>

              </div>
            )}

          </section>
        )}

        {/* ====================================================
            FIELDS
        ==================================================== */}

        {activeTab === "fields" && (
          <section className="space-y-4 pt-5">

            <div className="flex items-end justify-between">

              <div>

                <p className="text-sm text-slate-500">
                  {translations.fieldManagement}
                </p>

                <h2 className="text-2xl font-bold">
                  {translations.myFields}
                </h2>

              </div>

              <button
                onClick={() =>
                  setShowAddField(true)
                }
                className="rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white"
              >
                + {translations.addField}
              </button>

            </div>

            {fields.length === 0 ? (
              <EmptyState
                title={translations.noFields}
                description={translations.registerFirst}
                buttonText={translations.addField}
                onClick={() =>
                  setShowAddField(true)
                }
              />
            ) : (
              <div className="space-y-3">

                {fields.map(
                  (field) => (
                    <button
                      key={
                        field.field_id
                      }
                      onClick={() => {
                        setSelectedFieldId(
                          field.field_id
                        );

                        setActiveTab(
                          "home"
                        );
                      }}
                      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-green-300"
                    >

                      <div className="flex items-start justify-between">

                        <div>

                          <h3 className="font-bold">
                            {field.name}
                          </h3>

                          <p className="mt-1 text-sm text-slate-500">
                            {field.crop_name ??
                              translations.noReading}
                          </p>

                        </div>

                        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
                          Field #
                          {
                            field.field_id
                          }
                        </span>

                      </div>

                      <div className="mt-4 grid grid-cols-3 gap-2">

                        <SmallInfo
                          label="Area"
                          value={`${field.area} ha`}
                        />

                        <SmallInfo
                          label="Stage"
                          value={
                            field.growth_stage ??
                            "—"
                          }
                        />

                        <SmallInfo
                          label="Soil"
                          value={
                            field.soil_type ??
                            "—"
                          }
                        />

                      </div>

                    </button>
                  )
                )}

              </div>
            )}

          </section>
        )}

        {/* ====================================================
            HISTORY
        ==================================================== */}

        {activeTab === "history" && (
          <section className="space-y-4 pt-5">

            <div>

              <p className="text-sm text-slate-500">
                {translations.irrigation} {language === "English" ? "monitoring" : language === "Hindi" ? "निगरानी" : "ಮೇಲ್ವಿಚಾರಣೆ"}
              </p>

              <h2 className="text-2xl font-bold">
                {translations.history}
              </h2>

            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

              <h3 className="font-bold">
                {translations.latestReading}
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                {translations.liveData}
              </p>

              {sensor.data ? (
                <div className="mt-5 flex items-center gap-4">

                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-xl">
                    💧
                  </div>

                  <div>

                    <p className="font-bold">
                      {Number(
                        sensor.data
                          .soil_moisture
                      ).toFixed(
                        1
                      )}
                      % {translations.moisture}
                    </p>

                    <p className="text-xs text-slate-500">
                      {sensorTimestamp}
                    </p>

                  </div>

                </div>
              ) : (
                <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  {translations.noReading}
                </div>
              )}

            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <div className="flex items-center justify-between">

                <div>

                  <h3 className="font-bold">
                    {translations.moistureTrend}
                  </h3>

                  <p className="mt-1 text-xs text-slate-500">
                    Last {sensorHistory.length} sensor readings
                  </p>

                </div>

                <span className="rounded-full bg-green-50 px-3 py-1 text-[10px] font-bold text-green-700">
                  {translations.live}
                </span>

              </div>

              <div className="mt-6 flex h-32 items-end gap-1 rounded-xl bg-slate-50 px-3 pb-3 pt-5">
                {sensorHistory.length > 0 ? sensorHistory.slice(0, 24).reverse().map((reading) => (
                  <div
                    key={`${reading.sensor_id}-${reading.timestamp}`}
                    title={`${Number(reading.soil_moisture).toFixed(1)}%`}
                    className="min-w-1 flex-1 rounded-t bg-green-500"
                    style={{ height: `${Math.max(8, Math.min(100, Number(reading.soil_moisture)))}%` }}
                  />
                )) : (
                  <p className="w-full text-center text-xs text-slate-500">{translations.noReading}</p>
                )}
              </div>

              {history.length > 0 && (
                <div className="mt-4 space-y-2">
                  {history.slice(0, 5).map((record) => (
                    <div key={record.schedule_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="font-semibold">{record.irrigation_need} irrigation</span>
                      <span className="text-slate-500">{Number(record.water_quantity_litres).toLocaleString("en-IN")} L · {new Date(record.created_at).toLocaleDateString("en-IN")}</span>
                    </div>
                  ))}
                </div>
              )}

            </div>

            <div className="grid grid-cols-2 gap-3">

              <MetricCard
                icon="💧"
                title={translations.waterUsage}
                source={translations.history}
                value={analytics ? `${Math.round(Number(analytics.irrigation.total_water_litres)).toLocaleString("en-IN")} L` : "—"}
                subtitle={analytics ? `${analytics.irrigation.irrigation_count} ${translations.history}` : translations.noReading}
              />

              <MetricCard
                icon="🌧️"
                title={translations.rainfall}
                source={translations.weather}
                value={rainfall !== undefined ? `${rainfall.toFixed(1)} mm` : "—"}
                subtitle={translations.forecast}
              />

            </div>

          </section>
        )}

        {/* ====================================================
            PROFILE
        ==================================================== */}

        {activeTab === "profile" && (
          <section className="space-y-4 pt-5">

            <div>

              <p className="text-sm text-slate-500">
                {translations.account}
              </p>

              <h2 className="text-2xl font-bold">
                {translations.profile}
              </h2>

            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Farmer name" value={profileName} onChange={setProfileName} />
                <Input label="Phone number" value={profilePhone} onChange={setProfilePhone} placeholder="Include country code" />
              </div>
              <button type="button" onClick={saveProfile} className="mt-4 rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white">Save profile</button>
              {profileStatus && <p className="mt-2 text-xs text-slate-600" role="status">{profileStatus}</p>}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

              <div className="flex items-center gap-4">

                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
                  👨‍🌾
                </div>

                <div>

                  <h3 className="font-bold">
                    {currentUser?.name ?? "Farmer"}
                  </h3>

                  <p className="text-sm text-slate-500">
                    {currentUser?.email} · Farmer ID: {currentUser?.farmer_id}
                  </p>

                </div>

              </div>

            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

              <label className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                <span className="text-sm font-semibold">🌐 {translations.language}</span>
                <select value={language} onChange={(event) => { const nextLanguage = event.target.value as typeof language; setLanguage(nextLanguage); window.localStorage.setItem("smart-irrigation-language", nextLanguage); setTranslatedRecommendation(""); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                  <option>English</option>
                  <option>Hindi</option>
                  <option>Kannada</option>
                </select>
              </label>

              <label className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
                <span className="text-sm font-semibold">🔔 {translations.alerts}</span>
                <input type="checkbox" checked={notificationsEnabled} onChange={(event) => { const value = event.target.checked; setNotificationsEnabled(value); void saveNotificationPreference("in_app", value); }} className="h-4 w-4 accent-green-700" />
              </label>

              <div className="space-y-3 border-b border-slate-100 px-4 py-4">
                <p className="text-sm font-semibold">Notification channels</p>
                {([["sms", "SMS alerts (Twilio)"], ["email", "Email alerts (SendGrid)"]] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between text-sm"><span>{label}</span><input type="checkbox" checked={notificationChannels[key]} onChange={(event) => { const value = event.target.checked; setNotificationChannels((current) => ({ ...current, [key]: value })); void saveNotificationPreference(key, value); }} className="h-4 w-4 accent-green-700" /></label>)}
                <button type="button" onClick={enablePushNotifications} className="rounded-lg bg-green-700 px-3 py-2 text-xs font-bold text-white">Enable browser push on this device</button>
                {notificationStatus && <p className="text-xs text-slate-600" role="status">{notificationStatus}</p>}
              </div>

              <button onClick={startVoiceInput} className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-4 text-left">
                <span className="text-sm font-semibold">🎙️ Ask your farm by voice</span>
                <span className="text-xs text-slate-400">{voiceListening ? "Listening" : voiceTranscribing ? "Transcribing…" : "Listen"}</span>
              </button>

              <button type="button" onClick={sendTestNotification} className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-4 text-left"><span className="text-sm font-semibold">🔔 Test configured notifications</span><span className="text-xs text-slate-400">Send</span></button>

              <button onClick={readRecommendationAloud} className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-4 text-left">
                <span className="text-sm font-semibold">🎙️ {translations.readAloud}</span>
                <span className="text-xs text-slate-400">Speak</span>
              </button>

              <button onClick={() => exportCsv(history)} className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-4 text-left">
                <span className="text-sm font-semibold">📄 Export irrigation CSV</span>
                <span className="text-xs text-slate-400">{translations.download}</span>
              </button>
              <a href="/reports" className="flex w-full items-center justify-between px-4 py-4 text-left"><span className="text-sm font-semibold">🖨️ Field report / Save as PDF</span><span className="text-xs text-slate-400">Open</span></a>

            </div>

            <div className="rounded-2xl bg-green-50 p-4">

              <p className="text-sm font-semibold text-green-800">
                FieldWise
              </p>

              <p className="mt-1 text-xs text-green-700">
                AI-powered predictive water
                management and crop
                optimization.
              </p>

            </div>

          </section>
        )}

      </div>

        </div>
      </div>

      {/* ======================================================
          BOTTOM NAVIGATION
      ====================================================== */}

      <nav className="agro-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">

        <div className="mx-auto grid max-w-4xl grid-cols-4">

          <NavButton
            icon="⌂"
            label={translations.home}
            active={
              activeTab === "home"
            }
            onClick={() =>
              setActiveTab("home")
            }
          />

          <NavButton
            icon="▦"
            label={translations.fields}
            active={
              activeTab === "fields"
            }
            onClick={() =>
              setActiveTab("fields")
            }
          />

          <NavButton
            icon="◷"
            label={translations.history}
            active={
              activeTab === "history"
            }
            onClick={() =>
              setActiveTab("history")
            }
          />

          <NavButton
            icon="●"
            label={translations.profile}
            active={
              activeTab === "profile"
            }
            onClick={() =>
              setActiveTab("profile")
            }
          />

        </div>

      </nav>

      {/* ======================================================
          ADD FIELD MODAL
      ====================================================== */}

      {showAddField && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-5">

          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">

            <div className="mb-5 flex items-center justify-between">

              <div>

                <p className="text-xs font-bold uppercase tracking-wide text-green-600">
                  Field management
                </p>

                <h2 className="text-xl font-bold">
                  Register Field
                </h2>

              </div>

              <button
                onClick={() =>
                  setShowAddField(false)
                }
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-lg"
              >
                ×
              </button>

            </div>

            <div className="space-y-5">

              <FormSection title="Field details">

                <Input
                  label="Field name"
                  value={
                    fieldForm.name
                  }
                  onChange={(value) =>
                    setFieldForm({
                      ...fieldForm,
                      name: value,
                    })
                  }
                  placeholder="e.g. North Field"
                />

                <Input
                  label="Area (hectare)"
                  type="number"
                  value={
                    fieldForm.area
                  }
                  onChange={(value) =>
                    setFieldForm({
                      ...fieldForm,
                      area: value,
                    })
                  }
                  placeholder="e.g. 2.5"
                />

                <Input label="Region" value={fieldForm.region} onChange={(value) => setFieldForm({ ...fieldForm, region: value })} placeholder="e.g. Central" />

                <div className="grid grid-cols-2 gap-3">

                  <Input
                    label="Latitude"
                    value={
                      fieldForm.latitude
                    }
                    onChange={(value) =>
                      setFieldForm({
                        ...fieldForm,
                        latitude: value,
                      })
                    }
                  />

                  <Input
                    label="Longitude"
                    value={
                      fieldForm.longitude
                    }
                    onChange={(value) =>
                      setFieldForm({
                        ...fieldForm,
                        longitude: value,
                      })
                    }
                  />

                </div>

              </FormSection>

              <FormSection title="Soil">

                <Select
                  label="Soil type"
                  value={
                    fieldForm.soil_type
                  }
                  options={[
                    "Loamy",
                    "Clay",
                    "Sandy",
                    "Silty",
                    "Black",
                    "Red",
                  ]}
                  onChange={(value) =>
                    setFieldForm({
                      ...fieldForm,
                      soil_type: value,
                    })
                  }
                />

                <div className="grid grid-cols-2 gap-3">

                  <Input
                    label="Soil pH"
                    type="number"
                    value={
                      fieldForm.soil_ph
                    }
                    onChange={(value) =>
                      setFieldForm({
                        ...fieldForm,
                        soil_ph: value,
                      })
                    }
                    placeholder="e.g. 6.8"
                  />

                  <Input
                    label="Organic carbon"
                    type="number"
                    value={
                      fieldForm
                        .organic_carbon
                    }
                    onChange={(value) =>
                      setFieldForm({
                        ...fieldForm,
                        organic_carbon:
                          value,
                      })
                    }
                    placeholder="e.g. 0.8"
                  />

                  <Input label="Electrical conductivity (dS/m)" type="number" value={fieldForm.electrical_conductivity} onChange={(value) => setFieldForm({ ...fieldForm, electrical_conductivity: value })} placeholder="e.g. 0.8" />
                  <Input label="Daily sunlight (hours)" type="number" value={fieldForm.sunlight_hours} onChange={(value) => setFieldForm({ ...fieldForm, sunlight_hours: value })} placeholder="e.g. 8" />

                </div>

              </FormSection>

              <FormSection title="Crop">

                <Select
                  label="Crop"
                  value={
                    fieldForm.crop_name
                  }
                  options={[
                    "Wheat",
                    "Rice",
                    "Maize",
                    "Soybean",
                    "Cotton",
                    "Potato",
                    "Tomato",
                  ]}
                  onChange={(value) =>
                    setFieldForm({
                      ...fieldForm,
                      crop_name: value,
                    })
                  }
                />

                <Select
                  label="Growth stage"
                  value={
                    fieldForm
                      .growth_stage
                  }
                  options={[
                    "Germination",
                    "Seedling",
                    "Vegetative",
                    "Flowering",
                    "Fruiting",
                    "Maturity",
                  ]}
                  onChange={(value) =>
                    setFieldForm({
                      ...fieldForm,
                      growth_stage:
                        value,
                    })
                  }
                />

              </FormSection>

              <FormSection title="Irrigation">

                <Select
                  label="Irrigation type"
                  value={
                    fieldForm
                      .irrigation_type
                  }
                  options={[
                    "Drip",
                    "Sprinkler",
                    "Flood",
                    "Furrow",
                    "Rainfed",
                  ]}
                  onChange={(value) =>
                    setFieldForm({
                      ...fieldForm,
                      irrigation_type:
                        value,
                    })
                  }
                />

                <Select
                  label="Water source"
                  value={
                    fieldForm
                      .water_source
                  }
                  options={[
                    "Borewell",
                    "Canal",
                    "River",
                    "Pond",
                    "Rainwater",
                  ]}
                  onChange={(value) =>
                    setFieldForm({
                      ...fieldForm,
                      water_source:
                        value,
                    })
                  }
                />

                <Select
                  label="Mulching used"
                  value={
                    fieldForm
                      .mulching_used
                  }
                  options={[
                    "Yes",
                    "No",
                  ]}
                  onChange={(value) =>
                    setFieldForm({
                      ...fieldForm,
                      mulching_used:
                        value,
                    })
                  }
                />

              </FormSection>

              <div className="flex gap-3 pt-2">

                <button
                  onClick={() =>
                    setShowAddField(
                      false
                    )
                  }
                  className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold"
                >
                  Cancel
                </button>

                <button
                  onClick={
                    registerField
                  }
                  className="flex-1 rounded-xl bg-green-700 py-3 text-sm font-bold text-white"
                >
                  Register Field
                </button>

              </div>

            </div>

          </div>

        </div>
      )}

    </main>
  );
}

function exportCsv(records: IrrigationRecord[]) {
  if (records.length === 0) {
    window.alert("No irrigation history is available to export.");
    return;
  }

  const headers = ["schedule_id", "need", "water_litres", "recommended_time", "created_at"];
  const rows = records.map((record) => [
    record.schedule_id,
    record.irrigation_need,
    record.water_quantity_litres,
    record.recommended_time,
    record.created_at,
  ]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "irrigation-history.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   COMPONENTS
============================================================ */

function MetricCard({
  icon,
  title,
  source,
  value,
  subtitle,
}: {
  icon: string;
  title: string;
  source: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="agro-insight">

      <div className="flex items-center justify-between">

        <span className="agro-icon text-base">
          {icon}
        </span>

        <span className="text-[11px] font-medium text-slate-400">
          {source}
        </span>

      </div>

      <p className="mt-3 text-xs text-slate-500">
        {title}
      </p>

      <p className="mt-1 text-xl font-bold tracking-tight">
        {value}
      </p>

      {subtitle && (
        <p className="mt-1 text-[11px] text-slate-400">
          {subtitle}
        </p>
      )}

    </div>
  );
}

/* ============================================================
   SMALL INFO
============================================================ */

function SmallInfo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">

      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 truncate text-sm font-semibold text-slate-700">
        {value}
      </p>

    </div>
  );
}

/* ============================================================
   NAV BUTTON
============================================================ */

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition ${
        active
          ? "font-bold text-green-700"
          : "text-slate-500 hover:text-slate-800"
      }`}
    >
      <span className="agro-nav-icon" data-icon={icon} aria-hidden="true">
        {icon}
      </span>

      <span>
        {label}
      </span>
    </button>
  );
}

/* ============================================================
   SETTINGS
============================================================ */

/* ============================================================
   FORM SECTION
============================================================ */

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">

      <h3 className="text-sm font-bold text-slate-700">
        {title}
      </h3>

      <div className="space-y-3">
        {children}
      </div>

    </div>
  );
}

/* ============================================================
   INPUT
============================================================ */

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">

      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>

      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
      />

    </label>
  );
}

/* ============================================================
   SELECT
============================================================ */

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (
    value: string
  ) => void;
}) {
  return (
    <label className="block">

      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
      >

        {options.map(
          (option) => (
            <option
              key={option}
              value={option}
            >
              {option}
            </option>
          )
        )}

      </select>

    </label>
  );
}

/* ============================================================
   EMPTY STATE
============================================================ */

function EmptyState({
  title,
  description,
  buttonText,
  onClick,
}: {
  title: string;
  description: string;
  buttonText: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">

      <div className="text-4xl">
        🌱
      </div>

      <h3 className="mt-3 font-bold">
        {title}
      </h3>

      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        {description}
      </p>

      <button
        onClick={onClick}
        className="mt-4 rounded-xl bg-green-700 px-5 py-2.5 text-sm font-bold text-white"
      >
        {buttonText}
      </button>

    </div>
  );
}
