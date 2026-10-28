---
name: TrustDesk
colors:
  surface: '#fcf9f5'
  surface-dim: '#dcdad6'
  surface-bright: '#fcf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3ef'
  surface-container: '#f0edea'
  surface-container-high: '#ebe8e4'
  surface-container-highest: '#e5e2de'
  on-surface: '#1c1c1a'
  on-surface-variant: '#3e4947'
  inverse-surface: '#31302e'
  inverse-on-surface: '#f3f0ec'
  outline: '#6e7977'
  outline-variant: '#bdc9c6'
  surface-tint: '#006a63'
  primary: '#005c55'
  on-primary: '#ffffff'
  primary-container: '#0e766e'
  on-primary-container: '#a3faef'
  inverse-primary: '#7fd5cc'
  secondary: '#006b5f'
  on-secondary: '#ffffff'
  secondary-container: '#6df5e1'
  on-secondary-container: '#006f64'
  tertiary: '#7f4026'
  on-tertiary: '#ffffff'
  tertiary-container: '#9c573b'
  on-tertiary-container: '#ffe5dc'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9cf2e8'
  primary-fixed-dim: '#7fd5cc'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#71f8e4'
  secondary-fixed-dim: '#4fdbc8'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005048'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb599'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#72361c'
  background: '#fcf9f5'
  on-background: '#1c1c1a'
  surface-variant: '#e5e2de'
typography:
  headline-xl:
    fontFamily: IBM Plex Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-lg:
    fontFamily: IBM Plex Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: IBM Plex Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: IBM Plex Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  body-lg:
    fontFamily: IBM Plex Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: IBM Plex Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: IBM Plex Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.5rem
  margin: 1.5rem
  margin-compact: 0.75rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

This design system establishes an audit-first operations environment for mission-critical AI-assisted customer service. The aesthetic blends Swiss structural discipline with modern high-density data workstation utility. It deliberately avoids decorative gradients, exaggerated glassmorphism, and low-contrast minimalism in favor of structured precision, complete provenance visibility, and deterministic feedback.

### Core Philosophy: "Show Your Evidence"
Every AI decision, classification, and drafted response surfaces with direct lineage, retrieved document passages, latency metrics, and execution steps. The interface must never present an AI output as an ungrounded black box. Visual hierarchy prioritizes clarity over ornamentation:
- Information density is calibrated for 8-hour desktop operational workflows.
- Status values are never communicated through color alone; they pair rigid typographic badges with functional glyphs.
- Interactive states communicate definitive system actions without ambiguity.

## Colors

The color system is anchored by a warm architectural gray scale paired with purposeful teal accents and accessible semantic tokens that strictly comply with WCAG AA guidelines (minimum 4.5:1 for body and 3:1 for graphical/badge interfaces).

### Palette Architecture
- **Canvas Base (`#FBFBFA`)**: A tactile, warm-neutral foundation that mitigates screen glare during high-concentration review shifts.
- **Surface Layer (`#FFFFFF`)**: Pure white cards and functional toolbars elevated against the canvas base.
- **Container Secondary (`#F4F4F1`)**: Inner nested blocks, citation callouts, side inspection panels, and table header rows.
- **Structural Outlines (`#E3E3DC`)**: Crisp 1px division rules defining work areas, ticket splits, and trace nodes.

### Accent & Status Application
- **Primary Teal (`#0E766E`)**: Primary calls to action, approved transitions, and active tab indicators.
- **Secondary Teal (`#14B8A6`)**: Focus rings, non-critical highlights, and interactive chart points.
- **Audit Status Triad**:
  - **Passed/Safe**: `#166534` foreground on `#DCFCE7` tint with `#BBF7D0` outline.
  - **Pending Approval**: `#B45309` foreground on `#FEF3C7` tint with `#FDE68A` outline.
  - **Blocked/Unsafe**: `#991B1B` foreground on `#FEE2E2` tint with `#FECACA` outline.
  - **Escalated**: `#1D4ED8` foreground on `#DBEAFE` tint with `#BFDBFE` outline.

## Typography

The typographic hierarchy establishes distinct roles between human dialogue/audit narratives and machine-generated metadata:

- **Prose & Actions**: Set in `IBM Plex Sans` for legibility, neutral posture, and consistent vertical metric calibration across tight layouts.
- **Telemetry & Provenance Metadata**: Explicitly set in `JetBrains Mono` (or `IBM Plex Mono`). Used for ticket handles (`tkt_9001`), document citation keys (`KB-REFUND-001`), evaluation latencies (`142ms`), token costs, and idempotency traces.
- **Tabular Figures**: Numeric data in tables and operational counters must enforce `font-variant-numeric: tabular-nums` to maintain aligned columns.
- **Hierarchy Controls**: Display titles never exceed 28px within typical workflows to preserve vertical scanning space for telemetry and transcript data.

