# Peacock AI Search Integration – UI + API Integration Spec

## Purpose

Define how the Peacock mobile UI should integrate with the new AI Search Normalization API so that existing text and voice search inputs no longer call the search API directly.

Instead, the app should:

1. send the user request to the AI Search Normalization API
2. interpret the AI API response
3. either:
   - show a clarification bubble and wait for user follow-up
   - or show the assistant bubble and call the existing search API using `search_term`
4. display search results in a rail below the bubble, consistent with the current search experience

This document is intended to be used by engineering to implement the end-to-end client integration.

---

## High-Level User Flow

### Current Flow
Today the app does:

```text
voice/text input → search API → results rail
```

### New Flow
The new flow should be:

```text
voice/text input
    ↓
AI Search Normalization API
    ↓
interpret AI response
    ↓
if clarification:
    show MoodChat bubble
    wait for user follow-up
else:
    show assistant bubble
    call search API with search_term
    show results rail below bubble
```

---

## Integration Goals

- Reuse the existing search and voice input UI
- Insert the AI API between the input and the search API
- Support multi-turn clarification using `conversation_id`
- Preserve the current result rail behavior once a final `search_term` is available
- Display assistant/clarification bubbles aligned to the right side of the screen
- Style those right-aligned bubbles with a different purple/blue background
- Use a chat bubble shape with a **square bottom-left corner** instead of a square bottom-right corner

---

## API Endpoints

### AI Search Normalization API
```bash
POST https://ai-search-api-jm6o.onrender.com//v1/search-normalization
```

### Sample Request
```bash
curl -X POST \
  https://ai-search-api-jm6o.onrender.com//v1/search-normalization \
  -H "Content-Type: application/json" \
  -d '{"user_request": "comedy with jim carrey"}'
```

---

## AI API Response Schema Used By The UI

### Successful Search-Term Response
```json
{
  "conversation_id": "092c0d90-cbf3-4bdb-bd65-65b552dfa937",
  "search_term": "comedy, Jim Carrey",
  "fallback_terms": [
    "Jim Carrey",
    "comedy movies",
    "comedy"
  ],
  "assistant_message": "Looking for comedy titles with Jim Carrey.",
  "needs_clarification": false,
  "clarification_question": null,
  "clarification_type": null,
  "clarification_options": null,
  "confidence": 0.95,
  "intent": "search",
  "validation_status": "valid",
  "debug": {
    "fallback_applied": false,
    "timings_ms": {
      "llm": 404,
      "validation": 404,
      "total": 404
    }
  }
}
```

### Clarification Response
```json
{
  "conversation_id": "2b3dc8ca-5fac-4581-821d-42b6d7fe8657",
  "search_term": null,
  "fallback_terms": [],
  "assistant_message": "I need a bit more detail.",
  "needs_clarification": true,
  "clarification_question": "Which actor from Harry Potter do you mean?",
  "clarification_type": "actor_ambiguity",
  "clarification_options": [
    "Daniel Radcliffe",
    "Rupert Grint",
    "Emma Watson"
  ],
  "confidence": 0.51,
  "intent": "clarification",
  "validation_status": "valid",
  "debug": {
    "fallback_applied": false,
    "timings_ms": {
      "llm": 526,
      "validation": 526,
      "total": 526
    }
  }
}
```

### Clarification Follow-Up Request
```bash
curl -X POST https://ai-search-api-jm6o.onrender.com/v1/search-normalization \
  -H "Content-Type: application/json" \
  -d '{
    "user_request": "The one that played Harry Potter",
    "conversation_id": "2b3dc8ca-5fac-4581-821d-42b6d7fe8657"
  }'
```

### Clarification Follow-Up Response
```json
{
  "conversation_id": "2b3dc8ca-5fac-4581-821d-42b6d7fe8657",
  "search_term": "Daniel Radcliffe",
  "fallback_terms": [
    "Harry Potter",
    "magical movies"
  ],
  "assistant_message": "Looking for titles with Daniel Radcliffe.",
  "needs_clarification": false,
  "clarification_question": null,
  "clarification_type": null,
  "clarification_options": null,
  "confidence": 0.93,
  "intent": "search",
  "validation_status": "valid",
  "debug": {
    "fallback_applied": false,
    "timings_ms": {
      "llm": 571,
      "validation": 571,
      "total": 571
    }
  }
}
```

