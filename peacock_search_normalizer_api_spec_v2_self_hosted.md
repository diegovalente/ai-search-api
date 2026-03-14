# Peacock Voice/Text Search Normalizer API – Build Spec

## Goal

Build a backend API that receives a free-form user request about what they want to watch and returns a **strict JSON schema** with:

1. a normalized `search_term` string to be sent to Peacock's existing smart search API
2. a tiny, safe `assistant_message` to display to the user
3. optional clarification fields when the request is too ambiguous

The API should be designed so the LLM is **thin and constrained**. It is **not** a general chatbot. It is a **query normalizer / search phrase generator**.

---

## Product Context

Peacock already has a **smart search API** that accepts a single search string and is capable of resolving combinations such as:

- `"Horror, Zachary Arthur"` → returns horror content with Zachary Arthur, including *Chucky*
- `"Comedy, Jim Carrey"`
- `"Kids animation, animals"`
- `"The Office"`

Because search is already smart, this service should **not** try to:
- rank results
- decide final catalog truth
- invent recommendations
- claim something exists in catalog unless it comes from another deterministic backend source
- act like a free-form assistant

Its only AI job is:

> Transform natural language into the best possible search term for the existing search API, plus a tiny safe acknowledgement message.

---

## High-Level Requirements

### Inputs
The API must accept:
- `user_request` (required): free text from the user
- `locale` (optional): default `en-US`
- `platform` (optional): `ios`, `android`, `web`, etc.
- `conversation_id` (optional)
- `user_id` (optional, not used for v1 logic but preserve for future use)
- `request_id` (optional)
- `debug` (optional boolean)

### Outputs
The API must return strict JSON with:
- `search_term`
- `assistant_message`
- `needs_clarification`
- `clarification_question`
- `confidence`
- `intent`
- `validation_status`
- optional `debug` section when requested

### Non-goals
Do **not** build:
- catalog retrieval
- result ranking
- personalized recommendation engine
- watch history logic
- entitlement logic
- long conversation memory
- full moderation system for user-generated content beyond lightweight safety constraints for the generated assistant text

---


## Deployment / Data Residency Requirement

This API must be implemented so that **all model inference runs on infrastructure controlled by us**. The service must **not send prompts, user requests, transcripts, watch habits, search habits, or any derived behavioral data to third-party AI providers** in production.

### Deployment Requirement
- The model must run on the **same server** as the API process **or** on an internal/private server inside our controlled network/VPC
- No calls to OpenAI, Anthropic, Google hosted APIs, or any other third-party inference provider in production
- Model weights must be loaded from an internally controlled location
- All inference traffic must remain inside company-controlled infrastructure
- No prompt/body logging to external SaaS tools
- No analytics vendor should receive raw user requests by default

### Preferred Implementation
Use an **open-weight / open-source-capable model** that can be self-hosted locally on the server.

Good implementation patterns:
- API service calls a **local inference server** on `localhost`
- or API and inference engine run in the same Docker Compose / Kubernetes deployment inside the same private network
- or inference is embedded in-process if the chosen runtime supports it cleanly

### Recommended Serving Options
Prefer one of these self-hosted setups:
- **vLLM** for production-style high-throughput serving
- **llama.cpp** for lightweight/local deployments
- **Ollama** only for very fast prototyping or internal demos, not my first choice for production

### Model Recommendation for v1
Pick a self-hosted open model that is good at:
- instruction following
- strict JSON / structured output
- short query rewriting
- low-latency inference

Practical candidates to evaluate:
- **Qwen2.5 7B Instruct**
- **Mistral Small 3.1**
- **Llama 3.3 70B Instruct** if we have enough GPU budget and want stronger quality

For this specific task, start small. Since the task is only:
- query normalization
- tiny safe acknowledgement
- occasional clarification

a smaller self-hosted model is likely enough for v1.

### Architecture Adjustment
Please design the LLM provider abstraction so the default production provider is **self-hosted local inference**, for example:

