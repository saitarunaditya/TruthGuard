require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const { AssemblyAI } = require('assemblyai');
const { spawn } = require('child_process');
const stream = require('stream');
const { Buffer } = require('buffer');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const feedparser = require('feedparser-promised');
const winston = require('winston');
const stringSimilarity = require('string-similarity');
const NEWS_UPDATE_INTERVAL = 300000; // 5 minutes

// Initialize Express and WebSocket server
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

// Configure logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

// Constants and Configurations
const CREDIBILITY_RULES = {
    SUSPICIOUS_KEYWORDS: {
        SENSATIONALISM: [
            { word: 'shocking', weight: -8 },
            { word: 'unbelievable', weight: -7 },
            { word: 'sensational', weight: -6 },
            { word: 'breaking', weight: -5 },
            { word: 'exclusive', weight: -5 }
        ],
        CLICKBAIT: [
            { word: 'you won\'t believe', weight: -8 },
            { word: 'mind-blowing', weight: -7 },
            { word: 'viral', weight: -6 },
            { word: 'secret', weight: -5 }
        ],
        CONSPIRACY: [
            { word: 'conspiracy', weight: -8 },
            { word: 'exposed', weight: -7 },
            { word: 'they don\'t want you to know', weight: -8 },
            { word: 'hidden truth', weight: -7 }
        ]
    },
    CREDIBLE_INDICATORS: [
        { phrase: 'according to research', weight: 5 },
        { phrase: 'studies show', weight: 4 },
        { phrase: 'experts say', weight: 3 },
        { phrase: 'official statement', weight: 5 }
    ]
};
const NEWS_SOURCES = {
    RSS_FEEDS: [
        {
            url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms',
            name: 'Times of India',
            reliability: 0.8
        },
        {
            url: 'https://www.thehindu.com/news/national/feeder/default.rss',
            name: 'The Hindu',
            reliability: 0.85
        }
    ],
    GNEWS: {
        endpoint: 'https://gnews.io/api/v4/top-headlines',
        params: {
            country: 'in',
            lang: 'en',
            max: 10,
            token: process.env.GNEWS_API_KEY
        }
    }
};

// Cache Management
const cache = {
    audio: new Map(),
    liveStreams: new Map(),
    news: new Map(),
    analysisResults: new Map(),
    
    clearOldEntries(maxAge = 3600000) {
        const now = Date.now();
        [this.audio, this.news, this.analysisResults].forEach(cacheMap => {
            for (const [key, value] of cacheMap.entries()) {
                if (now - value.timestamp > maxAge) {
                    cacheMap.delete(key);
                }
            }
        });
    }
};

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize AssemblyAI
const assemblyAI = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY
});

// Utility Classes
class SlidingBuffer {
    constructor(maxDuration = 10) {
        this.maxDuration = maxDuration;
        this.chunks = [];
        this.totalDuration = 0;
    }

    addChunk(chunk, duration) {
        this.chunks.push({ chunk, duration });
        this.totalDuration += duration;

        while (this.totalDuration > this.maxDuration) {
            const removed = this.chunks.shift();
            this.totalDuration -= removed.duration;
        }
    }

    getBuffer() {
        return Buffer.concat(this.chunks.map(c => c.chunk));
    }

    clear() {
        this.chunks = [];
        this.totalDuration = 0;
    }
}

// Utility Functions
const bufferToStream = (buffer) => {
    const readable = new stream.Readable();
    readable._read = () => {};
    readable.push(buffer);
    readable.push(null);
    return readable;
};

const detectPlatform = (url) => {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();
        
        const platformMap = {
            'youtube.com': 'youtube',
            'youtu.be': 'youtube',
            'instagram.com': 'instagram',
            'facebook.com': 'facebook',
            'fb.com': 'facebook',
            'tiktok.com': 'tiktok',
            'twitter.com': 'twitter',
            'vimeo.com': 'vimeo'
        };

        for (const [key, value] of Object.entries(platformMap)) {
            if (domain.includes(key)) return value;
        }
        
        return 'unknown';
    } catch (error) {
        throw new Error('Invalid URL format');
    }
};