---

## UI Behavior Rules

### Rule 1 – All user input goes to the AI API first
Both:
- text search input
- voice search input

must first call the AI Search Normalization API.

The existing direct search flow should be replaced with:

```text
user input → AI API → evaluate response → search API if applicable
```

Do not call the search API directly from raw user input anymore.

---

### Rule 2 – Clarification response behavior
When the AI API returns:
- `needs_clarification = true`
- and `clarification_question` is not null

the UI must:

1. display a **MoodChat bubble aligned to the right side of the screen**
2. set the bubble text to `clarification_question`
3. optionally render quick-reply chips/buttons using `clarification_options` if present
4. store the returned `conversation_id`
5. wait for the user to answer
6. send the next user answer back to the AI API including that `conversation_id`

#### Clarification bubble example
```text
Which actor from Harry Potter do you mean?
[Daniel Radcliffe] [Rupert Grint] [Emma Watson]
```

#### Important
No search API call should be made yet in this state.

The UI is waiting for the user follow-up.

---

### Rule 3 – Non-clarification response behavior
When the AI API returns:
- `needs_clarification = false`
- and `search_term` is not null

the UI must:

1. display a bubble aligned to the right side of the screen
2. set the bubble text to `assistant_message`
3. call the existing search API using the returned `search_term`
4. display the search results in a rail below the bubble, as it works today

#### Example
AI Response:
```json
{
  "search_term": "comedy, Jim Carrey",
  "assistant_message": "Looking for comedy titles with Jim Carrey.",
  "needs_clarification": false
}
```

UI:
- show bubble: `Looking for comedy titles with Jim Carrey.`
- call search API with: `comedy, Jim Carrey`
- render search rail under that bubble

---

### Rule 4 – Clarification follow-up behavior
If the previous AI response requested clarification, the next user input must include the `conversation_id` from that response.

#### Example request
```json
{
  "user_request": "The one that played Harry Potter",
  "conversation_id": "2b3dc8ca-5fac-4581-821d-42b6d7fe8657"
}
```

Then:
- if the AI returns another clarification, repeat clarification flow
- if the AI returns a final `search_term`, show the assistant bubble and execute search

---

### Rule 5 – Results placement
Whenever a valid search is executed:
- the resulting content rail must appear **below the corresponding assistant bubble**
- this should match the current search rail behavior already implemented in the app

This means the bubble becomes the explanation/context for the rail directly under it.

---

### Rule 6 – Bubble alignment and styling
All assistant/clarification bubbles produced from the AI response must be aligned to the **right side of the screen**.

These right-aligned bubbles must:
- use a background color different from normal/default chat bubbles
- use a **purple/blue** tone aligned with the screen color scheme
- use a chat bubble shape where the **bottom-left corner is square**
- the bottom-right corner should remain rounded

#### Styling intent
These bubbles should visually communicate:
- this is the system’s AI-guided search response
- this is distinct from generic UI chrome
- this is part of a conversational search flow

#### Visual requirements
- right aligned
- purple/blue background
- readable contrast for text
- square bottom-left corner
- rounded top-left, top-right, and bottom-right corners

#### Suggested styling note
If the app already has a `MoodChat` component, prefer extending it with a variant for AI search bubbles rather than creating a separate new component.

---

### Rule 7 – Clarification options as quick replies
If `clarification_options` is present and non-empty, the UI should display them as quick reply chips/buttons below the clarification bubble.

#### Example
```json
"clarification_options": [
  "Daniel Radcliffe",
  "Rupert Grint",
  "Emma Watson"
]
```

UI renders:
```text
[Daniel Radcliffe] [Rupert Grint] [Emma Watson]
```

Tapping a chip should:
- populate/send that value as the user follow-up
- include the current `conversation_id`
- call the AI API again

The user must still be allowed to type or speak a custom reply instead of tapping a chip.

---

### Rule 8 – Voice input support
Voice input should follow the exact same flow as text input once transcription is available.

#### Voice flow
```text
voice input → speech-to-text → AI API → clarification or search
```

After speech-to-text produces the user phrase:
- send it to the AI API as `user_request`
- then follow the same logic as text

No separate search handling path should exist for voice after transcription.

---

## Suggested Client State Model

