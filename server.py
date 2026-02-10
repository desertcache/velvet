"""Velvet — Python backend server for audio capture + transcription."""

import json
import threading
import time

import numpy as np
import sounddevice as sd
from flask import Flask, jsonify
from flask_cors import CORS

# ── Config ──────────────────────────────────────────────────────────────────
SAMPLE_RATE = 16000
CHANNELS = 1
MAX_RECORD_SECONDS = 600
MODEL_SIZE = "medium"
PORT = 5111

app = Flask(__name__)
CORS(app)


class WhisperEngine:
    def __init__(self):
        self.recording = False
        self.audio_chunks: list[np.ndarray] = []
        self.stream = None
        self.start_time = 0.0
        self.model = None
        self.model_status = "loading"
        self.device_type = ""

    def load_model(self):
        try:
            from faster_whisper import WhisperModel

            try:
                self.model = WhisperModel(MODEL_SIZE, device="cuda", compute_type="float16")
                self.device_type = "CUDA"
            except Exception:
                self.model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
                self.device_type = "CPU"
            self.model_status = "ready"
        except Exception as e:
            self.model_status = f"error: {e}"

    def start_recording(self):
        if self.model_status != "ready":
            return False
        self.audio_chunks.clear()
        self.recording = True
        self.start_time = time.time()
        self.stream = sd.InputStream(
            samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="float32",
            callback=self._callback,
        )
        self.stream.start()
        return True

    def _callback(self, indata, frames, time_info, status):
        if self.recording:
            self.audio_chunks.append(indata.copy())

    def stop_recording(self):
        self.recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None

    def get_elapsed(self):
        if not self.recording:
            return 0.0
        return time.time() - self.start_time

    def transcribe(self):
        if not self.audio_chunks:
            return None, "No audio recorded"
        audio = np.concatenate(self.audio_chunks, axis=0).flatten()
        segments, _ = self.model.transcribe(audio, beam_size=5)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        if not text:
            return None, "No speech detected"
        return text, None


engine = WhisperEngine()


@app.route("/status")
def status():
    return jsonify(status=engine.model_status, device=engine.device_type)


@app.route("/record", methods=["POST"])
def record():
    ok = engine.start_recording()
    return jsonify(ok=ok)


@app.route("/stop", methods=["POST"])
def stop():
    engine.stop_recording()
    return jsonify(ok=True)


@app.route("/elapsed")
def elapsed():
    return jsonify(elapsed=engine.get_elapsed())


@app.route("/transcribe", methods=["POST"])
def transcribe():
    try:
        text, err = engine.transcribe()
        if err:
            return jsonify(ok=False, error=err)
        return jsonify(ok=True, text=text)
    except Exception as e:
        return jsonify(ok=False, error=str(e))


def main():
    # Load model in background thread
    threading.Thread(target=engine.load_model, daemon=True).start()
    app.run(host="127.0.0.1", port=PORT, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
