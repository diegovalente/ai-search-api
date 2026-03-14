# AI Search API - Behaviour Update Requirements

## Overview

This document outlines changes required to improve the AI Search API's ability to translate natural language queries into Suggest API parameters.

**Key Improvements:**
1. Extract entity types (movie, series) as separate filters instead of stripping them
2. Output structured search parameters instead of a single comma-separated string
3. Support mood/theme/scenario-based searches via tag matching
4. Properly handle "similar to" queries

---

## Problem Statement

### Current Behaviour

The current implementation outputs only a `search_term` string:

```json
{
  "search_term": "Christmas",
  "fallback_terms": ["holiday"],
  "assistant_message": "Searching for Christmas movies."
}
```

**Issues identified:**

| User Query | Current Output | Problem |
|------------|----------------|---------|
| "Show me Christmas movies" | `search_term: "Christmas"` | Entity type stripped |
| "Daniel Radcliffe movies" | `search_term: "Daniel Radcliffe"` | No entitytype filter |
| "Something light and funny" | Mood stripped as filler | "light" matches videomood tags |
| "Movies like Inception" | `search_term: "Inception"` | Not identified as similar-to |

### Root Cause

The prompt (`src/prompts/queryNormalizerPrompt.ts`) says:
> "NEVER include asset type words like 'movies', 'series'..."

This is **incorrect**. Entity type should be extracted as a **filter parameter**.

---

## Suggest API Context

| Parameter | Type | Description |
|-----------|------|-------------|
| `term` | string | Full-text search query |
| `entitytype` | string[] | `movie`, `series`, `programme` |
| `g` | string[] | Genre filter |
| `sg` | string[] | Sub-genre filter |
| `personaid` | string | User persona for personalization |

**Searchable fields via `term`:**
- Titles, cast/crew names, genres/subgenres
- **Tags:** `videomood`, `theme`, `scenario`, `character`, `settingplace`
- Sports: teams, athletes, competitions

**Videomood examples:** `light`, `dark`, `intense`, `thrilling`, `heartwarming`
**Theme examples:** `Redemption`, `Conflict`, `Love`, `Coming of Age`
**Scenario examples:** `On The Run`, `Manhunt`, `Heist`, `Time Travel`

---

## Desired Response Structure

```json
{
  "conversation_id": "abc-123",
  "intent": {
    "intent_type": "standard_search",
    "similar_to_title": null,
    "search_terms": {
      "primary": "Daniel Radcliffe",
      "moods": [],
      "themes": [],
      "scenarios": []
    },
    "filters": {
      "entity_types": ["movie"],
      "genres": [],
      "subgenres": []
    }
  },
  "suggest_params": {
    "term": "Daniel Radcliffe",
    "entitytype": ["movie"]
  },
  "fallback_params": [
    { "term": "Harry Potter", "entitytype": ["movie"] },
    { "term": "Daniel Radcliffe" }
  ],
  "assistant_message": "Searching for Daniel Radcliffe movies.",
  "needs_clarification": false,
  "confidence": 0.94,
  "validation_status": "valid"
}
```

### Example Transformations

| User Query | suggest_params |
|------------|----------------|
| "Christmas movies" | `{ term: "Christmas", entitytype: ["movie"] }` |
| "Daniel Radcliffe movies" | `{ term: "Daniel Radcliffe", entitytype: ["movie"] }` |
| "Something light and funny" | `{ term: "light", g: ["Comedy"] }` |
| "Tom Hanks dramas from the 90s" | `{ term: "Tom Hanks 90s", g: ["Drama"] }` |
| "Movies like Inception" | `{ term: "Inception", entitytype: ["movie"] }` |
| "Dark thriller about a manhunt" | `{ term: "dark manhunt", g: ["Thriller"] }` |

---

## Suggested Changes (please carefully verify if they make sense)

### 1. `src/validation/responseSchemas.ts`

**Add new schemas:**

```typescript
export const intentTypes = ['standard_search', 'similar_to', 'browse_category'] as const;
export type IntentType = typeof intentTypes[number];

export const entityTypes = ['movie', 'series', 'programme'] as const;
export type EntityType = typeof entityTypes[number];

export const searchTermsSchema = z.object({
  primary: z.string().nullable(),
  moods: z.array(z.string()),
  themes: z.array(z.string()),
  scenarios: z.array(z.string()),
});

export const filtersSchema = z.object({
  entity_types: z.array(z.enum(entityTypes)),
  genres: z.array(z.string()),
  subgenres: z.array(z.string()),
});

export const searchIntentSchema = z.object({
  intent_type: z.enum(intentTypes),
  similar_to_title: z.string().nullable().optional(),
  search_terms: searchTermsSchema,
  filters: filtersSchema,
});

export const suggestParamsSchema = z.object({
  term: z.string(),
  entitytype: z.array(z.string()).optional(),
  g: z.array(z.string()).optional(),
  sg: z.array(z.string()).optional(),
});
```