The client should maintain enough local state to support multi-turn clarification and rail rendering.

### Suggested state fields
```ts
type AISearchState = {
  conversationId: string | null;
  awaitingClarification: boolean;
  lastClarificationQuestion: string | null;
  lastClarificationOptions: string[] | null;
  currentAssistantMessage: string | null;
  currentSearchTerm: string | null;
  currentFallbackTerms: string[];
};
```

### Notes
- `conversationId` must be preserved across clarification turns
- `awaitingClarification` determines whether the next input should be treated as a follow-up
- `currentSearchTerm` is the final term sent to the search API
- `currentFallbackTerms` may be preserved for future fallback logic, but do not need to be used by the UI yet unless desired

---

## Request Handling Logic

### Primary input handling
For every submitted input:

1. get the user text
2. build AI request payload
3. if awaiting clarification and `conversationId` exists, include `conversation_id`
4. call AI API
5. inspect response

#### Request payload rules
##### First turn
```json
{
  "user_request": "comedy with jim carrey"
}
```

##### Clarification follow-up
```json
{
  "user_request": "The one that played Harry Potter",
  "conversation_id": "2b3dc8ca-5fac-4581-821d-42b6d7fe8657"
}
```

---

## Response handling logic

### Case A – Clarification required
If:
- `needs_clarification === true`
- `clarification_question != null`

Then:
- save `conversation_id`
- set `awaitingClarification = true`
- render right-aligned clarification MoodChat bubble
- show clarification options if present
- do not call search API yet

### Case B – Search ready
If:
- `needs_clarification === false`
- `search_term != null`

Then:
- save `conversation_id`
- set `awaitingClarification = false`
- render right-aligned assistant MoodChat bubble with `assistant_message`
- call search API with `search_term`
- render rail below bubble

### Case C – Invalid / partial defensive handling
If the response is malformed or missing required fields:
- do not crash
- fail gracefully
- optionally show a generic right-aligned bubble such as:
  - `Let me try that again.`
- allow the user to retry

This should be rare, but the client should be defensive.

---

## Existing Search API Integration

The current search API integration should remain unchanged after the `search_term` is available.

Only the source of the search term changes.

### Before
```text
raw user query → search API
```

### After
```text
AI response.search_term → search API
```

### Important
The rail rendering logic should stay as close as possible to the current implementation to minimize regressions.

---

## Recommended Interaction Sequences

### Sequence 1 – Direct search from text
#### User input
```text
comedy with jim carrey
```

#### Client behavior
1. send to AI API
2. receive final `search_term`
3. show right-aligned assistant bubble:
   - `Looking for comedy titles with Jim Carrey.`
4. call search API with:
   - `comedy, Jim Carrey`
5. render search rail below bubble

---

### Sequence 2 – Direct search from voice
#### User speech
```text
show me action movies from the 90s
```

#### Client behavior
1. speech-to-text resolves transcript
2. send transcript to AI API
3. AI returns:
   - `search_term = "action, 90s"`
4. show assistant bubble
5. call search API
6. render rail

---

### Sequence 3 – Clarification flow
#### First user input
```text
Something with that guy from Harry Potter
```

#### Client behavior
1. call AI API
2. AI returns clarification
3. show right-aligned clarification bubble:
   - `Which actor from Harry Potter do you mean?`
4. render quick reply chips:
   - Daniel Radcliffe
   - Rupert Grint
   - Emma Watson
5. store `conversation_id`
6. wait for user follow-up

#### Follow-up input
```text
The one that played Harry Potter
```

#### Client behavior
1. call AI API with `conversation_id`
2. AI returns:
   - `search_term = "Daniel Radcliffe"`
   - `assistant_message = "Looking for titles with Daniel Radcliffe."`
3. show assistant bubble
4. call search API
5. render rail below bubble

---

## UI Component Recommendations

### Reuse existing components where possible
Prefer adapting the current UI rather than rebuilding the search experience.

#### Suggested reusable pieces
- existing search input component
- existing voice input trigger
- existing search results rail
- existing `MoodChat` bubble if already available

#### New or updated pieces likely needed
- AI Search orchestrator / coordinator layer
- right-aligned AI bubble variant
- clarification quick reply chip row
- conversation state holder

---

## Suggested Client Architecture