// Core Analysis Functions
const analyzeNewsCredibility = (text, metadata = {}) => {
    let score = 100;
    const detected_patterns = [];
    const analysis_details = {
        sensationalism: 0,
        clickbait: 0,
        conspiracy: 0,
        credible_indicators: 0
    };

    // Analyze text for suspicious patterns
    Object.entries(CREDIBILITY_RULES.SUSPICIOUS_KEYWORDS).forEach(([category, keywords]) => {
        keywords.forEach(({ word, weight }) => {
            const regex = new RegExp(word, 'gi');
            const matches = (text.match(regex) || []).length;
            
            if (matches > 0) {
                score += weight * matches;
                analysis_details[category.toLowerCase()] += matches;
                detected_patterns.push({
                    word,
                    category,
                    count: matches,
                    impact: weight * matches
                });
            }
        });
    });

    // Check for credible indicators
    CREDIBILITY_RULES.CREDIBLE_INDICATORS.forEach(({ phrase, weight }) => {
        const regex = new RegExp(phrase, 'gi');
        const matches = (text.match(regex) || []).length;
        
        if (matches > 0) {
            score += weight * matches;
            analysis_details.credible_indicators += matches;
            detected_patterns.push({
                phrase,
                category: 'CREDIBLE',
                count: matches,
                impact: weight * matches
            });
        }
    });

    // Text length analysis
    const text_length = text.split(/\s+/).length;
    if (text_length < 50) {
        score -= 15;
        detected_patterns.push({
            category: 'LENGTH',
            detail: 'Very short content',
            impact: -15
        });
    }

    // Source reliability adjustment
    if (metadata.source) {
        const sourceReliability = NEWS_SOURCES.RSS_FEEDS.find(
            s => metadata.source.toLowerCase().includes(s.url.toLowerCase())
        )?.reliability || 0.7;
        score *= sourceReliability;
    }

    // Normalize score
    score = Math.max(10, Math.min(score, 100));

    const result = {
        verdict: score > 70 ? 'Highly Credible' : score > 50 ? 'Somewhat Credible' : 'Low Credibility',
        confidence: Math.round(score),
        analysis_details,
        detected_patterns,
        metadata: {
            ...metadata,
            text_length,
            analysis_timestamp: new Date().toISOString()
        }
    };

    // Cache analysis result
    cache.analysisResults.set(text.substring(0, 100), {
        result,
        timestamp: Date.now()
    });

    return result;
};

