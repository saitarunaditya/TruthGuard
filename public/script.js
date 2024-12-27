// Configuration
const CONFIG = {
    WS_URL: 'ws://localhost:3000',
    API_URL: 'http://localhost:3000',
    MAX_RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY: 2000,
    ERROR_DISPLAY_DURATION: 5000
};

// DOM Elements Management
const elements = (() => {
    const get = (id) => document.getElementById(id);
    
    return {
        form: get('transcriptionForm'),
        videoType: get('videoType'),
        videoUrl: get('videoUrl'),
        language: get('language'),
        startButton: get('startTranscription'),
        stopButton: get('stopTranscription'),
        loadingMessage: get('loadingMessage'),
        transcriptionResult: get('transcriptionResult'),
        errorMessage: get('errorMessage'),
        statusMessage: get('statusMessage'),
        factCheckResult: get('factCheckResult'),
        trendingNews: get('trendingNews'),
        textInput: get('textInput'),
        confidenceChart: get('confidenceChart')
    };
})();

// State Management
const state = {
    ws: null,
    isLiveTranscribing: false,
    reconnectAttempts: 0,
    currentChartInstance: null
};

// UI Update Functions
const UI = {
    showError(message, duration = CONFIG.ERROR_DISPLAY_DURATION) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm sm:text-base z-50 animate-fade-in';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);

        setTimeout(() => {
            errorDiv.classList.add('animate-fade-out');
            setTimeout(() => errorDiv.remove(), 300);
        }, duration);
    },

    showStatus(message, isError = false) {
        const statusDiv = document.createElement('div');
        statusDiv.className = `fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg text-sm sm:text-base z-50 animate-fade-in ${
            isError ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`;
        statusDiv.textContent = message;
        document.body.appendChild(statusDiv);

        setTimeout(() => {
            statusDiv.classList.add('animate-fade-out');
            setTimeout(() => statusDiv.remove(), 300);
        }, 3000);
    },

    showLoading(show) {
        elements.loadingMessage.classList.toggle('hidden', !show);
        elements.startButton.disabled = show;
        if (show) {
            elements.startButton.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            elements.startButton.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    },

    updateTranscription(text, append = false) {
        if (append) {
            const newParagraph = document.createElement('p');
            newParagraph.textContent = text;
            newParagraph.className = 'mb-2 p-2 bg-white rounded text-sm sm:text-base';
            elements.transcriptionResult.appendChild(newParagraph);
            elements.transcriptionResult.scrollTop = elements.transcriptionResult.scrollHeight;
        } else {
            elements.transcriptionResult.innerHTML = `<p class="mb-2 p-2 bg-white rounded text-sm sm:text-base">${text}</p>`;
        }
    },

    clearTranscription() {
        elements.transcriptionResult.innerHTML = '';
        elements.factCheckResult.innerHTML = '';
        if (state.currentChartInstance) {
            Plotly.purge(elements.confidenceChart);
            state.currentChartInstance = null;
        }
    },

    updateFactCheck(analysis) {
        if (!analysis) return;

        const confidenceBgColor = 
            analysis.confidence > 70 ? 'bg-green-50' :
            analysis.confidence > 50 ? 'bg-yellow-50' : 'bg-red-50';
        
        const confidenceTextColor =
            analysis.confidence > 70 ? 'text-green-600' :
            analysis.confidence > 50 ? 'text-yellow-600' : 'text-red-600';

        elements.factCheckResult.innerHTML = `
            <div class="space-y-4">
                <div class="p-4 rounded-lg ${confidenceBgColor}">
                    <h3 class="font-bold text-lg mb-2">Content Analysis</h3>
                    <div class="flex flex-col gap-2">
                        <div class="flex justify-between items-center">
                            <span class="font-medium">Credibility Score:</span>
                            <span class="${confidenceTextColor} font-bold">${analysis.confidence}%</span>
                        </div>
                        <div class="text-sm font-medium">
                            Verdict: ${analysis.verdict}
                        </div>
                    </div>
                </div>
                
                ${analysis.detected_patterns.length > 0 ? `
                    <div class="mt-4">
                        <h4 class="font-semibold mb-2">Detected Patterns:</h4>
                        <div class="space-y-2">
                            ${analysis.detected_patterns.map(pattern => `
                                <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
                                    <span class="font-medium">${pattern.pattern}</span>
                                    <span class="font-mono ${pattern.impact > 0 ? 'text-green-600' : 'text-red-600'}">
                                        ${pattern.impact > 0 ? '+' : ''}${pattern.impact}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        this.createConfidenceChart(analysis.confidence);
    },

    createConfidenceChart(confidence) {
        if (!elements.confidenceChart) return;

        const data = [{
            type: 'indicator',
            mode: 'gauge+number',
            value: confidence,
            title: { text: 'Credibility Score' },
            gauge: {
                axis: { range: [0, 100] },
                bar: { color: `hsl(${confidence * 1.2}, 70%, 50%)` },
                bgcolor: 'white',
                borderwidth: 2,
                bordercolor: '#ddd',
                steps: [
                    { range: [0, 50], color: '#fee2e2' },
                    { range: [50, 70], color: '#fef3c7' },
                    { range: [70, 100], color: '#dcfce7' }
                ],
                threshold: {
                    line: { color: 'black', width: 4 },
                    thickness: 0.75,
                    value: confidence
                }
            }
        }];

        const layout = {
            width: elements.confidenceChart.offsetWidth,
            height: 250,
            margin: { t: 25, r: 25, l: 25, b: 25 },
            paper_bgcolor: 'rgba(0,0,0,0)',
            font: { size: 12 }
        };

        const config = {
            responsive: true,
            displayModeBar: false
        };

        if (state.currentChartInstance) {
            Plotly.purge(elements.confidenceChart);
        }

        Plotly.newPlot(elements.confidenceChart, data, layout, config)
            .then(() => {
                state.currentChartInstance = elements.confidenceChart;
            });

        window.addEventListener('resize', () => {
            if (state.currentChartInstance) {
                Plotly.relayout(elements.confidenceChart, {
                    width: elements.confidenceChart.offsetWidth
                });
            }
        });
    },

    createConfidenceChart(confidence) {
        const createResponsiveLayout = () => ({
            paper_bgcolor: 'rgba(0,0,0,0)',
            height: window.innerWidth < 640 ? 250 : 300,
            margin: { 
                t: window.innerWidth < 640 ? 5 : 10, 
                b: window.innerWidth < 640 ? 5 : 10, 
                l: window.innerWidth < 640 ? 5 : 10, 
                r: window.innerWidth < 640 ? 5 : 10 
            },
            annotations: [{
                font: {
                    size: window.innerWidth < 640 ? 16 : 20,
                    color: `hsl(${confidence * 1.2}, 70%, 50%)`
                },
                showarrow: false,
                text: `${confidence}%`,
                x: 0.5,
                y: 0.5
            }]
        });

        const data = [{
            values: [confidence, 100 - confidence],
            labels: ['Confidence', 'Uncertainty'],
            type: 'pie',
            hole: 0.6,
            textinfo: 'label+percent',
            textposition: 'outside',
            automargin: true,
            marker: {
                colors: [
                    `hsl(${confidence * 1.2}, 70%, 50%)`,
                    'rgb(240, 240, 240)'
                ]
            },
            hovertemplate: '%{label}<br>%{value:.1f}%<extra></extra>',
            direction: 'clockwise',
            showlegend: false
        }];

        const config = {
            responsive: true,
            displayModeBar: false
        };

        if (state.currentChartInstance) {
            Plotly.purge(elements.confidenceChart);
        }

        Plotly.newPlot(elements.confidenceChart, data, createResponsiveLayout(), config).then(() => {
            state.currentChartInstance = elements.confidenceChart;
            
            Plotly.animate(elements.confidenceChart, 
                { data: [{ rotation: 90 }] },
                {
                    transition: { duration: 1000, easing: 'cubic-in-out' },
                    frame: { duration: 1000 }
                }
            );
        });

        window.removeEventListener('resize', handleResize);
        window.addEventListener('resize', handleResize);
        
        function handleResize() {
            Plotly.relayout(elements.confidenceChart, createResponsiveLayout());
        }
    },

    updateTrendingNews(news) {
        elements.trendingNews.innerHTML = news.map(article => `
            <div class="mb-3 sm:mb-4 p-3 sm:p-4 bg-white rounded-lg shadow-sm border border-gray-200">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    <h3 class="text-base sm:text-lg font-semibold">${article.title}</h3>
                    <span class="text-xs sm:text-sm text-gray-500">
                        ${new Date(article.published).toLocaleDateString()}
                    </span>
                </div>
                <p class="text-sm sm:text-base text-gray-600 mt-2">${article.description}</p>
                <div class="mt-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                    <span class="text-xs sm:text-sm font-medium ${
                        article.analysis.confidence > 70 ? 'text-green-600' : 
                        article.analysis.confidence > 50 ? 'text-yellow-600' : 'text-red-600'
                    }">
                        Credibility: ${article.analysis.confidence}%
                    </span>
                    <a href="${article.url}" target="_blank" 
                       class="text-blue-500 hover:underline text-xs sm:text-sm">
                        Read more →
                    </a>
                </div>
            </div>
        `).join('');
    },

    updateNewsSources(sources) {
        const sourcesContainer = document.getElementById('newsSources');
        if (sourcesContainer) {
            sourcesContainer.innerHTML = sources.map(source => `
                <div class="mb-2 p-2 bg-gray-50 rounded">
                    <a href="${source.url}" target="_blank" 
                       class="text-blue-600 hover:underline text-sm sm:text-base">
                        ${source.name}
                    </a>
                </div>
            `).join('');
        }
    }
};

// WebSocket Management
const WebSocketManager = {
    setup() {
        if (state.ws) {
            state.ws.close();
        }

        state.ws = new WebSocket(CONFIG.WS_URL);
        this.attachEventListeners();
    },

    attachEventListeners() {
        state.ws.onopen = () => {
            console.log('WebSocket connection established');
            UI.showStatus('Connected to transcription service');
            state.reconnectAttempts = 0;
        };

        state.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
                UI.showError('Error processing transcription data');
            }
        };

        state.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            UI.showError('Connection error. Please try again.');
        };

        state.ws.onclose = () => {
            console.log('WebSocket connection closed');
            this.handleDisconnect();
        };
    },

    handleMessage(data) {
        switch (data.type) {
            case 'transcription':
                UI.updateTranscription(data.text, true);
                if (data.analysis) {
                    UI.updateFactCheck(data.analysis);
                }
                break;
            case 'status':
                UI.showStatus(data.message);
                break;
            case 'error':
                UI.showError(data.error);
                break;
        }
    },

    handleDisconnect() {
        if (state.isLiveTranscribing && state.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
            state.reconnectAttempts++;
            UI.showStatus(
                `Connection lost. Attempting to reconnect... (${state.reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`,
                true
            );
            setTimeout(() => this.setup(), CONFIG.RECONNECT_DELAY * state.reconnectAttempts);
        } else if (state.reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
            UI.showError('Maximum reconnection attempts reached. Please refresh the page.');
            TranscriptionManager.stopLive();
        }
    }
};

// API Functions
const API = {
    async transcribeRecorded(videoUrl, language) {
        const response = await fetch(`${CONFIG.API_URL}/api/transcribe-recorded`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ video_url: videoUrl, language })
        });

        if (!response.ok) {
            throw new Error('Failed to transcribe video');
        }

        return response.json();
    },

    async analyzeText(text, language) {
        const response = await fetch(`${CONFIG.API_URL}/api/analyze-text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, language })
        });

        if (!response.ok) {
            throw new Error('Failed to analyze text');
        }

        return response.json();
    },

    async fetchTrendingNews() {
        const response = await fetch(`${CONFIG.API_URL}/api/trending-news`);
        if (!response.ok) {
            throw new Error('Failed to fetch trending news');
        }
        return response.json();
    },

    async getNewsSources() {
        const response = await fetch(`${CONFIG.API_URL}/api/news-sources`);
        if (!response.ok) {
            throw new Error('Failed to fetch news sources');
        }
        return response.json();
    },

    setupNewsStream() {
        const eventSource = new EventSource(`${CONFIG.API_URL}/api/news-stream`);
        
        eventSource.onmessage = (event) => {
            try {
                const news = JSON.parse(event.data);
                UI.updateTrendingNews(news);
            } catch (error) {
                console.error('Error processing news stream:', error);
            }
        };

        eventSource.onerror = (error) => {
            console.error('News stream error:', error);
            eventSource.close();
            setTimeout(() => this.setupNewsStream(), CONFIG.RECONNECT_DELAY);
        };

        return eventSource;
    }
};

