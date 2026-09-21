# Recite Practice

A read-then-rewrite practice loop on any document: **circle targets → extract → rewrite from memory → compare with the original → dictation check → AI grading → flashcard review**.

Highlighting a good article isn't enough to make it stick. Circle the passages you want to master, close the original, rewrite them from memory, then compare item by item to see the gap. This plugin brings that workflow into SiYuan: any document, no special formatting — circle a passage and it becomes an exercise.

- 📖 **[Full User Guide](https://my.feishu.cn/docx/FgSpdE2PmoEfJmxGYCqcurmDnCf)** (Chinese, with complete walk-throughs for five scenarios — recitation / dictation / skeleton / English / association — plus full AI grading output and demo data download)
- 🤖 **[Connect AI to SiYuan (MCP)](https://my.feishu.cn/docx/BkRldeWJ7o3T4ExE2fdciZbgnRV)** (Chinese) — let AI read the source text and assemble practice drills for you (Pro); three-step setup for ZCode / Trae / CodeBuddy / Qoder
- 📦 **[Source repository](https://github.com/IAliceBobI/sy-recite-plugin)** — what you see is what's compiled: release packages are built remotely by GitHub Actions from source
- 💬 [QQ Channel](https://pd.qq.com/s/r3jz0g16) (Chinese) — feedback and feature requests, shared with Tomato Toolbox
- 💬 [Feishu Group](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=f08gff0c-d6b0-4a0d-8323-c8a0553e4fff&qr_code=true) (Chinese) — feedback and feature requests, shared with Tomato Toolbox
- 📱 Scan to join: ![Group QR codes (left: QQ Channel, right: Feishu)](group-qr.png)

## Features

- **Drill This & Original — the two marks** — in practice mode, select a passage and hit "Drill This" to circle it as the target: a prompt slot appears right after it — write one line on what the passage says and that's the question, or leave it empty for pure recall. On extraction only the target is drilled while the rest of the original is copied into the practice document as context (dimmed, never in the way), so flashcard reviews always carry their surrounding text. Words you write elsewhere are copied in as context too (never compared or graded), and words claimed as original are kept as original. Drag-select works (Ctrl+click gathers multiple blocks). The two marks switch freely at any time — hit "Original" to clear marks and restore a block, or to claim your own newly written text as original (copied into the paper, kept on exit and delete). No targets circled yet? Extraction prompts you to mark a target first — circle the whole piece if you want the classic full-recall drill, and both styles mix freely in one document. Targets and prompt slots carry feedback tints — circled or not, at a glance
- **AI Split** (Pro) — no idea where to start? Let the AI read the whole piece and drop anchor notes at narrative beats, in three flavors: recite anchors (beat + noun keywords — cues without leaking the prose), imitation anchors (beat + technique walkthrough) and direction anchors (plot direction + emotional arc). Pick one from a three-way menu; re-running replaces old AI anchors while your handwritten notes always stay untouched, and beats you've already split are skipped automatically. Uses the AI you've configured in SiYuan (Settings → AI, same channel as AI grading); grading recognizes AI anchors too, reviewing "technique delivered" and "direction-level" accordingly
- **Extract & rewrite** — one click generates an "Extract" sub-document from your targets: each target is blanked into a question with a rewrite slot (the prompt right after it becomes the question hint; no prompt means pure recall) while the rest of the original is copied in as context — close the original and start writing
- **Per-item compare** — each rewrite slot in the extract document carries a "Compare" button: click to expand an in-place side-by-side panel (original vs. your rewrite) for that one item, click again to collapse — see each gap right after writing, not after the whole piece
- **Per-item clear** — botched this one item? Hit "Clear" next to "Compare" to wipe just that answer and rewrite it — other items and original passages stay untouched
- **Compare document** — when you finish rewriting, one click generates a "Compare" sub-document: original on the left, your version on the right, one card per item — gaps at a glance
- **Dictation check** — a dialog compares original and rewrite character by character for Chinese, word by word for English: mistakes get red strikethrough, omissions green underline, with a diff tally at the bottom (punctuation differences ignored). Read and go — nothing is written into your document
- **AI grading** — the AI you've already configured in SiYuan (Settings → AI) reviews each item on the spot; multi-standard templates automatically tell apart recitation-level line-by-line comparison, skeleton-level structure analysis and association-level creativity review; the verdict lands as a standalone result block at the end of the compare document for later review (re-grading overwrites the previous one), with missed points listed at the top of the result card. Three grader tones (Gentle / Neutral / Strict, switchable in settings) — or one-click copy the grading prompt and paste it to any AI
- **Grading pet** (desktop) — a tiny companion lives in the top-left corner of the recite bar: it blinks and breathes while you practice, wiggles excitedly when your mouse passes over, and clicking it brings surprises — Doudou and Xuetuan bounce with a squinting smile and little hearts, while Xiaopan, Boshi and Douya each have their own transformation show (full-body spread wings / flying pages with a swinging tassel / puffed cheeks breathing tiny fireballs). During AI grading it naps on guard, then pops up the moment scores arrive, emoting to match the result (smiling squint on praise, pout with tears on a poor grade) — and it plays along with the grader's tone (cheering paw raised on gentle praise, arms akimbo glaring on strict criticism). Free by default; can be turned off in settings
- **Association practice** — write a prompt like "idea: tree · seat belt · exam" in the prompt slot, write freely from the words after extraction, and the AI grades creativity at association level — grow a story out of three words
- **Flashcard companion** — add the whole drill paper to SiYuan's built-in flashcards with one tap on the recite bar (built-in Quick deck, side by side with your excerpt cards). Reviews show the drill paper — the questions, not the source text: write from memory, then check answers against the compare document. Cloze and Q&A cards ask you to recognize a cue; recitation asks you to produce from it — producing is the deeper form of memory, so the two kinds of cards complement each other. Edited the original and regenerated the questions? Your flashcard and review history carry over untouched — same card, same progress, fresh questions on the face.

## Four Ways to Practice

The three imitation modes are graded by how far you stray from the original, and you can mix them: **Recitation** (restore each sentence verbatim — trains precision of wording), **Gist** (write the broad strokes from memory — trains narrative rhythm), and **Skeleton** (extract the structure, swap the plot — write a new passage with the same bones but different flesh). Use Recitation on beautiful sentences to hone details; use Skeleton on great passages to learn structure. The fourth mode, **Association**, leaves the original behind entirely: write "idea: word one · word two · word three" as the prompt, free-associate from those words, and the AI grades your associativity — whether every word got used, how clever the connections are, how far you reached.

## Entry Points

Original, extract and compare documents each carry a persistent recite bar with icon buttons (icon + label on desktop, icon-only on mobile); the ✕ in the title row / top bar tucks it away until you switch documents (it comes back automatically). On desktop the bar is freely draggable; on mobile it snaps into a horizontally scrollable strip right below the toolbar, stepping aside automatically when the Progressive Learning top bar shares the screen. On mobile, the original-document bar also carries three selection buttons (select upwards / downwards / undo last) so you can gather blocks for "Drill This" / "Original" without touchscreen drag-select (toggle in settings). Three entrances to practice mode: the **pen icon in the top bar** (on by default, hideable in settings), the command palette, and the "Plugins" submenu of the right-click menu.

| Action | Mac | Windows |
|---|---|---|
| Enter / exit practice mode (gentle exit) | ⌥⌘K | Alt+Ctrl+K |
| Extract | ⌥⌘Q | Alt+Ctrl+Q |
| Compare | ⌥⌘G | Alt+Ctrl+G |
| Copy grading prompt | ⌥⌘P | Alt+Ctrl+P |
| Rewrite | ⌥⌘C | Alt+Ctrl+C |
| Original — restore / claim a block | ⌥⌘H | Alt+Ctrl+H |
| Drill This — circle the target | ⌥⇧⌘O | Alt+Ctrl+Shift+O |

The table lists the **default** shortcuts — every one is remappable: click a key cap in the plugin settings "Shortcuts" section (or SiYuan Settings → Keymap) and press a new combo; it takes effect immediately without restart.

## Getting Started

1. Open any document and click the pen icon in the top bar to enter practice mode
2. Select the passages you want to practice and hit "Drill This" on the recite bar — a prompt slot appears right after the target: write one line on what the passage says (that's the question) or leave it empty for pure recall; the rest of the original stays as context. Not sure how to break the piece into beats? Click "AI Split" (Pro) for a head start — splitting is itself practice, so write your own prompts once you get the hang of it
3. Click "Extract" on the recite bar: each target is blanked into a question with a write slot (its prompt becomes the question hint; no prompt, pure recall) while the rest is copied in as context — rewrite from memory in the generated extract document
4. Click "Compare" to see the gaps (original on the left, your rewrite on the right), run "Dictation check" for a character-level proofread, then "AI grading" for comments

Details — every recite-bar button explained, with full examples: plugin settings → "User Guide".

## Free vs Pro

One rule of thumb: **the full practice loop is free — targeting, extraction, compare, dictation check, association and AI grading included, no limits, no second-class citizen**. Pro adds two things: the automation that starts you off, and decorating the room you practice in.

| Domain | Free | Pro adds |
|---|---|---|
| 🎯 Practice loop | Target practice with context carried along, extraction, per-item compare & clear, compare document, dictation check, association practice, flashcard companion | — |
| 🤖 AI grading | Grading (multi-standard templates + three grader tones) and the prompt copy — free, fully | — |
| ✂️ AI Split | — | AI reads the piece and drops anchor notes at narrative beats (recite / imitation / direction, three flavors); MCP assembly of a full drill by AI |
| 🎨 Themes | Glazed Amber (default) & Eye-Care Sage | Celadon Ink, Pine-Smoke Violet, Cherry Dusk, Misty Snow; three decorative sets: Sunny Kitty, Celadon Rabbit, Nocturne |
| 🖼 Backgrounds | None / Parchment / Eye-Care; paper dyes the whole window, live texture-strength slider | Rough Kraft, Linen Texture, Grid Paper; Custom Image (one per light/dark mode, panels get a translucent veil) |
| 🎀 Bar skins | Dawn Note & Bamboo Slips | Ink-Jade Mist (frosted glass), Xuan Paper, Scalloped Frill, Fretwork Trim, Gilded Edge, Vermilion Rule (double rules + red seal) |
| 🐾 Grading pets | Shiba Doudou & Snow Bunny (clickable) | Spirit Xiaopan, Owl Professor Boshi, Little Dino Douya (each with its own transformation show); two tone-reactive emotes |
| ✨ Practice visuals | Target & prompt-slot feedback tints — circled or not, at a glance | Original dimming & exit afterglow; prompt snapshots & write slots theme-tinted; extract snapshots carry the marks; compare cards get a finishing border |

Three independent axes — themes, backgrounds and bar skins mix freely: nine themes, seven backgrounds, eight bar skins, any combination. Light and dark modes each keep their own background; pick "None" to restore native SiYuan completely. The room you practice in every day is the one you chose — start free and get comfortable, then spend a coffee's worth to make it look the way you like.

**Pro is ¥10, one-time** — Progressive Learning Pro holders get this plugin's Pro automatically, no extra purchase. Purchase & activation: plugin settings → order on Taobao → support sends a redemption code → paste it back in settings to activate; it binds to your SiYuan account automatically. On a new device, log in with the same account and click "Recover activation code".

## Install & Requirements

- SiYuan ≥ 2.12.6 — desktop, mobile and Docker all work
- Install from the SiYuan marketplace (once listed), or manually unzip a release package into `data/plugins/sy-recite-plugin/`

## License

All released versions up to v1.5.3 remain under the MIT License. **Starting with v1.5.4, this plugin ships under a proprietary license** (see [LICENSE](LICENSE)):

- **Personal use stays free** — nothing changes for individual users
- Redistribution, re-packaging and distributing modified copies are not allowed
- Removing or bypassing the activation check is not allowed
- Commercial use (charging users, paid services, use inside a company) needs written permission — reach out via the [Feishu group](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=f08gff0c-d6b0-4a0d-8323-c8a0553e4fff&qr_code=true) or GitHub issues

## Support the Author

<div>
<img src="https://player-pubpic.oss-cn-beijing.aliyuncs.com/static/wx1.png" alt="WeChat" width="300" />
</div>
<br>
<div>
<img src="https://player-pubpic.oss-cn-beijing.aliyuncs.com/static/zfb1.jpg" alt="Alipay" width="300" />
</div>
