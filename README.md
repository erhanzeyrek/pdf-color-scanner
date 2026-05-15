# PDF Color Analytics 🎨

A high-precision Chrome Extension (Manifest V3) that enables visual color-based search and analytics within PDF documents. Pick any color directly from a PDF to instantly list and navigate to all matching text elements.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Manifest](https://img.shields.io/badge/manifest-v3-green)
![Tech](https://img.shields.io/badge/tech-React%20%7C%20TS%20%7C%20Vite-blueviolet)

## 🚀 Overview

PDF documents often store color information in complex ways (CMYK, Patterns, or Spot Colors) that standard text extractors fail to read accurately. **PDF Color Analytics** solves this by using a **Visual-First Extraction Engine**. It renders the document and samples actual pixels to find text matches exactly as they appear to the human eye.

## ✨ Key Features

- **Visual Color Picker**: Pick any pixel color directly from the PDF canvas with a built-in magnifier.
- **9-Point Grid Sampling**: Advanced sampling algorithm that ensures thin, small, or anti-aliased text (Red, Green, Blue, etc.) is never missed.
- **Interactive Side Panel**: List all matches grouped by page with instant navigation on click.
- **Adjustable Tolerance**: 
  - **Strict**: For exact color matches.
  - **Normal**: Optimal balance for most documents.
  - **Loose**: To capture shaded or complex rendered text.
- **Auto-Redirect**: Automatically detects and opens PDF URLs in the custom high-performance viewer.

## 🛠️ Tech Stack

- **Core**: React 18, TypeScript, Vite
- **PDF Engine**: PDF.js (v4+)
- **Styling**: Vanilla CSS (Premium Dark/Light UI)
- **Icons**: Lucide React
- **Build Tool**: Vite with custom Chrome Extension configuration

## 📦 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/pdf-color-picker.git
   cd pdf-color-picker
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Load in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked**.
   - Select the `dist` folder from this project directory.

## 📖 How to Use

1. Open any `.pdf` URL in Chrome or drag-and-drop a PDF into a new tab.
2. The extension will automatically open the document in the custom viewer.
3. Click the **Pick Color** button in the top toolbar.
4. Click on any colored text inside the PDF.
5. In the **Side Panel**, choose your desired tolerance and click **Scan Document**.
6. View the results and click on any item to navigate to its exact position.

## 🛡️ Security

- **Manifest V3 Compliant**: Uses strict Content Security Policy (CSP).
- **Minimal Permissions**: Requests only necessary host permissions for PDF interception.
- **Privacy**: All processing is done locally in your browser. No data is sent to any external server.

## 📄 License

This project is licensed under the MIT License.
