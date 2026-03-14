# Hybrid Search Database Schema for Peacock MoodChat

## Overview

This schema powers a hybrid search system combining:
- **Lexical Search**: Fast keyword matching on titles, cast, directors, genres
- **Semantic Search**: Vector embeddings for synopsis/description understanding
- **Filtering**: Faceted filtering by genre, year, content type, ratings

## Design Principles

1. **Denormalized for Search Performance**: Single `content` table contains all searchable fields
2. **Separate Vector Storage**: Embeddings stored in dedicated table for flexibility
3. **Unified Content Types**: SERIES, MOVIE, SLE all use same base structure
4. **MoodChat Optimized**: All fields needed for tile display included

---

## Core Tables

### 1. `content` - Main Searchable Content Table

| Field | Type | Description | Search Role |
|-------|------|-------------|-------------|
| **Identity** |
| `id` | UUID | Primary key (from Calypso `id`) | - |
| `content_type` | ENUM | `SERIES`, `MOVIE`, `SLE` | Filter |
| `provider_series_id` | VARCHAR(64) | For series lookups | Lookup |
| `provider_variant_id` | UUID | For movie/SLE lookups | Lookup |
| `slug` | VARCHAR(255) | URL-friendly path | Lookup |
| **Lexical Search Fields** |
| `title` | VARCHAR(255) | Primary title | Lexical (boosted 3x) |
| `title_sort` | VARCHAR(255) | Normalized sort title | Sort |
| `title_keywords` | TEXT | Title + alternate titles combined | Lexical |
| `cast_names` | TEXT[] | Array of cast member names | Lexical (boosted 1.5x) |
| `director_names` | TEXT[] | Array of director names | Lexical (boosted 1.5x) |
| `producer_names` | TEXT[] | Array of producer names | Lexical |
| `genres` | TEXT[] | Genre tags (e.g., "Horror", "Comedy") | Lexical + Filter |
| **Semantic Search Fields** |
| `synopsis_short` | TEXT | Brief description (1-2 sentences) | Semantic |
| `synopsis_long` | TEXT | Full description | Semantic |
| `synopsis_combined` | TEXT | All synopses concatenated for embedding | Semantic (primary) |
| **Display Fields (MoodChat UI)** |
| `image_landscape_url` | TEXT | 16:9 landscape image | Display |
| `image_poster_url` | TEXT | 2:3 poster image | Display |
| `image_title_logo_url` | TEXT | Title treatment/logo | Display |
| `content_rating` | VARCHAR(10) | MPAA/TV rating (R, PG-13, TV-MA) | Filter + Display |
| `fan_score` | SMALLINT | Rotten Tomatoes fan score (0-100) | Filter + Display |
| `critic_score` | SMALLINT | Rotten Tomatoes critic score (0-100) | Filter + Display |
| `user_rating` | DECIMAL(2,1) | Peacock user rating (0-5) | Filter + Display |
| **Metadata** |
| `release_year` | SMALLINT | Year of release | Filter + Sort |
| `duration_minutes` | SMALLINT | Runtime in minutes | Filter |
| `season_count` | SMALLINT | Number of seasons (series only) | Display |
| `episode_count` | SMALLINT | Total episodes (series only) | Display |
| `content_segments` | TEXT[] | Availability tiers (D2C, AVOD, etc.) | Filter |
| `is_live` | BOOLEAN | Live/linear content flag | Filter |
| **Timestamps** |
| `created_at` | TIMESTAMP | When added to catalog | Sort |
| `updated_at` | TIMESTAMP | Last metadata update | Maintenance |
| `indexed_at` | TIMESTAMP | Last search index update | Maintenance |