**Update `llmOutputSchema`** to include new structured fields.

**Update `searchNormalizationResponseSchema`** to add `intent`, `suggest_params`, `fallback_params`.

---

### 2. `src/llm/QueryNormalizerModel.ts`

**Update `QueryNormalizerModelOutput` interface:**

```typescript
export interface QueryNormalizerModelOutput {
  // NEW: Structured intent
  intent_type: 'standard_search' | 'similar_to' | 'browse_category';
  similar_to_title?: string | null;
  search_terms: {
    primary: string | null;
    moods: string[];
    themes: string[];
    scenarios: string[];
  };
  filters: {
    entity_types: ('movie' | 'series' | 'programme')[];
    genres: string[];
    subgenres: string[];
  };
  
  // EXISTING: Keep for backward compatibility
  fallback_terms?: string[];
  assistant_message: string;
  needs_clarification: boolean;
  clarification_question: string | null;
  clarification_type?: string | null;
  clarification_options?: string[] | null;
  confidence: number;
  intent: 'search' | 'clarification';
  is_continuation?: boolean;
  raw?: unknown;
}
```

---

### 3. `src/prompts/queryNormalizerPrompt.ts` (Major Rewrite)

**Remove this rule from `SYSTEM_PROMPT`:**
> "NEVER include asset type words like 'movies', 'series', 'shows', 'films', 'TV', 'episodes'"

**New `SYSTEM_PROMPT` structure:**

```
You are a search intent parser for Peacock streaming service.
Your job is to convert natural language queries into structured search parameters.

## Output Schema
{
  "intent_type": "standard_search" | "similar_to" | "browse_category",
  "similar_to_title": string | null,
  "search_terms": {
    "primary": string | null,
    "moods": string[],
    "themes": string[],
    "scenarios": string[]
  },
  "filters": {
    "entity_types": ("movie" | "series" | "programme")[],
    "genres": string[],
    "subgenres": string[]
  },
  "fallback_terms": string[],
  "assistant_message": string,
  "confidence": number,
  "needs_clarification": boolean,
  "clarification_question": string | null,
  "clarification_type": string | null,
  "clarification_options": string[] | null,
  "intent": "search" | "clarification"
}

## Entity Type Detection
- "movie(s)", "film(s)" → entity_types: ["movie"]
- "show(s)", "series", "TV show(s)" → entity_types: ["series"]
- "episode(s)" → entity_types: ["programme"]
- If not specified → empty array []

IMPORTANT: DO NOT discard entity type information. Extract it as a filter.

## Search Terms Categories

### Primary (search_terms.primary)
- Person names: "Tom Hanks", "Daniel Radcliffe"
- Sports: "Lakers", "LeBron James"
- Title keywords: "Batman", "Christmas"
- Time periods: "80s", "90s"

### Moods (search_terms.moods) - match videomood tags
light, dark, intense, brutal, thrilling, melodramatic, suspenseful,
heartwarming, uplifting, gritty, whimsical, nostalgic, eerie, haunting

### Themes (search_terms.themes) - match theme tags
Redemption, Conflict, Love, Betrayal, Coming of Age, Family, Friendship,
Survival, Justice, Identity, Power, Freedom

### Scenarios (search_terms.scenarios) - match scenario tags
On The Run, Manhunt, Heist, Undercover, Time Travel, Apocalypse,
Courtroom, Prison, Space Exploration, Road Trip

## Genre Extraction (filters.genres)
Action, Comedy, Drama, Horror, Sci-Fi, Romance, Documentary, Animation,
Thriller, Mystery, Crime, Fantasy, Family, Adventure

## Intent Types
- standard_search: Normal search with terms/filters
- similar_to: "movies like X" - set similar_to_title AND search_terms.primary
- browse_category: Pure category browse, no specific search term

## Key Rules
1. ALWAYS extract entity_types when user specifies movie/series/show
2. Person names → search_terms.primary
3. Moods ("light", "dark") → search_terms.moods
4. Genres → filters.genres
5. For similar_to, populate BOTH similar_to_title AND search_terms.primary
```

---

### 4. Update Few-Shot Examples

**File:** `src/prompts/queryNormalizerPrompt.ts`

Replace `FEW_SHOT_EXAMPLES` with new schema examples:

