# Nodelings: Node & Nodeling Architecture

---

# Section 1: Nodes

Nodes are **supernodes** — a small set of generic building types that the user configures on placement. When you drag a "Pull" node onto the grid, you pick the service (Gmail, Notion, Slack, etc.) and it becomes a "Pull from Gmail" building in the world. This keeps the tray clean while supporting unlimited services.

## Design Rules

- **Supernodes, not service nodes.** The tray has ~8 node types, not 30. Each one configures into a specific instance on placement.
- **No Trigger/Send/Deploy.** The nodeling is the agent — it decides when to work and carries items to their destination.
- **Nodes are passive.** They sit there until a nodeling interacts with them.
- **One node per service per instance.** You place a Pull node, configure it for Gmail, and now you have a "Pull from Gmail" building. Want to also pull from Slack? Place another Pull node configured for Slack.

---

## The Supernodes

### 1. Pull
**What it does:** Reads/fetches data from an external source. The nodeling walks here and picks up whatever's new.

| Configured As | Service | What It Pulls |
|--------------|---------|---------------|
| Pull from Gmail | Gmail MCP | New emails, threads, attachments |
| Pull from Slack | Slack MCP | Messages, mentions, channel activity |
| Pull from Notion | Notion MCP | Page content, database records |
| Pull from Sheets | Sheets MCP | Rows, cell ranges, entire sheets |
| Pull from GitHub | GitHub MCP | Issues, PRs, commits, notifications |
| Pull from Drive | Drive MCP | Files, folder contents |
| Pull from Calendar | Calendar MCP | Events, availability |
| Pull from Linear | Linear MCP | Issues, project updates, cycles |
| Pull from Airtable | Airtable MCP | Records, views |
| Pull from Discord | Discord MCP | Messages, threads |
| Pull from Web | Scraper | Web pages, search results |
| Pull from API | HTTP | Any REST endpoint |
| Pull from Inbox | Webhook | External payloads, manual input |

**Icon:** Tray-arrow-down / download
**Color:** Cyan

---

### 2. Push
**What it does:** Writes/sends data to an external destination. The nodeling walks here and drops off its payload.

| Configured As | Service | What It Pushes |
|--------------|---------|----------------|
| Push to Gmail | Gmail MCP | Send email, save draft, add label |
| Push to Slack | Slack MCP | Post message, react, update topic |
| Push to Notion | Notion MCP | Create/update page, add to database |
| Push to Sheets | Sheets MCP | Write rows, update cells |
| Push to GitHub | GitHub MCP | Create issue, comment on PR, push commit |
| Push to Drive | Drive MCP | Upload file, move/rename |
| Push to Calendar | Calendar MCP | Create event, send invite |
| Push to Linear | Linear MCP | Create issue, update status |
| Push to Airtable | Airtable MCP | Create/update records |
| Push to Discord | Discord MCP | Send message, create thread |
| Push to API | HTTP | POST/PUT to any REST endpoint |

**Icon:** Tray-arrow-up / upload
**Color:** Cyan

---

### 3. Think
**What it does:** AI reasoning. The nodeling drops data in, the node calls an LLM, and the nodeling picks up the result. Configurable by *purpose* rather than service.

| Configured As | What It Does |
|--------------|-------------|
| Think: Reason | General-purpose AI reasoning, planning, decision-making. The default. |
| Think: Summarize | Condensation. Long content in, concise summary out. |
| Think: Classify | Label content — sentiment, category, intent, priority. Returns a tag. |
| Think: Rewrite | Tone adjustment, humanization, style transfer. Make it sound different. |
| Think: Generate Image | Text-to-image (DALL-E, Stable Diffusion, etc.). |
| Think: Embed | Convert text to vector embeddings for semantic search/RAG. |

**Icon:** Sparkle
**Color:** Violet

---

### 4. Decide
**What it does:** Branches the nodeling's path based on a condition. The nodeling arrives, the condition is evaluated, and it walks down one of two paths.

| Configured As | Condition Type |
|--------------|---------------|
| Decide: If/Else | Boolean condition on the payload (contains X, equals Y, is empty) |
| Decide: Classify Route | Routes based on a classification label (urgent/normal/spam → different paths) |
| Decide: Threshold | Numeric comparison (score > 0.8, count < 10) |

