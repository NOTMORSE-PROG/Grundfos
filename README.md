# GrundMatch -- AI Pump Advisor for Grundfos

GrundMatch is a full-stack AI-powered pump selection tool built for the Grundfos Hackathon (Challenge 5: "The One Super Idea"). It helps users find the right Grundfos pump through conversational AI, right-sizing analysis, competitor cross-referencing via OCR, and ROI business case generation.

---

## Table of Contents

- [Technical Approach](#technical-approach)
- [Architecture](#architecture)
- [User Entry Points](#user-entry-points)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)

---

## Technical Approach

### Hybrid AI Architecture

GrundMatch uses a **hybrid architecture** where the recommendation engine handles all calculations and pump matching, while the LLM (Groq / Llama 3.1) handles only natural language conversation. This separation ensures that technical outputs (duty points, ROI figures, pump specs) are deterministic and accurate, while the user-facing dialogue remains natural and approachable.

**How it works:**

1. The user sends a message via the chat interface.
2. The **recommendation engine** extracts intent from the full conversation history using regex-based pattern matching (application type, building size, floor count, flow rate, head pressure).
3. The engine decides the next action: **ask** (gather more information) or **recommend** (calculate and present results).
4. If recommending, the engine derives a duty point, matches pumps from the catalog, and calculates ROI against a 40% oversized baseline (the industry-standard problem GrundMatch solves).
5. The **LLM** receives the engine's structured output and generates a natural language explanation, streamed back to the user via Server-Sent Events (SSE).
6. Structured metadata (suggestions, requirements summary, pump cards with ROI) is sent alongside the stream as separate SSE events, rendered by dedicated UI components.

### Right-Sizing as the Core Differentiator

The central value proposition is proving the financial and environmental cost of oversized pumps. Every recommendation includes an ROI comparison against a pump that is 40% larger than necessary (reflecting common industry practice). The calculations include:

- Annual energy cost savings
- Payback period (in months)
- CO2 reduction (tonnes/year)
- 10-year total savings
- Lifecycle cost analysis

### Duty Point Derivation

For non-technical users who describe their building rather than providing specs, GrundMatch derives a duty point (flow rate + head pressure) from building parameters using embedded engineering rules:

- **Heating/Cooling**: Heat load per square meter, temperature differential, pipe friction factors
- **Water Supply**: Liters per person per day, peak demand factors, static head from floor count

### OCR-Based Pump Replacement

Users can upload a photo of an existing pump's nameplate. Tesseract.js extracts text and regex patterns parse out brand, model, power, voltage, flow, and head. The system cross-references competitor equivalents in the catalog to recommend a matching Grundfos pump.

### PDF Business Case Generation

The ROI report feature generates a branded PDF (via jsPDF) containing a side-by-side comparison of the current vs. proposed pump, financial summary, sustainability metrics, and annual cost breakdown. This is designed to give facility managers a ready-made document for procurement approval.

---

## Architecture

```
Client (React 19 + Zustand)
    |
    v
Next.js 16 API Routes
    |
    +---> /api/chat -------> Recommendation Engine (intent, matching, ROI)
    |                             |
    |                             +---> Sizing Calculations (duty point derivation)
    |                             +---> Energy Calculations (ROI, payback, CO2)
    |                             +---> Pump Catalog (JSON, ~20 pumps)
    |                             |
    |                        Groq Cloud (Llama 3.1 8B) <--- LLM for explanation only
    |
    +---> /api/ocr --------> Tesseract.js (nameplate text extraction)
    +---> /api/report -----> jsPDF (PDF business case generation)
    +---> /api/uploadthing -> UploadThing (image uploads)
    |
    v
Supabase (PostgreSQL + pgvector + Auth)
    +---> conversations, messages (chat persistence)
    +---> pumps, pump_embeddings (vector search, future RAG)
    +---> sizing_rules, energy_rates (domain knowledge)
```

---

## User Entry Points

GrundMatch serves three distinct user personas through a single chat interface:

1. **"I have a problem"** -- A non-technical user describes their building (e.g., "5-floor office, heating system"). The AI derives a duty point from building parameters and recommends a right-sized pump with ROI savings.

2. **"I know my specs"** -- An engineer provides exact flow and head values. The engine still asks for application context (to determine operating hours), then matches pumps and shows oversizing warnings if applicable.

3. **"Replace a pump"** -- A maintenance technician uploads a photo of an existing pump nameplate. OCR extracts specs, the system cross-references competitor brands (Wilo, KSB, Xylem, etc.), and recommends a Grundfos equivalent.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router) |
| Language | TypeScript 5 |
| UI | React 19, TailwindCSS 4, shadcn/ui (Radix primitives) |
| State | Zustand 5 |
| LLM | Groq Cloud (llama-3.1-8b-instant) |
| Embeddings | HuggingFace (sentence-transformers/all-MiniLM-L6-v2, 384 dims) |
| Database | Supabase (PostgreSQL + pgvector + Auth + Storage) |
| OCR | Tesseract.js 7 |
| File Uploads | UploadThing |
| PDF | jsPDF |
| Icons | Lucide React |
| Markdown | react-markdown + remark-gfm |

---

## Project Structure

```
src/
  app/
    page.tsx                        # Landing page (hero, features, products)
    chat/page.tsx                   # Chat interface (main AI advisor)
    api/
      chat/route.ts                 # Streaming chat endpoint (SSE)
      chat/[id]/route.ts            # Fetch single conversation
      conversations/route.ts        # List conversations
      ocr/route.ts                  # Nameplate OCR processing
      report/route.ts               # PDF report generation
      uploadthing/                  # File upload handlers
  components/
    chat/
      ChatInput.tsx                 # Message input with image upload
      ChatMessages.tsx              # Message list with scroll
      EmptyState.tsx                # Welcome screen with 3 entry points
      ImageUpload.tsx               # Image upload + OCR trigger
      MessageBubble.tsx             # User/assistant message rendering
      PumpRecommendationCard.tsx    # Pump card with specs + ROI summary
      RequirementsSummary.tsx       # Extracted duty point display
      SuggestionChips.tsx           # Clickable follow-up suggestions
    sidebar/
      ConversationSidebar.tsx       # Chat history navigation
    auth/
      AuthModal.tsx                 # Sign in / sign up modal
    ui/                             # shadcn/ui primitives
  lib/
    recommendation-engine.ts        # Intent extraction, pump matching, ROI
    calculations/
      energy.ts                     # ROI, payback, CO2, lifecycle cost
      sizing.ts                     # Building params to duty point
    prompts.ts                      # LLM system prompts
    groq.ts                         # Groq client
    embeddings.ts                   # HuggingFace embedding API
    chat-store.ts                   # Zustand store
    supabase.ts                     # Supabase client
    auth.ts                         # Auth helpers
    parse-message-metadata.ts       # LLM output sanitization
    utils.ts                        # Tailwind cn() utility
  data/
    pump-catalog.json               # Seed catalog (~20 Grundfos pumps)
supabase/
  migrations/
    001_initial_schema.sql          # Full database schema with pgvector
```

---

## Database Schema

The Supabase PostgreSQL database includes the following tables:

- **pumps** -- Pump catalog with specs (flow, head, power, EEI, energy class, applications)
- **pump_embeddings** -- pgvector embeddings (384 dimensions) for semantic pump search
- **conversations** -- Chat sessions tied to users
- **messages** -- Chat messages with role, content, and JSONB metadata
- **sizing_rules** -- Domain knowledge for duty point derivation by application type
- **energy_rates** -- Regional electricity rates and CO2 factors (PH, US, EU, Global)

Vector similarity search is handled by a `match_pumps` SQL function using cosine distance.

---

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project with pgvector enabled
- API keys for Groq, HuggingFace, and UploadThing

### Installation

```bash
git clone https://github.com/NOTMORSE-PROG/Grundfos.git
cd Grundfos
npm install
```

### Database Setup

Run the migration against your Supabase project:

```bash
supabase db push
```

Or execute `supabase/migrations/001_initial_schema.sql` directly in the Supabase SQL editor.

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page. Navigate to [http://localhost:3000/chat](http://localhost:3000/chat) to start the AI advisor.

---

## Environment Variables

Create a `.env.local` file in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Groq (LLM inference)
GROQ_API_KEY=gsk_your_key

# HuggingFace (embeddings)
HUGGINGFACE_API_KEY=hf_your_token

# UploadThing (file uploads)
UPLOADTHING_TOKEN=your_token
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