```typescript
export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    input: 'Show me Christmas movies',
    output: {
      intent_type: 'standard_search',
      similar_to_title: null,
      search_terms: { primary: 'Christmas', moods: [], themes: [], scenarios: [] },
      filters: { entity_types: ['movie'], genres: [], subgenres: [] },
      fallback_terms: ['holiday'],
      assistant_message: 'Searching for Christmas movies.',
      confidence: 0.95,
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      intent: 'search',
    },
  },
  {
    input: 'Daniel Radcliffe movies',
    output: {
      intent_type: 'standard_search',
      similar_to_title: null,
      search_terms: { primary: 'Daniel Radcliffe', moods: [], themes: [], scenarios: [] },
      filters: { entity_types: ['movie'], genres: [], subgenres: [] },
      fallback_terms: ['Harry Potter'],
      assistant_message: 'Searching for Daniel Radcliffe movies.',
      confidence: 0.94,
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      intent: 'search',
    },
  },
  {
    input: 'I want something light and funny',
    output: {
      intent_type: 'standard_search',
      similar_to_title: null,
      search_terms: { primary: null, moods: ['light'], themes: [], scenarios: [] },
      filters: { entity_types: [], genres: ['Comedy'], subgenres: [] },
      fallback_terms: ['comedy', 'light comedy'],
      assistant_message: 'Searching for light-hearted comedies.',
      confidence: 0.86,
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      intent: 'search',
    },
  },
  {
    input: 'movies like Inception',
    output: {
      intent_type: 'similar_to',
      similar_to_title: 'Inception',
      search_terms: { primary: 'Inception', moods: [], themes: [], scenarios: [] },
      filters: { entity_types: ['movie'], genres: [], subgenres: [] },
      fallback_terms: ['sci-fi thriller', 'Christopher Nolan'],
      assistant_message: 'Finding movies similar to Inception.',
      confidence: 0.91,
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      intent: 'search',
    },
  },
  {
    input: 'Tom Hanks dramas from the 90s',
    output: {
      intent_type: 'standard_search',
      similar_to_title: null,
      search_terms: { primary: 'Tom Hanks 90s', moods: [], themes: [], scenarios: [] },
      filters: { entity_types: [], genres: ['Drama'], subgenres: [] },
      fallback_terms: ['Tom Hanks', '90s drama'],
      assistant_message: 'Searching for 90s dramas with Tom Hanks.',
      confidence: 0.92,
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      intent: 'search',
    },
  },
  {
    input: 'dark thriller about a manhunt',
    output: {
      intent_type: 'standard_search',
      similar_to_title: null,
      search_terms: { primary: null, moods: ['dark'], themes: [], scenarios: ['manhunt'] },
      filters: { entity_types: [], genres: ['Thriller'], subgenres: [] },
      fallback_terms: ['manhunt', 'thriller'],
      assistant_message: 'Searching for dark manhunt thrillers.',
      confidence: 0.87,
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      intent: 'search',
    },
  },
  {
    input: 'Lakers games',
    output: {
      intent_type: 'standard_search',
      similar_to_title: null,
      search_terms: { primary: 'Lakers', moods: [], themes: [], scenarios: [] },
      filters: { entity_types: [], genres: [], subgenres: [] },
      fallback_terms: ['NBA', 'basketball'],
      assistant_message: 'Searching for Lakers content.',
      confidence: 0.90,
      needs_clarification: false,
      clarification_question: null,
      clarification_type: null,
      clarification_options: null,
      intent: 'search',
    },
  },
  {
    input: 'show me movies with Chris',
    output: {
      intent_type: 'standard_search',
      similar_to_title: null,
      search_terms: { primary: null, moods: [], themes: [], scenarios: [] },
      filters: { entity_types: ['movie'], genres: [], subgenres: [] },
      fallback_terms: [],
      assistant_message: 'I need a bit more detail.',
      confidence: 0.45,
      needs_clarification: true,
      clarification_question: 'Do you mean Chris Pratt, Chris Evans, or Chris Hemsworth?',
      clarification_type: 'actor_ambiguity',
      clarification_options: ['Chris Pratt', 'Chris Evans', 'Chris Hemsworth'],
      intent: 'clarification',
    },
  },
];
```

**Also update `FewShotExample` interface** to match new output structure.

---

### 5. `src/services/searchNormalizationService.ts`

**Add a new function to build Suggest API params:**

```typescript
export function buildSuggestParams(intent: SearchIntent): SuggestParams {
  // Combine all search term components into the term
  const termParts: string[] = [];
  
  if (intent.search_terms.primary) {
    termParts.push(intent.search_terms.primary);
  }
  
  // Add moods (match videomood tags)
  termParts.push(...intent.search_terms.moods);
  
  // Add themes (match theme tags)
  termParts.push(...intent.search_terms.themes);
  
  // Add scenarios (match scenario tags)
  termParts.push(...intent.search_terms.scenarios);
  
  const params: SuggestParams = {
    term: termParts.join(' '),
  };
  
  // Add filters if present
  if (intent.filters.entity_types.length > 0) {
    params.entitytype = intent.filters.entity_types;
  }
  
  if (intent.filters.genres.length > 0) {
    params.g = intent.filters.genres;
  }
  
  if (intent.filters.subgenres.length > 0) {
    params.sg = intent.filters.subgenres;
  }
  
  return params;
}

export function buildFallbackParams(
  intent: SearchIntent
): SuggestParams[] {
  // Build fallback params from fallback_terms
  // Each fallback progressively broadens the search
  return intent.fallback_terms?.map((term, index) => {
    // First fallback keeps entity type, subsequent ones remove it
    if (index === 0 && intent.filters.entity_types.length > 0) {
      return { term, entitytype: intent.filters.entity_types };
    }
    return { term };
  }) ?? [];
}
```