```ts
LOCAL_LLM_BASE_URL=http://127.0.0.1:8000
LOCAL_LLM_MODEL=Qwen/Qwen2.5-7B-Instruct
```

The code should assume:
- the inference endpoint is internal
- no third-party network hop is required
- the API can be configured to call a local OpenAI-compatible server

### Strong Preference
Please make the provider implementation compatible with an **OpenAI-compatible local server** so we can swap the backend between:
- vLLM
- llama.cpp-compatible adapter
- other internal inference services

without changing the application contract.


## Architecture Recommendation

Build the service with a clean layered architecture:

1. **HTTP API layer**
2. **Request validation**
3. **Normalization service**
4. **LLM provider abstraction**
5. **Output validation / guardrails**
6. **Fallback rules**
7. **Structured logging + metrics**

Recommended stack:
- **Node.js + TypeScript**
- Framework: **Fastify** or **Express**
- Validation: **Zod**
- Tests: **Vitest** or **Jest**
- OpenAPI generation if convenient
- Container-ready via Docker

If you think Fastify gives a cleaner implementation/performance profile, prefer Fastify.

---

## Core API Contract

### Endpoint
`POST /v1/search-normalization`

### Request Body
```json
{
  "user_request": "Show me funny detective shows",
  "locale": "en-US",
  "platform": "ios",
  "conversation_id": "abc-123",
  "user_id": "user-456",
  "request_id": "req-789",
  "debug": false
}
```

### Response Body – Success
```json
{
  "search_term": "comedy, detective",
  "assistant_message": "Searching for comedy detective shows.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.91,
  "intent": "search",
  "validation_status": "valid"
}
```

### Response Body – Clarification Needed
```json
{
  "search_term": null,
  "assistant_message": "I need a bit more detail.",
  "needs_clarification": true,
  "clarification_question": "Do you want a comedy movie or a comedy series?",
  "confidence": 0.54,
  "intent": "clarification",
  "validation_status": "valid"
}
```

### Response Body – Fallback
```json
{
  "search_term": "comedy",
  "assistant_message": "Searching your request.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.4,
  "intent": "search",
  "validation_status": "fallback"
}
```

### Optional Debug Payload
When `debug=true`, append:
```json
{
  "debug": {
    "raw_model_output": {},
    "validation_errors": [],
    "fallback_applied": false,
    "timings_ms": {
      "llm": 120,
      "validation": 2,
      "total": 140
    }
  }
}
```

---

## Strict Output Schema

Use a strict internal schema and validate every response from the model before returning it.

### TypeScript Type
```ts
export type SearchNormalizationResponse = {
  search_term: string | null;
  assistant_message: string;
  needs_clarification: boolean;
  clarification_question: string | null;
  confidence: number;
  intent: "search" | "clarification";
  validation_status: "valid" | "fallback";
  debug?: {
    raw_model_output?: unknown;
    validation_errors?: string[];
    fallback_applied?: boolean;
    timings_ms?: {
      llm?: number;
      validation?: number;
      total?: number;
    };
  };
};
```

### Zod Schema
Please implement a Zod schema equivalent to the above, with:
- `confidence` clamped/validated between `0` and `1`
- `assistant_message` max length enforced
- if `needs_clarification = true`, then:
  - `clarification_question` must be non-null
  - `search_term` should be null
  - `intent` must be `"clarification"`
- if `needs_clarification = false`, then:
  - `clarification_question` should be null

---

## LLM Contract

The model must return JSON only, matching an internal schema like:

```json
{
  "search_term": "horror, Zachary Arthur",
  "assistant_message": "Looking for horror titles with Zachary Arthur.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.88,
  "intent": "search"
}
```

### Important
The API must treat the model as **untrusted output**:
- parse safely
- validate strictly
- sanitize strings
- apply fallback if validation fails

Do **not** return raw model output directly without validation.

---

## Prompting Requirements

Create a prompt layer that clearly tells the model:

### Model Role
You are a query normalizer for a streaming app search system.