## Layout & Spacing

TrustDesk is designed as a desktop-first, multi-pane workbench with a modular 3-column split structure optimized for viewports from 1280px to 1920px:

1. **Left Navigation / Queue Rails (240px–300px fixed)**: Dense list views of incoming tickets, SLA countdowns, and filters.
2. **Center Stage / Workspace (Flexible 50%–60%)**: Customer message threads, AI draft builders, and resolution controls.
3. **Right Inspector / Trace Panel (360px–420px fixed)**: Citations, grounding scores, retrieval chunks, and live execution timeline steppers.

### Grid & Density Rules
- Components align to a baseline 4px grid. Standard desktop padding defaults to `space-md` (12px) or `space-sm` (8px) within tables and metadata rows.
- Data tables use compact density with row heights fixed at 36px to maximize row visibility without truncation.
- Panels collapse into sliding overlay drawers on tablet displays (<1024px); screens under 768px transition to stacked single-view card lists.

## Elevation & Depth

Visual hierarchy relies on structural planes and high-definition boundaries rather than heavy drop shadows:

- **Surface Layering**: 
  - Level 0 (Canvas): Background workspace (`#FBFBFA`).
  - Level 1 (Panels & Cards): Surface white (`#FFFFFF`) framed with a crisp `1px solid #E3E3DC` boundary.
  - Level 2 (Nested Context): Citations and inline quotes use `#F4F4F1` containers with recessed `1px solid #E3E3DC` borders.
- **Shadow Profiles**:
  - **Flat/Resting Card**: `0 1px 2px rgba(26, 26, 24, 0.04)` paired with border.
  - **Floating Tooltips/Pill Menus**: `0 2px 4px rgba(26, 26, 24, 0.06), 0 1px 2px rgba(26, 26, 24, 0.04)`.
  - **Slide-out Trace Drawer**: `0 8px 24px rgba(26, 26, 24, 0.08), -1px 0 0 #E3E3DC`.
- **Focus & Selection**: Elements do not bloom with generic blur shadows; they receive a deterministic `2px solid #14B8A6` ring with an offset of 1px.

## Shapes

The geometric signature balances enterprise precision with usability.

- **Base Radius (8px / `0.5rem`)**: The default rounding for cards, content containers, flyout menus, and action buttons.
- **Inner Interactive Radius (6px / `0.375rem`)**: Used for nested list items, segmented controls, and form inputs inside cards to prevent visual corner clashing.
- **Badges and Code Tags (4px / `0.25rem`)**: Strict, compact framing for monospace metadata tokens and semantic status labels.
- **Prohibited Shapes**: Fully circular pill shapes are disallowed for functional buttons and cards, reserved exclusively for circular status indicator dots and counter pills.

## Components

### Buttons
- **Primary**: Background `#0E766E`, text `#FFFFFF`, border `1px solid #0E766E`. Hover `#115E59`.
- **Secondary / Outline**: Background `#FFFFFF`, text `#1A1A18`, border `1px solid #E3E3DC`. Hover `#F4F4F1`.
- **Destructive**: Background `#FFFFFF`, text `#991B1B`, border `1px solid #FECACA`. Hover `#FEE2E2`.
- **Sizing**: Standard height 32px (compact data density), 36px (primary header bar). Corner radius 8px.

### Audit Badges & Status Chips
- Height 22px, padding 2px 8px, border radius 4px.
- Displayed with leading 6px circular indicator dot or status icon.
- Font: `label-sm` (Plex Sans) or `code-sm` (Mono) depending on content type.

### Policy Citations
- Card blocks styled with `#F4F4F1` surface, `1px solid #E3E3DC`, left accent border `3px solid #0E766E`.
- Displays source document reference (`KB-REFUND-001`), chunk similarity score (`98.4% Match`), and verified text excerpt.

### Timeline Steppers & Trace Drawers
- Vertical trace lines styled with `1px solid #E3E3DC`.
- Step nodes feature stateful icons: checkmark (Safe/Green), clock (Pending/Amber), warning triangle (Blocked/Red).
- Monospace metadata lines display execution timing (`+18ms`) right-aligned to step titles.

### Input Fields & Controls
- Height 32px, background `#FFFFFF`, border `1px solid #E3E3DC`, text `#1A1A18`.
- Focus ring: `2px solid #14B8A6` with no blur.
- Checkboxes and radio buttons feature precise 16px geometry with matching teal focus accents.