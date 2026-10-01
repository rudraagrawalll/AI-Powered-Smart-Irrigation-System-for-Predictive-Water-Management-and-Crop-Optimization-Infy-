export type VoiceResult = { transcript: string; intent: "moisture" | "irrigation" | "weather" | "fields" | "time" | "water" | "unknown" };
export function classifyVoiceQuery(transcript: string): VoiceResult {
  const text = transcript.toLowerCase();
  let intent: VoiceResult["intent"] = "unknown";
  if (/moisture|नमी|ತೇವಾಂಶ/.test(text)) intent = "moisture";
  else if (/weather|मौसम|ಹವಾಮಾನ|rain|बारिश|ಮಳೆ/.test(text)) intent = "weather";
  else if (/field|खेत|ಹೊಲ/.test(text)) intent = "fields";
  else if (/when|कब|ಯಾವಾಗ|time|समय|ಸಮಯ/.test(text)) intent = "time";
  else if (/water|पानी|ನೀರು|quantity|कितना|ಎಷ್ಟು/.test(text)) intent = "water";
  else if (/irrigat|सिंचाई|ನೀರಾವರಿ/.test(text)) intent = "irrigation";
  return { transcript, intent };
}
export function speak(text: string, lang: string, onError?: (err: string) => void): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  if (!text.trim()) { onError?.("There is no recommendation to read aloud yet."); return false; }
  const synthesis = window.speechSynthesis;
  let started = false;
  const locale = lang === "hi" ? "hi-IN" : lang === "kn" ? "kn-IN" : "en-IN";

  const speakNow = () => {
    if (started) return;
    try {
      started = true;
      synthesis.cancel();
      if (synthesis.paused) synthesis.resume();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
       utterance.volume = 1.0;
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onerror = (e) => {
        console.warn("Speech synthesis error:", e);
        if (onError) onError(`Speech failed (${e.error || "synthesis-failed"})`);
      };

      const voices = synthesis.getVoices();
      const matchingVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()));
      if (matchingVoice) utterance.voice = matchingVoice;
      else if (lang !== "en") {
        onError?.(`This device has no ${locale} speech voice installed. Add the ${lang === "hi" ? "Hindi" : "Kannada"} voice in your device speech settings and try again.`);
        return;
      }

      utterance.onstart = () => onError?.("");
      synthesis.speak(utterance);
    } catch (err) {
      console.error("Speech synthesis exception:", err);
      if (onError) onError("Failed to initiate text-to-speech.");
    }
  };

  if (synthesis.getVoices().length === 0) {
    synthesis.addEventListener("voiceschanged", speakNow, { once: true });
    window.setTimeout(() => {
      if (synthesis.getVoices().length) speakNow();
      else { synthesis.removeEventListener("voiceschanged", speakNow); onError?.("No speech voice is available in this browser."); }
    }, 1500);
  } else {
    speakNow();
  }
  return true;
}
