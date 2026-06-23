# UI Guidelines

MapleAgent should feel like a clean agent control room, not a stack of generic cards.

## Principles

- Use one primary surface per section.
- Avoid nested cards.
- Prefer rows, dividers, and whitespace over boxes.
- Keep technical details behind disclosure areas.
- Show state changes clearly: active, pending, confirmed, revoked, blocked.
- Use hover only for basic button/link affordances.
- Let the budget meter carry the visual weight.

## Main layout

```txt
Top:     product name, wallet, demo mode
Hero:    tagline + budget status
Left:    task composer, live timeline, final report
Right:   budget meter, policy guardrails, revoke/block controls
Bottom:  receipt ledger and indexer status
```

## Avoid

- Cards inside cards.
- Excessive shadows.
- Gradient-heavy “vibe coded” sections.
- Animated blobs.
- Mystery icons without labels.
- Raw addresses as primary content.

## Use

- Strong typography.
- Thin dividers.
- Calm neutral colors.
- Clear progress states.
- Plain language: “Budget remaining”, “Spend blocked”, “Revoked”.
