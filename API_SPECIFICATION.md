# AI Search Normalizer API - Technical Specification

## Overview

The AI Search Normalizer API transforms natural language queries into structured search parameters using Large Language Models (LLMs). It provides intelligent query normalization, clarification handling, and multi-turn conversation support for search applications.

**Key Capabilities:**
- Natural language to search term conversion
- Multi-turn conversation with context preservation
- Intelligent clarification when queries are ambiguous
- Fallback term generation for zero-result scenarios
- Multiple LLM provider support (local, cloud, mock)
- Input validation and sanitization
- Comprehensive debug information

---

## Architecture

### Technology Stack
- **Runtime:** Node.js 20+
- **Framework:** Fastify 5.x
- **Language:** TypeScript 5.x
- **Validation:** Zod
- **LLM Providers:** OpenAI-compatible APIs (Groq, Ollama, vLLM, llama.cpp)

### Project Structure
```
src/
├── app.ts                          # Fastify app setup
├── server.ts                       # Server entry point
├── config/
│   └── env.ts                      # Environment configuration
├── routes/
│   └── searchNormalization.ts      # API routes
├── services/
│   └── searchNormalizationService.ts  # Business logic
├── llm/
│   ├── QueryNormalizerModel.ts     # LLM interface
│   └── providers/
│       ├── localQueryNormalizer.ts # Local LLM (Ollama/vLLM)
│       ├── groqQueryNormalizer.ts  # Groq cloud API
│       └── mockQueryNormalizer.ts  # Mock for testing
├── prompts/
│   └── queryNormalizerPrompt.ts    # LLM prompts & examples
├── conversation/
│   └── conversationStore.ts        # In-memory conversation state
├── validation/
│   ├── requestSchemas.ts           # Request validation
│   ├── responseSchemas.ts          # Response validation
│   └── outputGuards.ts             # Output sanitization
├── fallback/
│   └── fallbackNormalizer.ts       # Fallback response generation
└── utils/
    ├── logger.ts                   # Pino logger
    ├── sanitize.ts                 # Input/output sanitization
    └── timing.ts                   # Performance timing
```

---

## API Endpoints

### 1. Search Normalization

**Endpoint:** `POST /v1/search-normalization`

Normalizes a natural language query into structured search parameters.

**Request Body:**
```json
{
  "user_request": "Show me funny detective shows",
  "locale": "en-US",
  "platform": "web",
  "conversation_id": "optional-uuid",
  "user_id": "optional-user-id",
  "request_id": "optional-request-id",
  "debug": false
}
```

**Request Schema:**
| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `user_request` | string | Yes | - | 1-500 chars, non-empty |
| `locale` | string | No | `"en-US"` | BCP 47 locale tag |
| `platform` | enum | No | - | `ios`, `android`, `web`, `tv`, `other` |
| `conversation_id` | string | No | auto-generated | UUID format |
| `user_id` | string | No | - | For future personalization |
| `request_id` | string | No | auto-generated | For request tracing |
| `debug` | boolean | No | `false` | Include debug info in response |

**Response (Success - Search Intent):**
```json
{
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
  "search_term": "detective, comedy",
  "fallback_terms": ["detective", "comedy"],
  "assistant_message": "Looking for comedy detective shows.",
  "needs_clarification": false,
  "clarification_question": null,
  "clarification_type": null,
  "clarification_options": null,
  "confidence": 0.92,
  "intent": "search",
  "validation_status": "valid"
}
```

**Response (Clarification Needed):**
```json
{
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
  "search_term": null,
  "fallback_terms": [],
  "assistant_message": "I need more information.",
  "needs_clarification": true,
  "clarification_question": "Do you want a comedy movie or a comedy series?",
  "clarification_type": "content_type",
  "clarification_options": ["Movie", "Series"],
  "confidence": 0.75,
  "intent": "clarification",
  "validation_status": "valid"
}
```