### Objective
Convert a free-form user request into:
1. a normalized comma-separated search term for an existing smart search API
2. a tiny, neutral, safe user-facing acknowledgement message
3. a clarification question only when necessary

### Search Term Rules
The `search_term` should:
- be concise
- use comma-separated phrases when combining concepts
- preserve the most useful searchable concepts
- prefer canonical search-friendly wording
- remove conversational filler
- convert natural phrasing into search-optimized phrasing
- not include unsupported commentary
- not include full sentences unless necessary
- not include quote marks unless truly needed
- not include profanity unless it is required because it is part of a title/name
- not include special formatting or markdown

### Assistant Message Rules
The `assistant_message` must:
- be exactly 1 sentence
- be neutral
- be short (target 4 to 12 words, hard max 80 chars)
- have no profanity
- have no slang
- have no jokes
- have no opinions
- have no promises
- have no catalog claims
- have no recommendation claims
- have no exclamation marks
- not mention results found unless the backend actually found them
- not mention personalization in v1

### Clarification Rules
Set `needs_clarification = true` only when the user request is too ambiguous to create a useful search term.

Examples:
- “Show me funny stuff” → likely clarify movie vs series? up to threshold logic
- “Batman” → maybe okay as search term, do not over-clarify
- “Something with that actor from White Lotus” → clarify if actor is unresolved
- “comedy” → may still be acceptable as direct search term
- prefer **not** asking clarification if a reasonable search term can be produced

### Intent Rules
- `"search"` for normal search generation
- `"clarification"` only if no good search term can be produced safely

---

## Few-Shot Examples

Include several examples in the prompt/config.

### Example 1
Input:
`show me horror movies with that kid from chucky`

Output:
```json
{
  "search_term": "horror, Zachary Arthur",
  "assistant_message": "Looking for horror titles with Zachary Arthur.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.89,
  "intent": "search"
}
```

### Example 2
Input:
`I want funny detective shows`

Output:
```json
{
  "search_term": "comedy, detective",
  "assistant_message": "Searching for comedy detective shows.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.92,
  "intent": "search"
}
```

### Example 3
Input:
`something like the office`

Output:
```json
{
  "search_term": "The Office",
  "assistant_message": "Searching for titles like The Office.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.84,
  "intent": "search"
}
```

### Example 4
Input:
`kids animated movies with animals`

Output:
```json
{
  "search_term": "kids animation, animals",
  "assistant_message": "Looking for kids animated titles with animals.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.93,
  "intent": "search"
}
```

### Example 5
Input:
`show me stuff with batman`

Output:
```json
{
  "search_term": "Batman",
  "assistant_message": "Searching for Batman titles.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.76,
  "intent": "search"
}
```

### Example 6
Input:
`that actor from white lotus`

Output:
```json
{
  "search_term": null,
  "assistant_message": "I need a bit more detail.",
  "needs_clarification": true,
  "clarification_question": "Which actor from The White Lotus do you mean?",
  "confidence": 0.47,
  "intent": "clarification"
}
```

### Example 7
Input:
`comedy with jim carrey`

Output:
```json
{
  "search_term": "comedy, Jim Carrey",
  "assistant_message": "Looking for comedy titles with Jim Carrey.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.95,
  "intent": "search"
}
```

### Example 8
Input:
`find me action movies from the 90s`

Output:
```json
{
  "search_term": "action, 90s",
  "assistant_message": "Searching for action movies from the 90s.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.91,
  "intent": "search"
}
```

---

## Query Construction Heuristics

In addition to the LLM, implement deterministic post-processing rules where helpful.

### Desired Normalization Behavior
- Trim whitespace
- Collapse repeated spaces
- Remove filler such as:
  - “show me”
  - “I want”
  - “can you find”
  - “give me”
- Preserve important entities:
  - titles
  - actor names
  - genre terms
  - themes/tags
  - eras/timeframes
- Prefer search-oriented phrasing:
  - `comedy, Jim Carrey`
  - `horror, Zachary Arthur`
  - `kids animation, animals`