**Icon:** Diamond / git-branch
**Color:** Amber

---

### 5. Transform
**What it does:** Reshapes, filters, or manipulates data without calling an external service.

| Configured As | What It Does |
|--------------|-------------|
| Transform: Map | Rename, restructure, or select specific fields from the payload |
| Transform: Filter | Pass/reject — items meeting criteria pass through, others are discarded |
| Transform: Combine | Merge multiple items into one (nodeling drops two things in, picks up one) |
| Transform: Split | Break a list into separate items (nodeling drops one in, picks up many) |
| Transform: Code | Run custom JavaScript or Python on the data. The escape hatch. |

**Icon:** Arrows-shuffle
**Color:** Amber

---

### 6. Store
**What it does:** Persistent memory. The nodeling can save data here and retrieve it later — across runs, across nodelings.

| Configured As | What It Stores |
|--------------|---------------|
| Store: Memory | Key-value pairs. Save a name, recall it later. Shared between all nodelings. |
| Store: Queue | Ordered buffer. Add to the back, take from the front. For batching or coordinating. |
| Store: Log | Append-only record. The nodeling writes entries, anyone can read the history. |

**Icon:** Database / cylinder
**Color:** Amber

---

### 7. Wait
**What it does:** Pauses the nodeling for a duration or until a condition is met.

| Configured As | Behavior |
|--------------|----------|
| Wait: Timer | Pause for X seconds/minutes/hours |
| Wait: Until | Pause until a condition is true (e.g., "until the Store has data") |
| Wait: Schedule | Pause until a specific time or cron expression |

**Icon:** Clock
**Color:** Amber

---

## Node Tray Layout

The user sees **7 items** in the tray. Clean, no scrolling.

```
─────── ACT ──────
  Pull     Push     Think

─────── FLOW ─────
  Decide  Transform  Store   Wait
```

When you click any node, a configuration panel asks "What service?" or "What mode?" before placement. Once placed, the building shows its configured label and service icon.

## Node Summary

| Supernode | Configurations | Color |
|-----------|---------------|-------|
| **Pull** | 13 services (Gmail, Slack, Notion, Sheets, GitHub, Drive, Calendar, Linear, Airtable, Discord, Web, API, Inbox) | Cyan |
| **Push** | 11 services (Gmail, Slack, Notion, Sheets, GitHub, Drive, Calendar, Linear, Airtable, Discord, API) | Cyan |
| **Think** | 6 modes (Reason, Summarize, Classify, Rewrite, Generate Image, Embed) | Violet |
| **Decide** | 3 modes (If/Else, Classify Route, Threshold) | Amber |
| **Transform** | 5 modes (Map, Filter, Combine, Split, Code) | Amber |
| **Store** | 3 modes (Memory, Queue, Log) | Amber |
| **Wait** | 3 modes (Timer, Until, Schedule) | Amber |
| **Total** | **7 supernodes → 44 configurations** | |

---
---

# Section 2: Nodelings

Nodelings are the agents. Each one can be assigned a **job** — a real professional role that defines what it does, which nodes it uses, and how it behaves.

## What Is a Job?

A job is a professional role for a nodeling. When you hire a nodeling as a "Project Manager," it comes pre-loaded with:

- **A default workflow** — the behavior graph it runs
- **A skill set** — which node types and configurations it knows
- **A personality** — how it logs, what it prioritizes, how it handles ambiguity
- **A color** — visual identity in the world

Users pick jobs the way they'd hire for a position. The nodeling becomes a specialist.

---

## Creative

### 1. Graphic Designer
- **Color:** Magenta
- **What they do:** Takes briefs or content and produces visual assets — generates images, creates variations, adapts for different formats.
- **Workflow:** `Pull (brief/content) → Think: Reason (refine prompt) → Think: Generate Image → Push to Drive / Notion`
- **Nodes:** Pull, Think (Reason + Generate Image), Push
- **Why agentic:** Good images require prompt refinement — the nodeling iterates on the brief before generating, and may produce multiple options.

### 2. Content Writer
- **Color:** Purple
- **What they do:** Takes a topic or brief, researches, outlines, drafts, and polishes written content.
- **Workflow:** `Pull (brief) → Think: Reason (outline) → Think: Reason (draft) → Think: Rewrite (polish) → Push to Notion / Docs`
- **Nodes:** Pull, Think (Reason + Rewrite), Push
- **Why agentic:** Writing requires multiple revision passes. The nodeling evaluates its own output and loops — outline, draft, edit.

