# AI Search API

A natural language search normalizer API that transforms voice/text queries into optimized search terms using LLM technology. This service helps convert conversational search requests into structured search parameters with entity extraction, intent detection, and clarification handling.

## Features

- 🤖 **Multiple LLM Providers**: Support for local models (Ollama, vLLM), Groq cloud API, or mock provider
- 🔍 **Smart Search Normalization**: Converts natural language to structured search queries
- 💬 **Conversation Support**: Multi-turn conversations with context awareness
- 🎯 **Intent Detection**: Identifies search, clarification, or off-topic intents
- 🌍 **Multi-locale Support**: Handles different languages and regions
- 📱 **Platform Awareness**: Optimizes for web, iOS, Android, or TV platforms
- 🧪 **Test UI**: Built-in web interface for testing

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** (comes with Node.js)
- **LLM Provider** (choose one):
  - Local: [Ollama](https://ollama.ai/) or [vLLM](https://github.com/vllm-project/vllm)
  - Cloud: [Groq API](https://console.groq.com) (free tier available)
  - Mock: No LLM required (for testing)

## Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd ai-search-api
npm install
```

### 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and choose your LLM provider:

**Option A: Local LLM (Ollama)**
```env
LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
LOCAL_LLM_MODEL=qwen2.5:7b
```

**Option B: Groq Cloud API**
```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
```

**Option C: Mock Provider (Testing)**
```env
LLM_PROVIDER=mock
```

### 3. Run the Application

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000`

### 4. Test the API

Open your browser and navigate to:
```
http://localhost:3000
```

You'll see the test UI where you can try natural language queries.

## API Usage

### Normalize Search Query

**Endpoint:** `POST /api/normalize`

**Request:**
```json
{
  "user_request": "Show me funny detective shows",
  "locale": "en-US",
  "platform": "web",
  "conversation_id": "optional-conversation-id",
  "include_debug": true
}
```

**Response:**
```json
{
  "validation_status": "valid",
  "intent": "search",
  "confidence": 0.95,
  "search_terms": ["detective", "comedy"],
  "filters": {
    "genres": ["comedy", "mystery"],
    "content_type": ["series"]
  },
  "conversation_id": "uuid-here"
}
```

### Health Check

**Endpoint:** `GET /health`

Returns server health status.

## Development

### Available Scripts

- `npm run dev` - Start development server with auto-reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint (if configured)

### Project Structure

```
ai-search-api/
├── src/
│   ├── app.ts              # Fastify app setup
│   ├── server.ts           # Server entry point
│   ├── config/             # Configuration
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── llm/                # LLM provider implementations
│   ├── prompts/            # LLM prompts
│   ├── utils/              # Utilities
│   └── validation/         # Request/response validation
├── public/                 # Test UI files
├── dist/                   # Compiled JavaScript (generated)
└── package.json
```

## Deployment

### Docker

Build and run with Docker:

```bash
docker build -t ai-search-api .
docker run -p 3000:3000 -e GROQ_API_KEY=your_key ai-search-api
```

### Fly.io

Deploy to Fly.io:

```bash
fly launch --copy-config --no-deploy
fly secrets set GROQ_API_KEY=your_key
fly deploy
```

### Render

The project includes a `render.yaml` configuration. Connect your repository to Render and it will auto-deploy.

## Environment Variables

See `.env.example` for all available configuration options including:

- Server settings (PORT, NODE_ENV, LOG_LEVEL)
- LLM provider selection and configuration
- Model parameters (timeout, max tokens, temperature)
- Debug and logging controls

## License

ISC

