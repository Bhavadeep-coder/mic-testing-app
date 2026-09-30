# 🎙️ Mic Testing App — Instant Online Microphone Tester

[![Live Demo](https://img.shields.io/badge/Live%20Demo-https%3A%2F%2Fmic--testing--102f63.netlify.app-blue?style=for-the-badge&logo=netlify)](https://mic-testing-102f63.netlify.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Web Audio API](https://img.shields.io/badge/API-Web%20Audio-green?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

A modern, high-performance web application that lets users instantly test whether their microphone is working correctly with real-time circular frequency visualizations, waveform graphs, volume meters, and audio signal status.

🌐 **Live Website**: [https://mic-testing-102f63.netlify.app/](https://mic-testing-102f63.netlify.app/)

---

## ✨ Features

- 🎙️ **Real-Time Microphone Tester**: Uses browser `getUserMedia()`, `AudioContext`, and `AnalyserNode` for accurate input measurement.
- ⭕ **Circular Frequency Visualizer**: 80-bar dynamic visualizer responding to voice frequencies.
- 🌊 **Audio Waveform Display**: Smooth HTML5 Canvas waveform graph with gradient glow effects.
- 📊 **Live Input Level Meter**: Real-time volume meter with clipping and peak detection.
- 🔊 **"Hear My Microphone" Playback**: Route mic audio back through speakers via gain control for echo/feedback testing.
- 🎛️ **Device Switcher**: Seamlessly switch between multiple connected microphone devices.
- 🔒 **100% Private & In-Browser**: Audio processing happens locally using the Web Audio API — audio is **never** recorded or uploaded to any server.
- 🌓 **Dark & Light Mode**: Glassmorphism UI with smooth theme switching and persistence.
- 📱 **Fully Responsive**: Optimized for desktop, tablet, and mobile browsers.
- 🤖 **SEO & GEO Optimized**: Built-in JSON-LD structured data (`WebApplication`, `FAQPage`, `HowTo`) and machine-readable FAQ accordions.

---

## 🚀 Quick Start (Local Setup)

Clone the repository and open `index.html` in your browser:

```bash
git clone https://github.com/YOUR_USERNAME/mic-testing-app.git
cd mic-testing-app
```

Or serve over HTTP:

```bash
python -m http.server 8080
# Open http://localhost:8080 in your browser
```

---

## 🛠️ Built With

- **HTML5** (Semantic structure & ARIA accessibility)
- **CSS3** (Glassmorphism, custom properties, responsive flexbox/grid)
- **JavaScript ES6+** (Web Audio API, HTML5 Canvas 2D)
- **JSON-LD / Schema.org** (Search engine & AI generative search optimization)

---

## 📄 License

This project is open source under the [MIT License](LICENSE).