- Remove trailing punctuation
- Ensure no markdown, emojis, or unsupported symbols

### Optional Deterministic Cleanup
After the model returns `search_term`, run cleanup:
- trim
- normalize comma spacing to `", "`
- strip repeated commas
- strip surrounding quotes unless clearly intended
- enforce max length, e.g. 120 chars
- remove line breaks

---

## Safety / Legal / Editorial Guardrails

Because the assistant text may appear in-product, keep it extremely constrained.

### Hard Rules for `assistant_message`
- max 80 characters
- single sentence
- no exclamation marks
- no profanity
- no insults
- no sexual content
- no medical/legal/financial language
- no references to protected classes
- no harmful or risky instructions
- no editorial claims like “best”, “perfect”, “you’ll love”
- no false statements about catalog content
- no statements about user history in v1
- no cursing even if the user curses

### If generated message fails validation
Replace with one of these fallback messages:
- `Searching your request.`
- `Looking for matching titles.`
- `I’m searching for that.`

Use ASCII apostrophe or plain text consistently.

### Clarification Question Rules
The clarification question must:
- be one sentence
- be neutral
- be specific
- ask only for necessary disambiguation
- not exceed 100 characters if possible

---

## Fallback Strategy

If the LLM:
- times out
- returns invalid JSON
- returns fields that fail validation
- returns unsafe `assistant_message`

then apply fallback logic.

### Fallback Logic
1. Attempt deterministic search-term extraction from the raw user request:
   - trim
   - remove common filler prefixes
   - keep the remainder
2. If remainder is usable, return:
```json
{
  "search_term": "<cleaned request>",
  "assistant_message": "Searching your request.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.4,
  "intent": "search",
  "validation_status": "fallback"
}
```
3. If cleaned request is too weak/empty, return:
```json
{
  "search_term": null,
  "assistant_message": "I need a bit more detail.",
  "needs_clarification": true,
  "clarification_question": "What would you like to watch?",
  "confidence": 0.2,
  "intent": "clarification",
  "validation_status": "fallback"
}
```

---

## LLM Provider Abstraction

Implement an interface such as:

```ts
export interface QueryNormalizerModel {
  normalize(input: {
    userRequest: string;
    locale?: string;
  }): Promise<{
    search_term: string | null;
    assistant_message: string;
    needs_clarification: boolean;
    clarification_question: string | null;
    confidence: number;
    intent: "search" | "clarification";
    raw?: unknown;
  }>;
}
```

Create the implementation so the underlying provider can be swapped later:
- OpenAI
- in-house hosted model
- local model
- mock provider for tests

Do not hard-couple the service to one specific vendor.

---

## Suggested Project Structure

```text
src/
  app.ts
  server.ts
  routes/
    searchNormalization.ts
  services/
    searchNormalizationService.ts
  llm/
    QueryNormalizerModel.ts
    providers/
      openaiQueryNormalizer.ts
      mockQueryNormalizer.ts
  validation/
    requestSchemas.ts
    responseSchemas.ts
    outputGuards.ts
  fallback/
    fallbackNormalizer.ts
  prompts/
    queryNormalizerPrompt.ts
  utils/
    sanitize.ts
    timing.ts
    logger.ts
  config/
    env.ts
tests/
  unit/
  integration/
  fixtures/
```

---

## HTTP Behavior

### Success Codes
- `200 OK` for successful normalized response, including clarification responses

### Error Codes
- `400` invalid request body
- `415` unsupported content type
- `429` rate limited
- `500` internal error
- `503` model provider unavailable

Even on provider failure, prefer returning a valid fallback response if possible rather than a hard 500.

---

## Validation Rules

### Request Validation
- `user_request` required
- minimum non-whitespace length: 1
- maximum length: 500 characters
- reject non-string values
- optional fields validated if present

### Response Validation
Validate all of:
- `search_term` type/length
- `assistant_message` length and safety
- boolean consistency
- confidence range
- clarification logic consistency
- normalized punctuation and spacing

