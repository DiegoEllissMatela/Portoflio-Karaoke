# DNM Karaoke — Interactive Web Karaoke & Audio Intelligence Pipeline

A full-stack interactive karaoke web application featuring real-time lyric synchronization, gamified voice scoring, and an automated Python audio-processing pipeline for vocal removal and lyric alignment.

## Overview

DNM Karaoke provides a browser-based karaoke singing experience with synchronized word-by-word lyric tracking and real-time pitch/voice evaluation. The web application runs in React 19 and Vite, backed by an offline Python audio pipeline that isolates instrumentals and aligns lyric timestamps using AI speech recognition models.

## Architecture and Key Features

### 1. Browser-Based Voice Scoring (Web Speech API)
- Leverages the browser's native `SpeechRecognition` interface to capture singing vocals in real time.
- Implements Levenshtein fuzzy string distance matching to score player accuracy against expected lyric tokens, forgiving minor transcription discrepancies.

### 2. Automated Python Audio Pipeline
- **Vocal Retraction:** Separates music from vocals using specialized PyTorch and Torchaudio models.
- **Lyric Alignment:** Processes vocal tracks with OpenAI Whisper to transcribe and generate time-synchronized LRC lyric datasets with sub-second accuracy.

### 3. Front-End Engineering
- Built with React 19, TypeScript, and Vite for fast development and rendering performance.
- Styled using SCSS Modules with strict token separation.
- Progressive Web App (PWA) configuration with service workers for offline caching and audio asset preloading.

## Live Demo

- **Hosted on Vercel:** [https://portfolio-karaoke.vercel.app/](https://portfolio-karaoke.vercel.app/)

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, SCSS Modules
- **Browser APIs:** Web Speech API, Web Audio API, PWA Service Workers
- **Audio Pipeline:** Python 3, PyTorch, Torchaudio, OpenAI Whisper
- **Algorithms:** Levenshtein Distance Matching, LRC Timestamp Parser
- **Deployment:** Vercel
