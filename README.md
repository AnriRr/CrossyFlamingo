# 🦩 Crossy Flamingo

> *"How many roads, resorts, and promises can a flamingo cross before the lagoon disappears?"*

A satirical Crossy Road-style browser game set in a stylized Albania. Cross roads, dodge cement trucks, collect illegal permits, and survive Prime Minister Mode — all while watching the pristine wetlands slowly transform into luxury resorts.

## Play

Just open `index.html` in any modern browser. No build step, no dependencies.

**Or:** Host the three files on any static server / GitHub Pages.

## Files

| File | Purpose |
|------|---------|
| `index.html` | HTML structure & screen layout |
| `style.css` | All visual design, animations, responsive rules |
| `game.js` | Full game engine (World, Player, Renderer, InputManager, UIManager, Game) |

## Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Hop forward | `↑` / `W` / `Space` | Tap |
| Dodge left | `←` / `A` | Swipe left |
| Dodge right | `→` / `D` | Swipe right |
| Step back | `↓` / `S` | Swipe down |

## Features

- **4 eras** — Pristine Wetlands → Development Begins → Resort Construction → Concrete Paradise
- **7 unlockable characters** — Classic, Angry, Golden, EU Inspector, Journalist, Protest, Albanian Eagle
- **Prime Minister Mode** — every 100 points, the PM drops construction sites from the sky
- **Collectibles** — Public Funds, Permits, Newspaper Headlines, Shrimp, Flamingo Feathers
- **Dynamic obstacles** — cement trucks, bulldozers, cranes, yachts, journalists, helicopters
- **Leaderboard** — Most Stubborn, Most Permits Dodged, Longest Protest, Least Corrupt Run

## Architecture

```
Game            ← main loop, state machine
├── World       ← row generation, obstacle movement, scroll
├── Player      ← hop physics, water drift, collision input
├── Renderer    ← all canvas drawing (background, rows, obstacles, player, particles)
├── InputManager← keyboard + touch/swipe
└── UIManager   ← screen transitions, HUD, popups
```

---

*No flamingos were harmed in the making of this game. The same cannot be said for the wetlands.*
