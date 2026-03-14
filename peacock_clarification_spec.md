
# Peacock Search Assistant – Clarification & Context Handling Spec

## Purpose

Define how clarification questions work when the user's request is ambiguous or incomplete, and how the system preserves **context across turns**.

This spec complements the **Search Normalization API** and defines the **multi-turn conversation behavior** required for clarification.

The goal is to allow flows like:

User:
"Show me comedy"

Assistant:
"Do you want a comedy movie or a comedy series?"

User:
"Series"

Assistant resolves query → `"comedy series"`

---

# Design Principles

1. **Clarifications should be rare**
2. **Clarifications should be short**
3. **The system must preserve previous context**
4. **The LLM should never guess missing information if clarification is safer**
5. **The backend manages conversation state**
6. **The LLM only receives the relevant context**

---

# Conversation Model

Each request belongs to a **conversation**.

A conversation contains:

- conversation_id
- last_user_request
- last_search_term_candidate
- clarification_pending (boolean)
- clarification_type
- clarification_options
- timestamp

Example state:

```
conversation_id: 123
last_user_request: "Show me comedy"
last_search_term_candidate: "comedy"
clarification_pending: true
clarification_type: content_type
clarification_options: ["movie","series"]
```

---

# Clarification Flow

## Step 1 – Initial User Request

User request arrives:

```
"Show me comedy"
```

LLM response:

```
{
  search_term: null,
  assistant_message: "I need a bit more detail.",
  needs_clarification: true,
  clarification_question: "Do you want a comedy movie or a comedy series?",
  clarification_type: "content_type",
  clarification_options: ["movie","series"]
}
```

The backend stores conversation state.

---

## Step 2 – User Answer

User reply:

```
"Series"
```

System reconstructs request:

```
previous intent: comedy
clarification: series
```

Final query:

```
"comedy series"
```

Then call search API.

Assistant message:

```
"Searching for comedy series."
```

---

# Updated API Schema

Add the following fields to responses:

```
clarification_type: string | null
clarification_options: string[] | null
conversation_id: string
```

Example:

```
{
  "conversation_id": "abc123",
  "search_term": null,
  "assistant_message": "I need a bit more detail.",
  "needs_clarification": true,
  "clarification_question": "Do you want a comedy movie or a comedy series?",
  "clarification_type": "content_type",
  "clarification_options": ["movie","series"],
  "confidence": 0.55,
  "intent": "clarification"
}
```

---

# Supported Clarification Types

## 1 Content Type

When the request could refer to different formats.

Examples:

User:
"Show me comedy"

Question:
"Do you want a comedy movie or a comedy series?"

Options:

```
movie
series
```

---

## 2 Actor Ambiguity

User:
"Show me movies with Chris"

Question:
"Do you mean Chris Pratt, Chris Evans, or Chris Hemsworth?"

Options:

```
Chris Pratt
Chris Evans
Chris Hemsworth
```

---

## 3 Genre Ambiguity

User:
"Show me thrillers"

Question:
"Do you want thriller movies or thriller series?"

---

## 4 Similarity Requests

User:
"Something like The Office"

If unclear:

Question:
"Do you want comedy series like The Office?"

---

# Context Reconstruction

When a clarification answer arrives, the backend reconstructs the query.

Algorithm:

```
if clarification_pending:

    previous_query = conversation.last_search_term_candidate

    user_answer = new_message

    search_term = previous_query + ", " + user_answer
```

Example:

```
previous_query = comedy
user_answer = series

result = "comedy series"
```

---

# LLM Prompt Update

When clarification is pending, the prompt must include context.

Example prompt:

```
Previous request: "Show me comedy"

Assistant asked: "Do you want a comedy movie or a comedy series?"

User replied: "Series"

Generate the final search_term.
```

Expected output:

```
{
  "search_term": "comedy series",
  "assistant_message": "Searching for comedy series.",
  "needs_clarification": false
}
```

---

# Clarification Guardrails

Clarifications must:

- be one sentence
- be under 120 characters
- ask **one question only**
- not contain recommendations
- not contain catalog claims

Good:

"Do you want a comedy movie or a comedy series?"

Bad:

"You might like comedy movies or series — which one?"

---

# Expiration Rules

Clarification state should expire after:

- **60 seconds** OR
- **next unrelated query**

Example:

User:
"Show me comedy"

Assistant:
clarification

User:
"What's the weather"

Conversation resets.

---

# UX Rules

### When clarification appears

Display:

```
Assistant question
Quick reply buttons (if options provided)
```

Example:

```
Do you want a comedy movie or a comedy series?
[Movie] [Series]
```

---

# Failure Handling

If clarification response cannot be mapped:

User:

```
"I don't know"
```

System fallback:

```
search_term = previous_query
assistant_message = "Searching for comedy titles."
```

---

# Telemetry

Track:

- clarification_rate
- clarification_resolution_rate
- clarification_abandonment
- clarification_latency

These metrics will help tune prompts.

---

# Future Enhancements

Possible improvements:

- multi-step clarifications
- entity disambiguation using catalog lookup
- follow-up recommendations
- personalization-aware clarifications
- contextual memory across sessions

---

# Summary

Clarification system responsibilities:

LLM:
- detect ambiguity
- propose clarification question
- provide structured options

Backend:
- store conversation state
- reconstruct final query
- manage expiration
- send search request

Search API:
- handle final `search_term`