**Indexes:**
```sql
-- Lexical search (full-text)
CREATE INDEX idx_content_title_fts ON content USING gin(to_tsvector('english', title));
CREATE INDEX idx_content_cast_fts ON content USING gin(to_tsvector('english', array_to_string(cast_names, ' ')));
CREATE INDEX idx_content_synopsis_fts ON content USING gin(to_tsvector('english', synopsis_combined));

-- Filtering
CREATE INDEX idx_content_type ON content(content_type);
CREATE INDEX idx_content_genres ON content USING gin(genres);
CREATE INDEX idx_content_year ON content(release_year);
CREATE INDEX idx_content_rating ON content(content_rating);
CREATE INDEX idx_content_scores ON content(fan_score, critic_score);

-- Lookups
CREATE UNIQUE INDEX idx_provider_series ON content(provider_series_id) WHERE provider_series_id IS NOT NULL;
CREATE UNIQUE INDEX idx_provider_variant ON content(provider_variant_id) WHERE provider_variant_id IS NOT NULL;
```

---

### 2. `content_embeddings` - Vector Embeddings Table

| Field | Type | Description |
|-------|------|-------------|
| `content_id` | UUID | FK to content.id |
| `embedding_type` | ENUM | `synopsis`, `title`, `combined` |
| `embedding` | VECTOR(1536) | OpenAI ada-002 embedding (or 384 for MiniLM) |
| `model_version` | VARCHAR(50) | Model used (e.g., "text-embedding-ada-002") |
| `created_at` | TIMESTAMP | When embedding was generated |

**Indexes:**
```sql
-- Vector similarity search (using pgvector)
CREATE INDEX idx_embeddings_vector ON content_embeddings 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Or for HNSW (better recall):
CREATE INDEX idx_embeddings_hnsw ON content_embeddings 
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
```

---

### 3. `trailers` - Trailer Metadata for Playback

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `content_id` | UUID | FK to content.id |
| `title` | VARCHAR(255) | Trailer title |
| `duration_seconds` | INT | Duration |
| `playback_url` | TEXT | Streaming URL |
| `thumbnail_url` | TEXT | Preview image |
| `trailer_type` | VARCHAR(50) | "theatrical", "teaser", "clip" |
| `sort_order` | SMALLINT | Display order |

---

## Denormalization Decisions

### Why Denormalize?

1. **Single Query Results**: MoodChat needs title, image, rating in one query
2. **Search Performance**: Avoids JOINs during search operations
3. **Vector Search Simplicity**: Embeddings link directly to displayable content

### Trade-offs

| Decision | Benefit | Cost |
|----------|---------|------|
| Cast as TEXT[] in content | Fast lexical search | Storage duplication |
| Images URLs inline | No JOIN for tile display | URL updates need content update |
| Separate embeddings table | Swap embedding models easily | Extra JOIN for hybrid search |

---

## Hybrid Search Query Strategy

### Phase 1: Parallel Execution

```sql
-- Lexical Search (BM25-style scoring)
WITH lexical_results AS (
  SELECT id,
    ts_rank(to_tsvector('english', title), query) * 3 +
    ts_rank(to_tsvector('english', array_to_string(cast_names, ' ')), query) * 1.5 +
    ts_rank(to_tsvector('english', synopsis_combined), query) AS lexical_score
  FROM content, plainto_tsquery('english', :search_term) query
  WHERE to_tsvector('english', title || ' ' || synopsis_combined) @@ query
  LIMIT 100
),

-- Semantic Search (Vector similarity)
semantic_results AS (
  SELECT c.id,
    1 - (e.embedding <=> :query_embedding) AS semantic_score
  FROM content c
  JOIN content_embeddings e ON c.id = e.content_id
  WHERE e.embedding_type = 'combined'
  ORDER BY e.embedding <=> :query_embedding
  LIMIT 100
)

-- Combine with RRF (Reciprocal Rank Fusion)
SELECT c.*,
  COALESCE(1.0 / (60 + l.rank), 0) + COALESCE(1.0 / (60 + s.rank), 0) AS rrf_score
FROM content c
LEFT JOIN (SELECT id, ROW_NUMBER() OVER (ORDER BY lexical_score DESC) as rank FROM lexical_results) l ON c.id = l.id
LEFT JOIN (SELECT id, ROW_NUMBER() OVER (ORDER BY semantic_score DESC) as rank FROM semantic_results) s ON c.id = s.id
WHERE l.id IS NOT NULL OR s.id IS NOT NULL
ORDER BY rrf_score DESC
LIMIT 20;
```

