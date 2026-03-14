
# Peacock Search Assistant – Fallback Terms Specification

## Purpose

Define how **fallback search terms** should be generated and used when the primary `search_term`
returns zero results from the Peacock search API.

The goal of fallback terms is to:

- Reduce **zero‑result searches**
- Provide **semantically related alternatives**
- Keep the search experience **fast and deterministic**
- Avoid additional LLM calls during fallback

Fallback terms are generated **once by the LLM** during normalization and executed **by the backend**.

---

# Design Principles

1. **The LLM proposes fallback terms**
2. **The backend controls fallback execution**
3. **Fallback terms must broaden the search gradually**
4. **Maximum of 3 fallback terms**
5. **Fallback terms must be ordered from most specific → broadest**
6. **Each fallback must reduce constraints compared to the previous term**
7. **Fallback terms must be search‑friendly phrases, not sentences**

---

# API Schema Update

The normalization API response must include a new field:

```
fallback_terms: string[]
```

Updated response example:

```json
{
  "search_term": "horror, Zachary Arthur",
  "fallback_terms": [
    "Chucky",
    "horror series",
    "horror"
  ],
  "assistant_message": "Looking for horror titles with Zachary Arthur.",
  "needs_clarification": false,
  "clarification_question": null,
  "confidence": 0.88,
  "intent": "search"
}
```

---

# Fallback Execution Strategy (Backend)

The backend search system must execute fallbacks sequentially.

### Step 1 – Primary Search

```
search(search_term)
```

If results > 0 → return results.

---

### Step 2 – Fallback Cascade

If results = 0:

Execute fallbacks in order:

```
search(fallback_terms[0])
search(fallback_terms[1])
search(fallback_terms[2])
```

Stop when:

- results > 0
- fallback list exhausted

---

### Step 3 – Final Safety Fallback

If all fallbacks fail:

Return a **generic catalog fallback**:

Examples:

- Trending titles
- Popular movies
- Recently added content

Assistant message:

```
"I couldn't find that exactly. Showing popular titles."
```

---

# Fallback Term Generation Rules (LLM)

Fallback terms must follow a **broadening hierarchy**.

### Level 1 – Closest Alternative

Remove a constraint or replace entity with related title.

Example:

User:

```
horror with that kid from chucky
```

Primary:

```
horror, Zachary Arthur
```

Fallback 1:

```
Chucky
```

---

### Level 2 – Remove Entity Constraint

Example:

Primary:

```
comedy, Jim Carrey
```

Fallback:

```
Jim Carrey
```

or

```
comedy
```

---

### Level 3 – Genre/Theme Broadening

Example:

Primary:

```
italian horror series 1970s
```

Fallbacks:

```
horror series
horror
```

---

# Ordering Rules

Fallback terms must follow this structure:

| Position | Description |
|--------|-------------|
| fallback_terms[0] | Closest semantic alternative |
| fallback_terms[1] | Remove one constraint |
| fallback_terms[2] | Broader category |

Example:

```
search_term: "crime comedy, Keanu Reeves"

fallback_terms:
1. "Keanu Reeves"
2. "crime comedy"
3. "comedy"
```

---

# Hard Constraints

Fallback terms must:

- contain **no more than 6 words**
- be **under 60 characters**
- contain **no punctuation except commas**
- contain **no quotes**
- contain **no markdown**
- contain **no profanity**
- contain **no full sentences**

Valid:

```
comedy
Chucky
Jim Carrey
crime comedy
horror series
```

Invalid:

```
movies with jim carrey
show me horror movies
I want comedy
```

---

# LLM Prompt Instructions

The LLM prompt must instruct:

```
Always generate up to 3 fallback_terms.

fallback_terms must:
- broaden the search gradually
- remove constraints progressively
- never repeat the primary search_term
- be ordered from most specific to broadest
```

Example transformation:

User:

```
show me comedy with jim carrey
```

Output:

```
search_term: "comedy, Jim Carrey"

fallback_terms:
- "Jim Carrey"
- "comedy"
```

---

# When NOT to Generate Fallbacks

Fallback terms should be empty when:

- the query is already extremely broad
- clarification is required
- the user asked a precise title search

Example:

```
search_term: "The Office"
fallback_terms: []
```

---

# Telemetry

The backend must track:

```
fallback_attempts
fallback_success_rate
fallback_depth_used
zero_result_rate
```

Example log:

```
search_term: horror, Zachary Arthur
fallback_used: Chucky
fallback_depth: 1
results: 12
```

These metrics help tune LLM prompts.

---

# Example Scenarios

### Example 1

User:

```
comedy with jim carrey
```

Output:

```
search_term: comedy, Jim Carrey

fallback_terms:
- Jim Carrey
- comedy
```

---

### Example 2

User:

```
horror with that kid from chucky
```

Output:

```
search_term: horror, Zachary Arthur

fallback_terms:
- Chucky
- horror series
- horror
```

---

### Example 3

User:

```
batman
```

Output:

```
search_term: Batman
fallback_terms: []
```

---

# Summary

Responsibilities:

### LLM

- generate `search_term`
- generate ordered `fallback_terms`
- follow broadening rules

### Backend

- execute fallback cascade
- stop when results found
- decide final assistant message
- collect telemetry

### Search API

- retrieve results for each candidate query