### 3. Copywriter
- **Color:** Rose
- **What they do:** Writes short-form copy — ads, headlines, email subjects, social captions. Focused on conversion and tone.
- **Workflow:** `Pull (product/brief) → Think: Reason (angles) → Think: Rewrite (voice) → Transform: Split (variants) → Push to Sheets / Notion`
- **Nodes:** Pull, Think (Reason + Rewrite), Transform (Split), Push
- **Why agentic:** Generates multiple variants, evaluates each against brand voice and target audience, iterates on the strongest ones.

### 4. Video Editor
- **Color:** Dark Red
- **What they do:** Processes video-related tasks — generates scripts, creates shot lists, writes descriptions, manages video metadata.
- **Workflow:** `Pull (footage notes/transcript) → Think: Summarize → Think: Reason (script/structure) → Push to Notion / Sheets`
- **Nodes:** Pull, Think (Summarize + Reason), Push
- **Why agentic:** Must interpret raw footage notes and structure them into a coherent narrative, making creative decisions about pacing and flow.

---

## Strategy & Management

### 5. Project Manager
- **Color:** Indigo
- **What they do:** Monitors project tools, tracks task progress, identifies blockers, sends status updates, nudges stale work.
- **Workflow:** `Pull from Linear / GitHub → Transform: Filter (stale/blocked) → Think: Reason (compose update) → Push to Slack`
- **Nodes:** Pull (Linear + GitHub), Transform (Filter), Think (Reason), Push (Slack)
- **Why agentic:** Must evaluate context — not all old tasks are stale, not all blockers need escalation. Composes appropriate nudges.

### 6. Product Manager
- **Color:** Blue
- **What they do:** Gathers user feedback, synthesizes feature requests, prioritizes backlog, writes specs.
- **Workflow:** `Pull from Slack / Gmail (feedback) → Think: Classify (themes) → Think: Reason (prioritize) → Push to Linear / Notion (specs)`
- **Nodes:** Pull (Slack + Gmail), Think (Classify + Reason), Push (Linear + Notion)
- **Why agentic:** Must weigh competing signals, identify patterns across scattered feedback, and make judgment calls about priority.

### 7. Art Director
- **Color:** Gold
- **What they do:** Reviews creative output against brand guidelines, provides feedback, maintains visual consistency.
- **Workflow:** `Pull from Drive / Notion (assets) → Think: Reason (evaluate vs. guidelines) → Think: Rewrite (feedback notes) → Push to Notion / Slack`
- **Nodes:** Pull (Drive + Notion), Think (Reason + Rewrite), Push (Notion + Slack)
- **Why agentic:** Creative review requires subjective judgment — assessing tone, consistency, and brand alignment, not just checking boxes.

### 8. Scrum Master
- **Color:** Teal
- **What they do:** Facilitates sprint ceremonies — generates standup summaries, tracks velocity, identifies recurring blockers.
- **Workflow:** `Pull from Linear (sprint data) → Think: Summarize (standup) → Transform: Filter (blockers) → Push to Slack`
- **Nodes:** Pull (Linear), Think (Summarize), Transform (Filter), Push (Slack)
- **Why agentic:** Must synthesize daily updates into meaningful patterns, distinguish real blockers from normal friction.

---

## Marketing & Growth

### 9. Social Media Manager
- **Color:** Pink
- **What they do:** Adapts content for platforms, schedules posts, monitors engagement, responds to comments.
- **Workflow:** `Pull (content) → Think: Reason (adapt per platform) → Transform: Split (per platform) → Push to API / Slack`
- **Nodes:** Pull, Think (Reason), Transform (Split), Push (API)
- **Why agentic:** Each platform has different norms, character limits, and audience expectations. Must make creative adaptation decisions.

### 10. SEO Specialist
- **Color:** Green
- **What they do:** Analyzes content for search optimization, suggests keywords, rewrites titles/meta, tracks rankings.
- **Workflow:** `Pull from Web (SERP data) → Think: Reason (analyze gaps) → Think: Rewrite (optimize) → Push to Notion / Sheets`
- **Nodes:** Pull (Web), Think (Reason + Rewrite), Push (Notion + Sheets)
- **Why agentic:** SEO requires interpreting competitive landscapes, balancing readability with keyword density, and iterating.