**Response (With Debug Info):**
```json
{
  "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
  "search_term": "horror",
  "fallback_terms": ["thriller", "scary"],
  "assistant_message": "Searching for horror titles.",
  "needs_clarification": false,
  "clarification_question": null,
  "clarification_type": null,
  "clarification_options": null,
  "confidence": 0.88,
  "intent": "search",
  "validation_status": "valid",
  "debug": {
    "raw_model_output": { /* LLM raw response */ },
    "validation_errors": [],
    "fallback_applied": false,
    "timings_ms": {
      "llm": 245,
      "validation": 2,
      "total": 250
    }

**Response Schema:**
| Field | Type | Description |
|-------|------|-------------|
| `conversation_id` | string | UUID for conversation tracking |
| `search_term` | string \| null | Normalized search query (null if clarification needed) |
| `fallback_terms` | string[] | Alternative search terms (ordered: specific → broad) |
| `assistant_message` | string | User-facing message (max 200 chars) |
| `needs_clarification` | boolean | Whether clarification is required |
| `clarification_question` | string \| null | Question to ask user (if clarification needed) |
| `clarification_type` | enum \| null | Type: `content_type`, `actor_ambiguity`, `genre_ambiguity`, `similarity`, `other` |
| `clarification_options` | string[] \| null | Suggested options for user to choose from |
| `confidence` | number | Confidence score (0.0 - 1.0) |
| `intent` | enum | `search` or `clarification` |
| `validation_status` | enum | `valid` or `fallback` |
| `debug` | object \| undefined | Debug information (only if `debug: true` in request) |

**Error Responses:**

*400 Bad Request - Invalid Input:*
```json
{
  "error": "Invalid request",
  "details": [
    {
      "field": "user_request",
      "message": "user_request must be at most 500 characters"
    }
  ]
}
```

*500 Internal Server Error:*
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

### 2. Health Check

**Endpoint:** `GET /health`

Returns server health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-03-18T19:30:00.000Z"
}
```

---

### 3. Readiness Check

**Endpoint:** `GET /ready`

Returns server readiness status.

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2024-03-18T19:30:00.000Z"
}
```

---

## Multi-Turn Conversations

### Conversation Flow

The API supports multi-turn conversations for clarification handling:

1. **Initial Request:** User sends ambiguous query
2. **Clarification:** API responds with clarification question
3. **User Reply:** User answers using same `conversation_id`
4. **Resolution:** API combines context and returns final search term

### Conversation State

Each conversation maintains:
- `conversation_id`: Unique identifier
- `last_user_request`: Previous user input
- `last_search_term_candidate`: Candidate search term
- `clarification_pending`: Whether clarification is active
- `clarification_type`: Type of clarification
- `clarification_options`: Available options
- `clarification_question`: Question asked
- `timestamp`: Last update time

**State Expiration:** Conversations expire after 60 seconds of inactivity.

### Example: Multi-Turn Conversation

**Turn 1 - Initial Request:**
```json
POST /v1/search-normalization
{
  "user_request": "Show me movies with Chris"
}

Response:
{
  "conversation_id": "abc-123",
  "needs_clarification": true,
  "clarification_question": "Do you mean Chris Pratt, Chris Evans, or Chris Hemsworth?",
  "clarification_type": "actor_ambiguity",
  "clarification_options": ["Chris Pratt", "Chris Evans", "Chris Hemsworth"],
  "intent": "clarification"
}
```

**Turn 2 - User Reply:**
```json
POST /v1/search-normalization
{
  "user_request": "Chris Evans",
  "conversation_id": "abc-123"
}

Response:
{
  "conversation_id": "abc-123",
  "search_term": "Chris Evans",
  "fallback_terms": ["action", "superhero"],
  "assistant_message": "Searching for Chris Evans titles.",
  "needs_clarification": false,
  "intent": "search"
}
```

**Turn 3 - New Unrelated Request:**
```json
POST /v1/search-normalization
{
  "user_request": "Show me horror movies",
  "conversation_id": "abc-123"
}

Response:
{
  "conversation_id": "abc-123",
  "search_term": "horror",
  "assistant_message": "Searching for horror movies.",
  "needs_clarification": false,
  "intent": "search"
}
```

The API automatically detects when a user's reply is unrelated to the pending clarification and treats it as a new request.

---

## LLM Integration

### Provider Interface

All LLM providers implement the `QueryNormalizerModel` interface:

```typescript
interface QueryNormalizerModel {
  normalize(input: {
    userRequest: string;
    locale?: string;
  }): Promise<QueryNormalizerModelOutput>;