---

## MoodChat UI Field Mapping

| UI Component | Database Field(s) |
|--------------|-------------------|
| Tile Title | `title` |
| Tile Image | `image_landscape_url` |
| Content Badge | `content_type`, `content_rating` |
| Rating Stars | `user_rating` or `fan_score` |
| Duration | `duration_minutes` |
| Trailer Preview | `trailers.playback_url` (JOIN) |
| Navigate to PDP | `slug` or `provider_variant_id` |
| Season Info | `season_count`, `episode_count` |

---

## Content Type Specifics

### SERIES (CATALOGUE/SERIES)
- Uses `provider_series_id` for lookups
- `season_count` and `episode_count` populated
- Related to `series_hierarchy` for drill-down
- Trailers linked via `content_id`

### MOVIE (ASSET/PROGRAMME)
- Uses `provider_variant_id` for lookups
- `release_year` from `year` attribute
- `director_names` populated
- Direct playback routing

### SLE (ASSET/SLE)
- Uses `provider_variant_id` for lookups
- `is_live = true`
- May have `event_details` JSON for sports metadata
- Time-sensitive (may need expiration handling)

---

## Embedding Strategy

### What to Embed

| Field | Embed? | Rationale |
|-------|--------|-----------|
| `title` | Optional | Usually covered by lexical |
| `synopsis_short` | ✅ Yes | Core semantic meaning |
| `synopsis_long` | ✅ Yes | Richer context |
| `genres` | No | Better as filters |
| `cast_names` | No | Lexical works better |

### Combined Embedding Template

```
Title: {title}
Genre: {genres joined}
Description: {synopsis_long}
Starring: {cast_names joined}
```

This provides the embedding model with structured context for better semantic understanding.

---

## Example Data

### Sample `content` Row (Movie)

```json
{
  "id": "a86aface-bd35-11ed-b0fe-137887194c12",
  "content_type": "MOVIE",
  "provider_variant_id": "7dee330f-341c-3fd0-830a-fc2b16f23ce7",
  "title": "Knock at the Cabin",
  "cast_names": ["Dave Bautista", "Jonathan Groff", "Ben Aldridge"],
  "director_names": ["M. Night Shyamalan"],
  "genres": ["Horror", "Thriller"],
  "synopsis_short": "Four armed strangers hold a family hostage in a remote cabin, forcing them to make an unthinkable choice to avert the apocalypse.",
  "image_landscape_url": "https://img.peacock.../landscape.jpg",
  "content_rating": "R",
  "fan_score": 63,
  "critic_score": 67,
  "release_year": 2023,
  "duration_minutes": 100,
  "slug": "/movies/knock-at-the-cabin/7dee330f-341c-3fd0-830a-fc2b16f23ce7"
}
```

### Semantic Search Example

**User Query**: "movie about a family trapped with strangers who claim the world will end"

This query has NO keyword overlap with "Knock at the Cabin" title, but the synopsis embedding would match:
- "family hostage" ↔ "family trapped"
- "avert the apocalypse" ↔ "world will end"
- "armed strangers" ↔ "strangers"

**Result**: High semantic similarity score, surfacing content that keyword search would miss.

---

## Technology Recommendations

| Component | Recommended | Alternatives |
|-----------|-------------|--------------|
| Database | PostgreSQL + pgvector | Pinecone, Weaviate, Qdrant |
| Embeddings | OpenAI text-embedding-3-small | Cohere, Sentence-BERT |
| Lexical | PostgreSQL FTS | Elasticsearch, Meilisearch |
| Caching | Redis | Memcached |

PostgreSQL with pgvector provides a unified solution avoiding the complexity of separate vector databases while maintaining good performance for Peacock's catalog size (~50K titles).