### 11. Email Marketer
- **Color:** Light Blue
- **What they do:** Writes email campaigns, segments audiences, A/B tests subject lines, tracks performance.
- **Workflow:** `Pull from Sheets (audience) → Think: Reason (segment + personalize) → Think: Rewrite (copy) → Transform: Split (variants) → Push to Gmail / API`
- **Nodes:** Pull (Sheets), Think (Reason + Rewrite), Transform (Split), Push (Gmail + API)
- **Why agentic:** Must personalize at scale, generate variants, and make strategic decisions about segmentation.

---

## Engineering & Technical

### 12. Game Designer
- **Color:** Amber
- **What they do:** Takes design ideas, writes game design documents, balances mechanics, tracks feature specs.
- **Workflow:** `Pull (ideas/feedback) → Think: Reason (design doc) → Think: Reason (balance analysis) → Push to Notion / GitHub`
- **Nodes:** Pull, Think (Reason), Push (Notion + GitHub)
- **Why agentic:** Game design requires systems thinking — balancing interconnected mechanics, anticipating player behavior, iterating on feel.

### 13. Software Engineer
- **Color:** Dark Teal
- **What they do:** Takes specs or bug reports, writes code, creates PRs, reviews diffs.
- **Workflow:** `Pull from Linear / GitHub (task) → Think: Reason (plan) → Transform: Code (implement) → Think: Reason (review) → Push to GitHub`
- **Nodes:** Pull (Linear + GitHub), Think (Reason), Transform (Code), Push (GitHub)
- **Why agentic:** Engineering requires planning, implementation, and self-review — a multi-step loop with judgment at every stage.

### 14. QA Tester
- **Color:** Red
- **What they do:** Reviews changes, writes test cases, identifies edge cases, files bugs.
- **Workflow:** `Pull from GitHub (PRs/changes) → Think: Reason (analyze for risks) → Transform: Code (write tests) → Push to GitHub (issues)`
- **Nodes:** Pull (GitHub), Think (Reason), Transform (Code), Push (GitHub)
- **Why agentic:** Testing requires adversarial thinking — imagining what could go wrong, which users never do the expected thing.

### 15. DevOps Engineer
- **Color:** Dark Orange
- **What they do:** Monitors infrastructure events, triages alerts, creates incident reports, escalates critical issues.
- **Workflow:** `Pull from Inbox (alerts) → Think: Classify (severity) → Decide: Threshold (critical?) → Push to Slack (alert) + GitHub (incident)`
- **Nodes:** Pull (Inbox), Think (Classify), Decide (Threshold), Push (Slack + GitHub)
- **Why agentic:** Must correlate events, suppress duplicate alerts, and make escalation decisions under pressure.

---

## Operations & Support

### 16. Customer Support Rep
- **Color:** Cyan
- **What they do:** Reads incoming tickets, classifies issues, drafts responses, escalates complex cases.
- **Workflow:** `Pull from Gmail / Slack → Think: Classify (issue type) → Decide: Classify Route (auto/escalate) → Think: Reason (draft reply) → Push to Gmail`
- **Nodes:** Pull (Gmail + Slack), Think (Classify + Reason), Decide (Classify Route), Push (Gmail)
- **Why agentic:** Must understand customer intent, match tone, know when to solve vs. escalate, reference past context.

### 17. Recruiter
- **Color:** Lavender
- **What they do:** Processes applications, screens candidates against criteria, summarizes top matches, schedules interviews.
- **Workflow:** `Pull from Gmail (applications) → Think: Reason (evaluate fit) → Transform: Filter (min score) → Push to Calendar + Gmail (schedule + reply)`
- **Nodes:** Pull (Gmail), Think (Reason), Transform (Filter), Push (Calendar + Gmail)
- **Why agentic:** Candidate evaluation is subjective and multi-criteria — needs LLM judgment, not pattern matching.

