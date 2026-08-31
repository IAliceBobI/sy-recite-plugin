# Recite Practice

A read-then-rewrite practice loop on any document: **mark → extract → rewrite from memory → compare with the original → dictation check → AI grading**.

Highlighting a good article isn't enough to make it stick. Mark the sentences you want to master, close the original, rewrite them from memory, then compare item by item to see the gap. This plugin brings that workflow into SiYuan: any document, no special formatting — every annotation becomes an exercise.

- 📖 **[Full User Guide](https://my.feishu.cn/docx/FgSpdE2PmoEfJmxGYCqcurmDnCf)** (Chinese, with complete walk-throughs for five scenarios — recitation / dictation / skeleton / English / association — plus full AI grading output and demo data download)
- 🔓 **[Open-source repo](https://github.com/IAliceBobI/sy-recite-plugin)** — what you see is what's compiled: release packages are built remotely by GitHub Actions from source
- 💬 [QQ Channel](https://pd.qq.com/s/r3jz0g16) (Chinese) — feedback and feature requests, shared with Tomato Toolbox
- 💬 [Feishu Group](https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=f08gff0c-d6b0-4a0d-8323-c8a0553e4fff&qr_code=true) (Chinese) — feedback and feature requests, shared with Tomato Toolbox
- 📱 Scan to join: ![Group QR codes (left: QQ Channel, right: Feishu)](group-qr.png)

## Features

- **Mark & tint** — in practice mode, mark the sentences you want to practice with SiYuan's native mark highlight; annotated sentences tint automatically, distinguishable from unmarked ones at a glance
- **AI Split** (Pro) — no idea where to start? Let the AI read the whole piece and drop anchor notes at narrative beats, in three flavors: recite anchors (beat + noun keywords — cues without leaking the prose), imitation anchors (beat + technique walkthrough) and direction anchors (plot direction + emotional arc). Pick one from a three-way menu; re-running replaces old AI anchors while your handwritten notes always stay untouched, and beats you've already split are skipped automatically. Uses the AI you've configured in SiYuan (Settings → AI, same channel as AI grading); grading recognizes AI anchors too, reviewing "technique delivered" and "direction-level" accordingly
- **Extract & rewrite** — one click generates an "Extract" sub-document from your marks, with a rewrite slot under each annotation; close the original and start writing
- **Compare document** — when you finish rewriting, one click generates a "Compare" sub-document: original on the left, your version on the right, one card per item — gaps at a glance
- **Dictation check** — a dialog compares original and rewrite character by character for Chinese, word by word for English: mistakes get red strikethrough, omissions green underline, with a diff tally at the bottom (punctuation differences ignored). Read and go — nothing is written into your document
- **AI grading** — the AI you've already configured in SiYuan (Settings → AI) reviews each item on the spot; multi-standard templates automatically tell apart recitation-level line-by-line comparison, skeleton-level structure analysis and association-level creativity review; results stream into the end of the compare document and can be re-graded as often as you like. Three grader tones (Gentle / Neutral / Strict, switchable in settings) — or one-click copy the grading prompt and paste it to any AI
- **Grading pet** (desktop) — a tiny companion lives in the top-left corner of the recite bar: it blinks and breathes while you practice, wiggles excitedly when your mouse passes over, and clicking it brings surprises — Doudou and Xuetuan bounce with a squinting smile and little hearts, while Xiaopan, Boshi and Douya each have their own transformation show (full-body spread wings / flying pages with a swinging tassel / puffed cheeks breathing tiny fireballs). During AI grading it naps on guard, then pops up the moment scores arrive, emoting to match the result (smiling squint on praise, pout with tears on a poor grade) — and it plays along with the grader's tone (cheering paw raised on gentle praise, arms akimbo glaring on strict criticism). Free by default; can be turned off in settings
- **Association practice** — mark a prompt like "idea: tree · seat belt · exam", write freely from the words after extraction, and the AI grades creativity at association level — grow a story out of three words

## Four Ways to Practice

The three imitation modes are graded by how far you stray from the original, and you can mix them: **Recitation** (restore each sentence verbatim — trains precision of wording), **Gist** (write the broad strokes from memory — trains narrative rhythm), and **Skeleton** (extract the structure, swap the plot — write a new passage with the same bones but different flesh). Use Recitation on beautiful sentences to hone details; use Skeleton on great passages to learn structure. The fourth mode, **Association**, leaves the original behind entirely: mark "idea: word one · word two · word three", free-associate from those words, and the AI grades your associativity — whether every word got used, how clever the connections are, how far you reached.

## Entry Points

Original, extract and compare documents each carry a persistent recite bar with icon buttons (icon + label on desktop, icon-only on mobile); the ✕ in the title row / top bar tucks it away until you switch documents (it comes back automatically). On desktop the bar is freely draggable; on mobile it snaps into a horizontally scrollable strip right below the toolbar, stepping aside automatically when the Progressive Learning top bar shares the screen. Three entrances to practice mode: the **pen icon in the top bar** (on by default, hideable in settings), the command palette, and the "Plugins" submenu of the right-click menu.

| Action | Mac | Windows |
|---|---|---|
| Enter / delete practice mode | ⌥⌘K | Alt+Ctrl+K |
| Extract | ⌥⌘Q | Alt+Ctrl+Q |
| Compare | ⌥⌘G | Alt+Ctrl+G |
| Copy grading prompt | ⌥⌘P | Alt+Ctrl+P |
| Rewrite | ⌥⌘C | Alt+Ctrl+C |

The table lists the **default** shortcuts — every one is remappable: click a key cap in the plugin settings "Shortcuts" section (or SiYuan Settings → Keymap) and press a new combo; it takes effect immediately without restart.

## Getting Started

1. Open any document and click the pen icon in the top bar to enter practice mode
2. Mark the sentences you want to practice with mark highlights (annotated sentences tint automatically); not sure how to break the piece into beats? Click "AI Split" (Pro) on the recite bar for a head start — splitting is itself practice, so write your own notes once you get the hang of it
3. Click "Extract" on the recite bar and rewrite from memory in the generated extract document
4. Click "Compare" to see the gaps, run "Dictation check" for a character-level proofread, then "AI grading" for comments

Details — every recite-bar button explained, with full examples: plugin settings → "User Guide".

## Free / Pro

**The free version covers the full practice loop — no second-class citizen**: marking, extraction, comparison, dictation check, association practice, AI grading and the grading prompt all work, with no limits on runs or documents.

**AI Split is the one Pro-gated feature; AI grading stays free**: when you don't know where to start, let it read the piece and drop anchor notes at narrative beats (see Features). The button stays visible before activation and prompts when clicked.

**Pro (¥10, one-time purchase) = AI Split + decorating your practice room the way you like it**:

- **Nine theme skins** to swap at will — the default Glazed Amber keeps a warm glow; the free Eye-Care Sage pairs a low-saturation green palette with the eye-care background for long writing sessions; Celadon Ink brings calm, Pine-Smoke Violet elegance, Cherry Dusk tenderness, Misty Snow clarity
- **A separate background axis, freely combined with any theme** — a global background library with seven options: None / Parchment (cream aged paper, free default) / Eye Care (matte sage paper, free), plus Rough Kraft, Linen Texture, Grid Paper and Custom Image (Pro: any picture of yours tiles the whole window, panels get an automatic translucent veil to stay readable, and you can assign one image for light and one for dark mode). Paper backgrounds dye the entire window — top bar, side panels, status bar and editor all share the same sheet — instead of repainting a small patch. Light and dark modes each keep their own background: toggling SiYuan's appearance swaps to the one you picked for that mode. A texture-strength slider tunes the paper grain live (free); choose None to restore native SiYuan completely
- **Eight recite-bar skins on their own axis, mixable with any theme** — the free Bamboo Slips is a stationery-flavored starter; Pro adds Ink-Jade Mist (frosted glass), Xuan Paper, Scalloped Frill (scallop-tooth drape on the lower edge), Fretwork Trim (outer waves, inner fret), Gilded Edge (four-way gilded highlights) and Vermilion Rule (double vermilion rules like a letter pad, with a red seal in the top-right corner)
- **Three decorative skin sets** redecorate the whole palette and add lace to the compare cards: Sunny Kitty (warm gold-orange), Celadon Rabbit (ink-wash vertical lace), Nocturne (gilt meets ink-jade)
- **Grading pets** — Shiba Doudou and Snow Bunny Xuetuan keep you company on the recite bar for free; the three Pro looks — Spirit Xiaopan (click: full-body wing-spread transformation), Owl Professor Boshi (click: pages fly, tassel swings), Little Dino Douya (click: puffed cheeks, tiny fireballs) — plus the two tone-reactive emotes (gentle-praise cheering paw / strict-criticism arms-akimbo glare) are Pro
- Marked sentences take on the theme tint, extract snapshots carry the marks, compare cards get a finishing border — the room you practice in every day is the one you chose. On the free plan marked sentences sit on a soft yellow tint, still unmistakable at a glance — start free and get comfortable, then spend a coffee's worth to make it look the way you like

Purchase & activation: plugin settings → order on Taobao → support sends a redemption code → paste it back in settings to activate; it binds to your SiYuan account automatically. On a new device, log in with the same account and click "Recover activation code".

## Install & Requirements

- SiYuan ≥ 2.12.6 — desktop, mobile and Docker all work
- Install from the SiYuan marketplace (once listed), or manually unzip a release package into `data/plugins/sy-recite-plugin/`

## Support the Author

<div>
<img src="https://player-pubpic.oss-cn-beijing.aliyuncs.com/static/wx1.png" alt="WeChat" width="300" />
</div>
<br>
<div>
<img src="https://player-pubpic.oss-cn-beijing.aliyuncs.com/static/zfb1.jpg" alt="Alipay" width="300" />
</div>