---

## Observability

Add structured logs and metrics.

### Logs
Log:
- request_id
- conversation_id
- provider used
- model latency
- validation status
- fallback applied
- intent
- confidence
- sanitized search term length only, or redact content depending on environment

Avoid logging raw user text in production by default unless explicitly enabled.

### Metrics
Emit counters/timers for:
- total requests
- provider success/failure
- validation failures
- fallback rate
- clarification rate
- p50/p95 latency

---

## Testing Requirements

Please include comprehensive automated tests.

### Unit Tests
Cover:
- request validation
- response validation
- assistant message guardrails
- fallback logic
- comma spacing normalization
- clarification consistency rules

### Integration Tests
Cover:
- happy path with mock provider
- invalid model output → fallback
- timeout → fallback
- unsafe assistant message → fallback message substitution
- clarification response path

### Example Test Cases
1. `"comedy with jim carrey"` → `comedy, Jim Carrey`
2. `"show me horror with zachary arthur"` → `horror, Zachary Arthur`
3. `"Batman"` → `Batman`
4. `"that actor from white lotus"` → clarification
5. `"   "` → request validation failure
6. malicious / profanity-heavy input → safe neutral assistant message

---

## Environment Variables

Support configuration via env vars:

```bash
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-mini
LLM_TIMEOUT_MS=2500

ENABLE_DEBUG_RAW_MODEL_OUTPUT=false
ENABLE_PROMPT_LOGGING=false
ALLOW_USER_TEXT_LOGGING=false
```

Adjust names if needed, but keep the config centralized.

---

## Nice-to-Haves

If time allows, include:
- OpenAPI spec or Swagger
- Dockerfile
- health endpoint (`GET /health`)
- readiness endpoint (`GET /ready`)
- example `.env.example`
- Postman collection or curl examples
- simple rate limiting middleware
- idempotent request logging by request ID

---

## Example cURL

```bash
curl -X POST http://localhost:3000/v1/search-normalization \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "Show me funny detective shows",
    "locale": "en-US",
    "platform": "ios",
    "debug": true
  }'
```

Expected response:
```json
{
  "search_term": "comedy, detective",
  "assistant_message": "Searching for comedy detective shows.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.91,
  "intent": "search",
  "validation_status": "valid",
  "debug": {
    "fallback_applied": false
  }
}
```

---

## Future-Proofing Notes (Do Not Build Yet Unless Easy)

Design the API so it can later support:
- user personalization
- watch-history-aware responses
- locale-specific normalization
- voice-transcript cleanup
- multiple output search terms
- entity-level hints
- catalog tool lookups
- experimentation across providers/models

Possible future schema expansion:
```json
{
  "search_term": "The Office",
  "assistant_message": "Searching for titles like The Office.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.84,
  "intent": "search",
  "validation_status": "valid",
  "metadata": {
    "search_mode": "similarity",
    "entities": ["The Office"]
  }
}
```

But keep v1 minimal.

---

## Implementation Priorities

### Must Have
- endpoint
- request validation
- model abstraction
- strict JSON response validation
- safe assistant message guardrails
- fallback strategy
- tests
- clear README

### Should Have
- health endpoint
- Dockerfile
- metrics/logging
- OpenAPI

### Could Have
- provider swapping examples
- prompt versioning
- debug mode extras

---

## README Expectations

Please include a README that explains:
- what the API does
- setup instructions
- environment variables
- how to run locally
- how to run tests
- sample request/response
- architecture overview
- safety/fallback behavior

---

## Final Notes for Augment

Please implement this as **production-style code**, not as a rough prototype.

Important expectations:
- clean TypeScript types
- good separation of concerns
- testability
- strict validation everywhere
- deterministic fallbacks
- no raw free-form model output returned directly
- easy to swap LLM providers later
- concise code comments only where useful

The main design principle is:

> The LLM is a thin query normalizer, not a chatbot.