// Transcription Management
const TranscriptionManager = {
    async handleRecorded(videoUrl, language) {
        try {
            const data = await API.transcribeRecorded(videoUrl, language);
            UI.updateTranscription(data.text);
            UI.updateFactCheck(data.analysis);
            UI.showStatus('Transcription completed successfully');
        } catch (error) {
            console.error('Transcription error:', error);
            UI.showError(error.message);
        } finally {
            UI.showLoading(false);
        }
    },

    startLive(videoUrl, language) {
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
            WebSocketManager.setup();
        }

        state.isLiveTranscribing = true;
        elements.stopButton.classList.remove('hidden');
        elements.startButton.classList.add('hidden');

        state.ws.send(JSON.stringify({
            type: 'start_live',
            url: videoUrl,
            language
        }));

        UI.showStatus('Live transcription started');
    },

    stopLive() {
        state.isLiveTranscribing = false;
        elements.stopButton.classList.add('hidden');
        elements.startButton.classList.remove('hidden');

        if (state.ws) {
            state.ws.close();
            state.ws = null;
        }

        UI.showStatus('Live transcription stopped');
    },

    async handleTextAnalysis(text, language) {
        try {
            const data = await API.analyzeText(text, language);
            UI.updateTranscription(data.text);
            UI.updateFactCheck(data.analysis);
            UI.showStatus('Text analysis completed successfully');
        } catch (error) {
            console.error('Text analysis error:', error);
            UI.showError(error.message);
        } finally {
            UI.showLoading(false);
        }
    }
};