A thin orchestration layer should manage the AI-to-search sequence.

### Suggested responsibilities
Create a dedicated feature layer, for example:
- `AISearchCoordinator`
- or `AISearchViewModel`
- or `AISearchInteractor`

This layer should:
- accept text/voice input
- call AI API
- interpret AI response
- manage `conversation_id`
- trigger search API when ready
- expose UI state for bubble + rail rendering

### Avoid
Do not bury this logic directly inside the view/controller if possible. The clarification flow will get messy fast if the logic is spread across UI code.

---

## Error Handling Recommendations

### AI API failure
If the AI API fails:
- show a lightweight retry state or generic bubble
- optionally allow falling back to direct search using the raw user input if product wants that behavior

Recommended default:
- show a safe generic error bubble
- let the user retry

### Search API failure after valid AI response
If AI succeeds but search fails:
- keep the assistant bubble on screen
- show existing search failure UI behavior
- do not discard the conversational state

---

## Analytics / Telemetry Recommendations

Track at minimum:
- AI API request started
- AI API request succeeded
- AI API request failed
- clarification shown
- clarification option tapped
- clarification typed reply submitted
- voice-originated AI request
- search executed from AI response
- search term used
- rail rendered after AI search

Useful extra fields:
- `conversation_id`
- `intent`
- `needs_clarification`
- `confidence`
- `clarification_type`

This will help evaluate:
- clarification rate
- clarification completion rate
- AI-to-search conversion
- drop-off during clarification
- voice vs text quality differences

---

## Implementation Notes

### Minimal implementation path
For the first version, keep this simple:

- route all search text + voice transcripts through the AI API
- support clarification bubbles + follow-up via `conversation_id`
- show `assistant_message` when search is ready
- call existing search API using `search_term`
- render results in the current rail component

Do not overcomplicate the first rollout with:
- fallback term execution in the UI
- long conversation history rendering
- multiple stacked AI turns unless product wants that
- personalization behavior

---

## Suggested Pseudocode

```text
onUserSearchSubmitted(userInput):
    payload = { user_request: userInput }

    if state.awaitingClarification and state.conversationId exists:
        payload.conversation_id = state.conversationId

    aiResponse = callAISearchNormalizationAPI(payload)

    if aiResponse.needs_clarification and aiResponse.clarification_question:
        state.conversationId = aiResponse.conversation_id
        state.awaitingClarification = true
        state.lastClarificationQuestion = aiResponse.clarification_question
        state.lastClarificationOptions = aiResponse.clarification_options
        renderRightAlignedBubble(aiResponse.clarification_question, style=aiClarification)
        renderClarificationOptions(aiResponse.clarification_options)
        return

    if not aiResponse.needs_clarification and aiResponse.search_term:
        state.conversationId = aiResponse.conversation_id
        state.awaitingClarification = false
        state.currentAssistantMessage = aiResponse.assistant_message
        state.currentSearchTerm = aiResponse.search_term
        state.currentFallbackTerms = aiResponse.fallback_terms or []
        renderRightAlignedBubble(aiResponse.assistant_message, style=aiSearch)
        results = callSearchAPI(aiResponse.search_term)
        renderResultsRailBelowBubble(results)
        return

    renderRightAlignedBubble("Let me try that again.", style=aiSearchError)
```

---

## Acceptance Criteria

The implementation should be considered complete when:

1. text search input calls the AI API before the search API
2. voice search input calls the AI API before the search API
3. clarification responses show a right-aligned MoodChat bubble with `clarification_question`
4. clarification options appear as tappable chips when present
5. clarification follow-up requests include the previous `conversation_id`
6. non-clarification responses show a right-aligned assistant bubble with `assistant_message`
7. the search API is called using `search_term`
8. search results render in a rail below the assistant bubble
9. right-aligned AI bubbles use purple/blue styling
10. right-aligned AI bubbles have a square bottom-left corner
11. the flow works for both direct search and clarification follow-up
12. failures are handled gracefully without crashing the UI

---

## Final Notes

The main product behavior should feel like:
- the user can still search naturally with voice or text
- the UI feels more conversational
- the AI helps refine search when needed
- the existing search rail experience remains intact once a final search term is available

The most important design rule is:

> The AI API interprets the request.  
> The existing search API still retrieves the content.