// Video Processing Functions
const downloadVideo = async (url, isLive = false) => {
    try {
        const platform = detectPlatform(url);
        logger.info(`Detected platform: ${platform}`);

        const config = [
            '-x',
            '--audio-format', 'mp3',
            '--output', '-',
            '--no-playlist'
        ];

        if (isLive) {
            config.push('--live-from-start');
        }

        return new Promise((resolve, reject) => {
            const audioChunks = [];
            let isAudioData = false;

            const ytDlpProcess = spawn('yt-dlp', [...config, url]);

            ytDlpProcess.stdout.on('data', (chunk) => {
                isAudioData = true;
                audioChunks.push(chunk);
            });

            ytDlpProcess.stderr.on('data', (data) => {
                logger.info(`Download progress: ${data}`);
            });

            ytDlpProcess.on('close', (code) => {
                if (code === 0 && isAudioData) {
                    resolve({ 
                        audioBuffer: Buffer.concat(audioChunks),
                        platform 
                    });
                } else {
                    reject(new Error(`Download failed with code ${code}`));
                }
            });

            ytDlpProcess.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Failed to process ${url}: ${error.message}`);
    }
};

const processLiveStream = async (url, ws, language) => {
    const platform = detectPlatform(url);
    const slidingBuffer = new SlidingBuffer();
    let currentStream = null;

    try {
        const config = [
            '-x',
            '--audio-format', 'mp3',
            '--output', '-',
            '--no-playlist',
            '--live-from-start'
        ];

        currentStream = spawn('yt-dlp', [...config, url]);

        currentStream.stdout.on('data', async (chunk) => {
            try {
                slidingBuffer.addChunk(chunk, 1);

                if (slidingBuffer.totalDuration >= 10) {
                    const audioBuffer = slidingBuffer.getBuffer();
                    const audioFile = await assemblyAI.files.upload(bufferToStream(audioBuffer), {
                        fileName: 'live-stream.mp3',
                        contentType: 'audio/mp3'
                    });

                    const transcript = await assemblyAI.transcripts.transcribe({
                        audio: audioFile,
                        language_code: language
                    });

                    const analysis = analyzeNewsCredibility(transcript.text, {
                        type: 'live_stream',
                        platform,
                        timestamp: Date.now()
                    });

                    ws.send(JSON.stringify({
                        type: 'transcription',
                        text: transcript.text,
                        platform,
                        analysis,
                        timestamp: Date.now()
                    }));

                    slidingBuffer.clear();
                }
            } catch (error) {
                logger.error('Live stream processing error:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    error: 'Stream processing failed',
                    details: error.message
                }));
            }
        });

        currentStream.stderr.on('data', (data) => {
            logger.info(`${platform} stream progress: ${data}`);
        });

        return currentStream;
    } catch (error) {
        logger.error('Stream setup error:', error);
        throw error;
    }
};
const fetchGNewsArticles = async () => {
    try {
        const response = await axios.get(NEWS_SOURCES.GNEWS.endpoint, {
            params: NEWS_SOURCES.GNEWS.params
        });

        return response.data.articles.map(article => ({
            title: article.title,
            description: article.description,
            url: article.url,
            source: article.source.name,
            published: article.publishedAt
        }));
    } catch (error) {
        logger.error('GNews API Error:', error);
        return [];
    }
};



// Update fetchTrendingNews function
const fetchTrendingNews = async () => {
    try {
        const cachedNews = cache.news.get('trending');
        if (cachedNews && (Date.now() - cachedNews.timestamp < NEWS_UPDATE_INTERVAL)) {
            return cachedNews.data;
        }

        // Fetch RSS feeds
        const rssPromises = NEWS_SOURCES.RSS_FEEDS.map(async (source) => {
            try {
                const items = await feedparser.parse(source.url);
                return items.slice(0, 10).map(item => ({
                    title: item.title,
                    description: item.description || item.summary,
                    url: item.link,
                    source: source.name,
                    reliability: source.reliability,
                    published: item.pubDate
                }));
            } catch (error) {
                logger.error(`RSS feed error for ${source.name}:`, error);
                return [];
            }
        });

        // Combine RSS and GNews results
        const [rssResults, gnewsResults] = await Promise.all([
            Promise.all(rssPromises).then(results => results.flat()),
            fetchGNewsArticles()
        ]);

        const allNews = [...rssResults, ...gnewsResults];

        // Remove duplicates and analyze
        const uniqueNews = allNews.reduce((acc, current) => {
            const isDuplicate = acc.some(item => 
                stringSimilarity.compareTwoStrings(item.title, current.title) > 0.8
            );
            if (!isDuplicate) {
                const analysis = analyzeNewsCredibility(
                    `${current.title} ${current.description || ''}`,
                    { source: current.source, published: current.published }
                );
                acc.push({ ...current, analysis });
            }
            return acc;
        }, []);

        // Sort by credibility and recency
        const sortedNews = uniqueNews.sort((a, b) => {
            const timeWeight = 0.3;
            const credibilityWeight = 0.7;
            
            const timeA = new Date(a.published).getTime();
            const timeB = new Date(b.published).getTime();
            
            const timeScore = (timeA - timeB) * timeWeight;
            const credibilityScore = (a.analysis.confidence - b.analysis.confidence) * credibilityWeight;
            
            return (credibilityScore + timeScore) * -1; // Descending order
        });

        const result = sortedNews.slice(0, 15);
        
        cache.news.set('trending', {
            data: result,
            timestamp: Date.now()
        });

        return result;
    } catch (error) {
        logger.error('Error in fetchTrendingNews:', error);
        return [];
    }
};

// Add new endpoint for news sources
app.get('/api/news-sources', (req, res) => {
    const sources = NEWS_SOURCES.RSS_FEEDS.map(source => ({
        name: source.name,
        url: source.url
    }));
    sources.push({ name: 'GNews', url: 'https://gnews.io/' });
    
    res.json(sources);
});


// API Routes
app.post('/api/analyze-text', async (req, res) => {
    const { text, language = 'en' } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        const analysis = analyzeNewsCredibility(text, {
            type: 'manual_input',
            language
        });

        res.json({
            text,
            analysis,
            success: true
        });
    } catch (error) {
        logger.error('Text analysis error:', error);
        res.status(500).json({
            error: 'Failed to analyze text',
            details: error.message
        });
    }
});

app.post('/api/transcribe-recorded', async (req, res) => {
    const { video_url, language = 'en' } = req.body;

    if (!video_url) {
        return res.status(400).json({ error: 'Video URL is required' });
    }

    try {
        const { audioBuffer, platform } = await downloadVideo(video_url, false);
        const cacheKey = `${platform}-${Date.now()}`;
        cache.audio.set(cacheKey, {
            buffer: audioBuffer,
            timestamp: Date.now()
        });

        const audioFile = await assemblyAI.files.upload(bufferToStream(audioBuffer), {
            fileName: 'audio.mp3',
            contentType: 'audio/mp3'
        });

        const transcript = await assemblyAI.transcripts.transcribe({
            audio: audioFile,
            language_code: language
        });

        const analysis = analyzeNewsCredibility(transcript.text, {
            type: 'recorded_video',
            platform,
            url: video_url
        });

        cache.audio.delete(cacheKey);

        res.json({
            text: transcript.text,
            platform,
            analysis,
            success: true
        });
    } catch (error) {
        logger.error('Transcription Error:', error);
        res.status(500).json({
            error: 'Failed to transcribe video',
            details: error.message,
            platform: detectPlatform(video_url)
        });
    }
});



// Add SSE endpoint for real-time news updates
app.get('/api/news-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendNews = async () => {
        try {
            const news = await fetchTrendingNews();
            res.write(`data: ${JSON.stringify(news)}\n\n`);
        } catch (error) {
            logger.error('News stream error:', error);
        }
    };

    const newsInterval = setInterval(sendNews, NEWS_UPDATE_INTERVAL);
    sendNews(); // Initial news send

    req.on('close', () => {
        clearInterval(newsInterval);
    });
});


app.get('/api/trending-news', async (req, res) => {
    try {
        const news = await fetchTrendingNews();
        res.json(news);
    } catch (error) {
        logger.error('Error fetching trending news:', error);
        res.status(500).json({
            error: 'Failed to fetch trending news',
            details: error.message
        });
    }
});

app.post('/api/clear-cache', (req, res) => {
    cache.clearOldEntries();
    res.json({ message: 'Cache cleared successfully' });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        cache_stats: {
            audio: cache.audio.size,
            news: cache.news.size,
            analysis: cache.analysisResults.size
        }
    });
});

// WebSocket Handler
wss.on('connection', (ws) => {
    logger.info('New WebSocket connection established');
    let currentStream = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start_live') {
                const platform = detectPlatform(data.url);
                logger.info(`Starting live stream processing for ${platform}:`, data.url);

                if (currentStream) {
                    currentStream.kill();
                }

                currentStream = await processLiveStream(data.url, ws, data.language);
                const streamKey = `${platform}-live-${Date.now()}`;
                cache.liveStreams.set(streamKey, currentStream);

                ws.send(JSON.stringify({
                    type: 'status',
                    message: `Live stream processing started for ${platform}`,
                    platform
                }));
            }
        } catch (error) {
            logger.error('WebSocket message error:', error);
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Failed to process message',
                details: error.message
            }));
        }
    });

    ws.on('close', () => {
        logger.info('WebSocket connection closed');
        if (currentStream) {
            currentStream.kill();
        }
    });

    // Send initial connection success message
    ws.send(JSON.stringify({
        type: 'status',
        message: 'Connected to transcription service'
    }));
});

// Error Handler
app.use((err, req, res, next) => {
    logger.error('Server Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        details: err.message
    });
});

// Periodic Cache Cleanup
setInterval(() => {
    cache.clearOldEntries();
}, 3600000); // Clean every hour

// Graceful Shutdown
const gracefulShutdown = () => {
    logger.info('Initiating graceful shutdown...');
    
    // Close all live streams
    cache.liveStreams.forEach(stream => stream.kill());
    
    // Clear all caches
    cache.audio.clear();
    cache.news.clear();
    cache.analysisResults.clear();
    cache.liveStreams.clear();
    
    // Close server
    server.close(() => {
        logger.info('Server shut down complete');
        process.exit(0);
    });
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start Server
server.listen(PORT, () => {
    logger.info(`Server running at http://localhost:${PORT}`);
});

module.exports = { app, server };