  resolveClarification(context: {
    previous_request: string;
    previous_search_term_candidate: string | null;
    clarification_question: string;
    clarification_type: string | null;
    clarification_options: string[] | null;
    user_reply: string;
  }): Promise<QueryNormalizerModelOutput>;
}
```

### Supported Providers

1. **Local LLM (Ollama, vLLM, llama.cpp)**
   - Uses OpenAI-compatible API
   - Configurable base URL and model
   - Recommended: `qwen2.5:7b`, `llama3.1:8b`

2. **Groq Cloud API**
   - Fast cloud inference
   - Recommended: `llama-3.3-70b-versatile`
   - Requires API key

3. **Mock Provider**
   - Deterministic responses for testing
   - No LLM required
   - Pattern-based matching

### Configuration

Environment variables:
```bash
# Provider selection
LLM_PROVIDER=local|groq|mock

# Local provider (Ollama/vLLM)
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434
LOCAL_LLM_MODEL=qwen2.5:7b
LOCAL_LLM_API_KEY=not-needed

# Groq provider
GROQ_API_KEY=your_api_key
GROQ_MODEL=llama-3.3-70b-versatile

# LLM parameters
LLM_TIMEOUT_MS=30000
LLM_MAX_TOKENS=256
LLM_TEMPERATURE=0.1
```

---

## Validation & Sanitization

### Input Validation

**Pre-LLM Validation:**
- Checks for gibberish (excessive repeated characters, random strings)
- Detects off-topic requests (greetings, unrelated questions)
- Validates request length (1-500 characters)
- Ensures non-empty content

**Rejection Examples:**
- `"asdfasdfasdf"` → Rejected as gibberish
- `"hello"` → Rejected as off-topic
- `"what's the weather?"` → Rejected as off-topic

### Output Sanitization

**Search Term Normalization:**
- Removes excessive whitespace
- Normalizes commas and separators
- Truncates to 120 characters max
- Removes unsafe characters

**Assistant Message Sanitization:**
- Removes markdown formatting
- Strips HTML tags
- Truncates to 200 characters max
- Ensures safe display text

### Fallback Handling

When LLM output is invalid or malformed:
1. Attempts to fix common issues (missing fields, wrong types)
2. Uses fallback normalizer for critical failures
3. Returns safe default messages
4. Sets `validation_status: "fallback"`

---

## Clarification Types

The API supports several clarification types:

| Type | Description | Example |
|------|-------------|---------|
| `content_type` | Ambiguous movie vs series | "Do you want a comedy movie or series?" |
| `actor_ambiguity` | Multiple actors with same name | "Do you mean Chris Pratt or Chris Evans?" |
| `genre_ambiguity` | Unclear genre preference | "Do you want action or drama?" |
| `similarity` | "Similar to" queries | "Which title do you want similar content to?" |
| `other` | Other types of ambiguity | General clarification questions |

---

## Fallback Terms

Fallback terms provide alternative search queries when the primary search returns zero results.

**Characteristics:**
- Maximum 3 fallback terms
- Ordered from specific → broad
- Each term reduces constraints
- Generated by LLM during normalization
- No additional LLM calls during fallback

**Example:**
```json
{
  "search_term": "horror, Zachary Arthur",
  "fallback_terms": [
    "Chucky",
    "horror series",
    "horror"
  ]
}
```

**Fallback Execution Flow:**
1. Try primary `search_term`
2. If zero results, try `fallback_terms[0]`
3. If still zero, try `fallback_terms[1]`
4. Continue until results found or all exhausted

---

## Performance & Monitoring

### Timing Metrics

When `debug: true`, the API returns timing information:

```json
{
  "debug": {
    "timings_ms": {
      "llm": 245,        // LLM inference time
      "validation": 2,   // Validation time
      "total": 250       // Total request time
    }
  }
}
```

### Logging

The API uses structured logging (Pino) with:
- Request/response logging
- Error tracking with stack traces
- Performance metrics
- Conversation state changes
- LLM provider selection

**Log Levels:** `fatal`, `error`, `warn`, `info`, `debug`, `trace`

### Health Monitoring

- `/health` - Basic health check
- `/ready` - Readiness probe for orchestrators
- Automatic conversation cleanup (60s expiration)
- Request ID tracking for distributed tracing

---

## Security & Privacy

### Input Sanitization
- All user input is sanitized before processing
- HTML/script tags are stripped
- Maximum length enforced (500 chars)
- Special characters normalized

### Output Safety
- Assistant messages are sanitized
- No raw LLM output exposed (unless debug mode)
- Markdown/HTML stripped from responses
- Safe character encoding

### Privacy Considerations
- No persistent storage of user data
- Conversations expire after 60 seconds
- Optional `user_id` field (not used in v1)
- Request IDs for tracing (no PII)

### Rate Limiting
Not implemented in v1. Recommended for production:
- Per-IP rate limiting
- Per-user rate limiting (if authenticated)
- LLM provider quota management

---

## Error Handling

### Error Types

1. **Validation Errors (400)**
   - Invalid request format
   - Missing required fields
   - Field constraint violations

2. **LLM Provider Errors (500)**
   - Provider timeout
   - Provider unavailable
   - Invalid API key
   - Rate limit exceeded

3. **Internal Errors (500)**
   - Unexpected exceptions
   - Conversation store failures
   - Sanitization failures

### Fallback Behavior

When LLM fails:
1. Log error with full context
2. Use fallback normalizer
3. Return safe default response
4. Set `validation_status: "fallback"`
5. Include error in debug info (if enabled)

---

## Testing

### Test UI

Built-in web interface at `http://localhost:3000`:
- Interactive query testing
- Conversation flow testing
- Debug mode toggle
- Example queries
- Response visualization

