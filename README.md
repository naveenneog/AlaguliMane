# ಆಳಗುಳಿ ಮನೆ Alaguli Mane — the sowing game (Pallanguzhi)

The ancient South Indian **sowing-and-counting** game, reborn as a glowing, mobile-first **3D** game.
Two rows of seven pits, six seeds each; sow counterclockwise and capture every four. Reconstructed
with its original intent: *counting becomes strategy* — a game once used to **teach arithmetic**, so
the rebuild **shows** every seed being sown rather than resolving it invisibly. **No dice.**

**Play:** lift a pit's seeds and sow one per hole. Whenever a hole reaches **exactly four**, you
capture it. When your handful ends, the next pit — if it has seeds — is lifted and sowing **relays**
on; if it is empty, you capture the pit beyond and your turn ends. Most seeds captured wins.

**Four worlds:** `parampare` (the realistic heritage board) · `malnad` (the home board — original) ·
`ulita` (savings — modern) · `suggi` (the harvest tale — folk). Counting read as maths, money, or
patience.

Every pit shows its live seed count. Vs a minimax AI or local two-player; a teaching is read aloud on
each capture and the win.

```bash
npm install && npm run serve   # http://localhost:5181
npm test
npm run qa
```

3D (Three.js + UnrealBloom), PWA + Android APK (Capacitor 7, JDK 21). Licence: PolyForm Noncommercial
1.0.0. Part of the Traditional Board Games suite. Built with GitHub Copilot CLI.