**Update `processNormalization` to include new fields in response:**

```typescript
return {
  conversation_id: conversationId,
  
  // NEW: Structured intent
  intent: {
    intent_type: output.intent_type,
    similar_to_title: output.similar_to_title ?? null,
    search_terms: output.search_terms,
    filters: output.filters,
  },
  
  // NEW: Pre-built Suggest API params
  suggest_params: buildSuggestParams(output),
  
  // NEW: Fallback params
  fallback_params: buildFallbackParams(output),
  
  // EXISTING: Keep for backward compat
  assistant_message: output.assistant_message,
  needs_clarification: output.needs_clarification,
  clarification_question: output.clarification_question,
  clarification_type: output.clarification_type ?? null,
  clarification_options: output.clarification_options ?? null,
  confidence: output.confidence,
  validation_status: 'valid',
};
```

---

### 6. `src/fallback/fallbackNormalizer.ts`

**Update `generateFallbackResponse` to include new structure:**

```typescript
export function generateFallbackResponse(
  userMessage: string,
  conversationId: string
): SearchNormalizationResponse {
  const sanitized = sanitizeInput(userMessage);
  const fallbackTerms = generateLocalFallbacks(sanitized);
  
  return {
    conversation_id: conversationId,
    
    // NEW: Structured intent with fallback values
    intent: {
      intent_type: 'standard_search',
      similar_to_title: null,
      search_terms: {
        primary: sanitized,
        moods: [],
        themes: [],
        scenarios: [],
      },
      filters: {
        entity_types: [],
        genres: [],
        subgenres: [],
      },
    },
    
    // NEW: Suggest params
    suggest_params: {
      term: sanitized,
    },
    
    // NEW: Fallback params
    fallback_params: fallbackTerms.map(term => ({ term })),
    
    // EXISTING
    assistant_message: 'Searching your request.',
    needs_clarification: false,
    clarification_question: null,
    clarification_type: null,
    clarification_options: null,
    confidence: 0.5,
    validation_status: 'fallback',
  };
}
```

---

### 7. `src/validation/outputGuards.ts`

**Update validation to handle new schema:**

- Add validation for `intent_type`
- Add validation for `search_terms` structure
- Add validation for `filters` structure
- Ensure backward compatibility with existing fields

---

## Similar Titles Handling

**No special handling needed.** The Suggest API automatically:
1. Finds the matching title when you search `term=Inception`
2. Recognizes it as a good "seed" for similar titles
3. Calls the Recs service to get recommendations
4. Merges similar content into results

For "similar_to" intent, just search for the title:
```json
{
  "suggest_params": {
    "term": "Inception",
    "entitytype": ["movie"]
  }
}
```

The Suggest API handles the rest internally.

---

## Migration Notes

### Backward Compatibility

The response should include BOTH:
1. **New fields:** `intent`, `suggest_params`, `fallback_params`
2. **Old fields:** `search_term` (if needed), `fallback_terms`, etc.

This allows clients to migrate gradually.

### Testing Checklist

After implementation, test these queries:

| Query | Expected `suggest_params` |
|-------|---------------------------|
| "Christmas movies" | `term: "Christmas", entitytype: ["movie"]` |
| "Daniel Radcliffe movies" | `term: "Daniel Radcliffe", entitytype: ["movie"]` |
| "Something light and funny" | `term: "light", g: ["Comedy"]` |
| "Movies like Inception" | `term: "Inception", entitytype: ["movie"]` |
| "Dark thriller about revenge" | `term: "dark revenge", g: ["Thriller"]` |
| "Tom Hanks" | `term: "Tom Hanks"` (no filters) |
| "Lakers games" | `term: "Lakers"` |
| "90s action movies" | `term: "90s", entitytype: ["movie"], g: ["Action"]` |

---

## Summary of Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/validation/responseSchemas.ts` | Add | New schemas for structured output |
| `src/llm/QueryNormalizerModel.ts` | Update | Extended interface |
| `src/prompts/queryNormalizerPrompt.ts` | Rewrite | New prompt with entity extraction |
| `src/services/searchNormalizationService.ts` | Update | Add param building functions |
| `src/fallback/fallbackNormalizer.ts` | Update | Include new structure in fallback |
| `src/validation/outputGuards.ts` | Update | Validate new schema |