// Initialize the application
const initializeApp = async () => {
    WebSocketManager.setup();
    
    // Form submission
    elements.form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const videoType = elements.videoType.value;
        const language = elements.language.value;
        const input = videoType === 'text' ? elements.textInput.value.trim() : elements.videoUrl.value.trim();

        if (!input) {
            UI.showError(videoType === 'text' ? 'Please enter text for analysis' : 'Please enter a valid URL');
            return;
        }

        UI.clearTranscription();
        UI.showLoading(true);

        switch (videoType) {
            case 'recorded':
                await TranscriptionManager.handleRecorded(input, language);
                break;
                case 'live':
                    TranscriptionManager.startLive(input, language);
                    break;
                case 'text':
                    await TranscriptionManager.handleTextAnalysis(input, language);
                    break;
            }
        });
    
        // Stop button
        elements.stopButton.addEventListener('click', () => {
            TranscriptionManager.stopLive();
        });
    
        // Video type change handler
        elements.videoType.addEventListener('change', (e) => {
            const isText = e.target.value === 'text';
            elements.videoUrl.parentElement.classList.toggle('hidden', isText);
            elements.textInput.parentElement.classList.toggle('hidden', !isText);
            elements.startButton.textContent = isText ? 'Analyze Text' : 'Start Transcription';
        });
    
        // Initialize news features
        try {
            const [news, sources] = await Promise.all([
                API.fetchTrendingNews(),
                API.getNewsSources()
            ]);
            
            UI.updateTrendingNews(news);
            UI.updateNewsSources(sources);
            API.setupNewsStream();
        } catch (error) {
            console.error('Error initializing news features:', error);
            UI.showError('Failed to load news content');
        }
    };

    
    // Start the application
    document.addEventListener('DOMContentLoaded', initializeApp);