### 18. Executive Assistant
- **Color:** Silver
- **What they do:** Manages inbox, triages communications, drafts replies, schedules meetings, prepares briefings.
- **Workflow:** `Pull from Gmail / Slack / Calendar → Think: Classify (triage) → Think: Reason (draft/schedule) → Push to Gmail / Calendar / Notion`
- **Nodes:** Pull (Gmail + Slack + Calendar), Think (Classify + Reason), Push (Gmail + Calendar + Notion)
- **Why agentic:** Must juggle multiple streams, prioritize across contexts, and handle sensitive communications with appropriate tone.

---

## Data & Research

### 19. Data Analyst
- **Color:** Orange
- **What they do:** Pulls data from sheets/databases, runs calculations, identifies trends, generates reports with insights.
- **Workflow:** `Pull from Sheets / Airtable → Transform: Code (calculate) → Think: Reason (interpret) → Think: Summarize → Push to Notion / Gmail`
- **Nodes:** Pull (Sheets + Airtable), Transform (Code), Think (Reason + Summarize), Push (Notion + Gmail)
- **Why agentic:** Analysis requires interpreting results, not just computing them. The nodeling decides what's significant and tells the story.

### 20. Research Analyst
- **Color:** Dark Green
- **What they do:** Takes a research question, searches multiple sources, synthesizes findings into a structured report.
- **Workflow:** `Pull from Inbox (question) → Pull from Web (search, multiple rounds) → Think: Reason (synthesize) → Think: Summarize → Push to Notion / Docs`
- **Nodes:** Pull (Inbox + Web), Think (Reason + Summarize), Push (Notion)
- **Why agentic:** Real research is iterative — search, read, refine the question, search again. Can't be done in one pass.

---

## Nodeling Summary

| Category | Roles | Count |
|----------|-------|-------|
| Creative | Graphic Designer, Content Writer, Copywriter, Video Editor | 4 |
| Strategy & Management | Project Manager, Product Manager, Art Director, Scrum Master | 4 |
| Marketing & Growth | Social Media Manager, SEO Specialist, Email Marketer | 3 |
| Engineering & Technical | Game Designer, Software Engineer, QA Tester, DevOps Engineer | 4 |
| Operations & Support | Customer Support Rep, Recruiter, Executive Assistant | 3 |
| Data & Research | Data Analyst, Research Analyst | 2 |
| **Total** | | **20** |

---

## Skill Matrix

| Nodeling | Pull | Push | Think | Decide | Transform | Store | Wait |
|----------|------|------|-------|--------|-----------|-------|------|
| Graphic Designer | brief | Drive, Notion | Reason, Gen Image | — | — | — | — |
| Content Writer | brief | Notion, Docs | Reason, Rewrite | — | — | — | — |
| Copywriter | brief | Sheets, Notion | Reason, Rewrite | — | Split | — | — |
| Video Editor | transcript | Notion, Sheets | Summarize, Reason | — | — | — | — |
| Project Manager | Linear, GitHub | Slack | Reason | — | Filter | — | — |
| Product Manager | Slack, Gmail | Linear, Notion | Classify, Reason | — | — | — | — |
| Art Director | Drive, Notion | Notion, Slack | Reason, Rewrite | — | — | — | — |
| Scrum Master | Linear | Slack | Summarize | — | Filter | — | — |
| Social Media Mgr | content | API, Slack | Reason | — | Split | — | — |
| SEO Specialist | Web | Notion, Sheets | Reason, Rewrite | — | — | — | — |
| Email Marketer | Sheets | Gmail, API | Reason, Rewrite | — | Split | — | — |
| Game Designer | ideas | Notion, GitHub | Reason | — | — | — | — |
| Software Engineer | Linear, GitHub | GitHub | Reason | — | Code | — | — |
| QA Tester | GitHub | GitHub | Reason | — | Code | — | — |
| DevOps Engineer | Inbox | Slack, GitHub | Classify | Threshold | — | — | — |
| Support Rep | Gmail, Slack | Gmail | Classify, Reason | Classify Route | — | — | — |
| Recruiter | Gmail | Calendar, Gmail | Reason | — | Filter | — | — |
| Exec Assistant | Gmail, Slack, Cal | Gmail, Cal, Notion | Classify, Reason | — | — | — | — |
| Data Analyst | Sheets, Airtable | Notion, Gmail | Reason, Summarize | — | Code | — | — |
| Research Analyst | Inbox, Web | Notion | Reason, Summarize | — | — | — | — |

---

*7 supernodes → 44 configurations. 20 nodelings across 6 professional domains.*
