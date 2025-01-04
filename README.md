# News Analysis and Transcription Application

This application transcribes news videos, analyzes their content, and provides insights using AssemblyAI, GNews API, and other tools.

## Prerequisites
1. **Node.js** and **npm**
   - Install from [Node.js official website](https://nodejs.org).
2. **FFmpeg**
   - Install as per the instructions below.
3. **yt-dlp**
   - Install as per the instructions below.
4. **API Keys**
   - Get the required API keys:
     - `ASSEMBLYAI_API_KEY` from [AssemblyAI](https://www.assemblyai.com).
     - `RAPIDAPI_KEY` from [RapidAPI](https://rapidapi.com).
     - `GNEWS_API_KEY` from [GNews](https://gnews.io).

## Installation Steps

### 1. Install Node.js Dependencies
Run the following command in your terminal:
```bash
npm install dotenv express ws assemblyai child_process stream buffer cors axios feedparser-promised winston string-similarity body-parser
```

### 2. Install FFmpeg
#### Windows:
1. Download FFmpeg from [FFmpeg official website](https://ffmpeg.org/download.html).
2. Extract the downloaded file to `C:\Program Files\FFmpeg`.
3. Add `C:\Program Files\FFmpeg\bin` to your system PATH.

#### Mac:
```bash
brew install ffmpeg
```

#### Linux:
```bash
sudo apt update
sudo apt install ffmpeg
```

### 3. Install yt-dlp
#### Windows:
```bash
pip install yt-dlp
```

#### Mac:
```bash
brew install yt-dlp
```

#### Linux:
```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

### 4. Create the Project Structure
Run the following commands:
```bash
mkdir news-analysis-app
cd news-analysis-app
mkdir public
```

### 5. Create the `.env` File
Create a `.env` file in the root of your project and add the following content:
```plaintext
RAPIDAPI_KEY=3aed4a5ebcmshc109ea93e2679c4p19a892jsncc647df6f33c
ASSEMBLYAI_API_KEY=65b55c9aed184a39bfe0542a8a8485d0
FFMPEG_PATH=C:\\Program Files\\FFmpeg\\bin
GNEWS_API_KEY=9efdd7dadf654c4da9f1e5042a92fe11
PORT=3000
```
> **Note**: Replace the placeholder API keys with your actual credentials.

### 6. Add the Frontend and Backend Code
- Save the frontend JavaScript file as `public/index.js`.
- Save the backend JavaScript file as `server.js` in the root directory.

### 7. Create a Basic HTML File
Save the following content as `public/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>News Analysis App</title>
  <script src="index.js" defer></script>
</head>
<body>
  <h1>News Analysis and Transcription</h1>
  <p>Welcome to the news analysis application!</p>
</body>
</html>
```

### 8. Start the Server
Run the following command:
```bash
node server.js
```
The application should now be running at [http://localhost:3000](http://localhost:3000).

## Notes
1. Ensure all system dependencies (Node.js, FFmpeg, yt-dlp) are properly installed and accessible from the PATH.
2. Keep API keys secure and do not share them publicly.
3. A stable internet connection is required for streaming and API access.
4. Monitor logs (`combined.log` and `error.log`) for debugging any issues.

   
## Demo Video

[Click to Watch on YouTube]([https://youtu.be/Ykl_I94HKnM?si=OuXYoHpLoIbfLwfO](https://youtu.be/Ykl_I94HKnM?si=OuXYoHpLoIbfLwfO))
## Logs
- Application logs are stored in `combined.log`.
- Error logs are stored in `error.log`.

## Contributing
Feel free to raise issues or contribute by submitting pull requests to enhance this application.

---
Happy analyzing!
