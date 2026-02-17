# Discord Status Icons — Design System

## Overview

Brand-aligned, developer-aesthetic icons for Discord Rich Presence. Each icon features the official Claude starburst as the central element on a colored background, with clean geometric state indicators.

## Starburst Source

The starburst path is extracted from the official Claude AI icon SVG:
`/Users/bruno/Downloads/claude-ai-icon.svg`

Fill color: `#FCF2EE` (cream)
Fill rule: `nonzero`

## Icon Dimensions

- Canvas: 512x512 (Discord recommended upload size)
- Small image display: ~20px badge on Discord
- Large image display: ~60px on Discord

## Large Image

| Key | Background | Shape | Element |
|-----|-----------|-------|---------|
| `claude-code` | `#D77655` terracotta | Rounded square (rx=115) | Full official starburst |

## Small State Icons

All small icons share a consistent structure:
1. Colored circle background (512x512, r=256)
2. Cream starburst centered at 52% scale: `transform="translate(122, 123) scale(0.52)"`
3. Semi-transparent badge circle: `cx=400, cy=400, r=95, fill=rgba(0,0,0,0.25)`
4. White indicator symbol inside the badge

| Key | Background | Badge Indicator |
|-----|-----------|-----------------|
| `coding` | `#57F287` green | `</>` code brackets |
| `thinking` | `#9B59B6` purple | Three dots (ellipsis) |
| `terminal` | `#546E7A` blue-gray | `>_` prompt |
| `reading` | `#42A5F5` blue | Three horizontal lines |
| `searching` | `#FFC107` amber | Magnifying glass |
| `idle` | `#90A4AE` gray | Pause bars `||` (starburst at 60% opacity) |
| `starting` | `#FF7043` orange | 270-degree loading arc |
| `multi-session` | `#5865F2` blurple | Two overlapping starbursts (no badge) |

## Design Principles

- **No faces, no characters, no kawaii** — professional developer tool aesthetic
- **Claude starburst is the hero** — always the central recognizable element
- **Color carries state** — each activity has a distinct, high-contrast background
- **Indicators are geometric** — simple strokes and shapes that read at 20px
- **Consistent structure** — all state icons follow the same layout pattern
- **White on dark** — indicators use `#FFF` on `rgba(0,0,0,0.25)` badge for universal contrast

## Indicator Specifications

All stroke indicators use:
- `stroke="#FFF"`
- `stroke-width="12"` or `"14"`
- `stroke-linecap="round"`
- `stroke-linejoin="round"` (where applicable)

Filled indicators use `fill="#FFF"`.

## Adding New Icons

1. Start with the template: colored circle + starburst at 52% scale
2. Choose a distinct background color not already in use
3. Design indicator as simple white geometry inside the badge circle (cx=400, cy=400, r=95)
4. Keep indicator bold enough to read at 20px
5. Upload to Discord Developer Portal at 512x512