### Mock Provider

For automated testing:
```typescript
LLM_PROVIDER=mock
```

Provides deterministic responses for:
- Standard searches
- Clarification scenarios
- Ambiguous queries
- Off-topic detection
- Continuation detection

---

## Deployment

### Docker

```bash
docker build -t ai-search-api .
docker run -p 3000:3000 \
  -e LLM_PROVIDER=groq \
  -e GROQ_API_KEY=your_key \
  ai-search-api
```

### Environment Variables

See `.env.example` for complete list. Key variables:

```bash
# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# LLM Provider
LLM_PROVIDER=local|groq|mock

# Debug/Logging
ENABLE_DEBUG_RAW_MODEL_OUTPUT=false
ENABLE_PROMPT_LOGGING=false
ALLOW_USER_TEXT_LOGGING=false
```

### Production Considerations

1. **LLM Provider Selection**
   - Local: Lower latency, requires infrastructure
   - Groq: Fast cloud, requires API key
   - Consider fallback provider

2. **Scaling**
   - Stateless design (except in-memory conversations)
   - Horizontal scaling supported
   - Consider Redis for conversation store in multi-instance setup

3. **Monitoring**
   - Track LLM latency and errors
   - Monitor conversation expiration rate
   - Alert on high fallback rate

4. **Security**
   - Implement rate limiting
   - Use HTTPS in production
   - Rotate API keys regularly
   - Sanitize all inputs/outputs

---

## Future Enhancements

Potential improvements (not currently implemented):

- **Persistent Conversation Store:** Redis/database for multi-instance deployments
- **User Personalization:** Watch history, preferences
- **Catalog Integration:** Real-time availability checks
- **Structured Filters:** Extract genres, actors, years as separate fields
- **Similar Content:** "More like this" recommendations
- **Voice Transcript Cleanup:** Handle speech-to-text artifacts
- **A/B Testing:** Experiment with different prompts/models
- **Analytics:** Track query patterns, clarification rates
- **Caching:** Cache common queries
- **Streaming Responses:** Server-sent events for real-time updates

---

## Appendix

### Example Queries

**Simple Searches:**
- "Show me horror movies"
- "Comedy with Jim Carrey"
- "Kids animated movies"

**Complex Searches:**
- "Funny detective shows with British humor"
- "Sci-fi movies like Inception"
- "Christmas movies for family"

**Ambiguous (Triggers Clarification):**
- "Show me movies with Chris" → Actor ambiguity
- "I want comedy" → Content type ambiguity
- "Something scary" → Genre ambiguity

**Off-Topic (Rejected):**
- "Hello, how are you?"
- "What's the weather?"
- "Tell me a joke"

### Response Time Targets

- **P50:** < 300ms (local LLM) / < 500ms (cloud)
- **P95:** < 800ms (local LLM) / < 1500ms (cloud)
- **P99:** < 2000ms (local LLM) / < 3000ms (cloud)

### Supported Locales

Currently supports any BCP 47 locale tag. LLM handles:
- `en-US` - English (US)
- `en-GB` - English (UK)
- `es-ES` - Spanish (Spain)
- `fr-FR` - French (France)
- And others (model-dependent)

---

**Document Version:** 1.0
**Last Updated:** 2024-03-18
**API Version:** v1

