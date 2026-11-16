<div align="center">
  <img src="docs/assets/hero.svg" width="100%" alt="Social Battery — a night on a pixel-art campus">
  <h1>Social Battery</h1>
  <p><strong>A small campus adventure about connecting, saying goodbye, and recharging.</strong></p>
  <p><a href="README.md">简体中文</a> · <strong>English</strong></p>
  <p><a href="https://wsluyao.github.io/social-battery-game/">Play online</a> · <a href="https://github.com/wsLuYao/social-battery-game/actions/workflows/validate.yml">Validation</a></p>
</div>

> Spend 5–10 minutes navigating a campus gathering, choosing how to leave, and settling into a quiet dorm evening. Finish with a personal recharge guide and a printable receipt of the night's experiences.

> **Copyright:** This is a public showcase repository. No open-source or other open-use license is granted for the project’s original content. Copying, redistribution, redeployment, and commercial use require prior written permission, subject to the exceptions described in [COPYRIGHT.md](COPYRIGHT.md).

![Character selection and title screen](docs/screenshots/cover.jpg)

## What you can do

The game is currently in Simplified Chinese. Choose Qinghe or Nuanxing, explore pixel-art scenes, and see how your actions change the evening's energy meter.

| Feature | Experience |
| --- | --- |
| Campus gathering | Conversations, activities, breaks, and interactive objects |
| Three departure routes | Head back early, take a walk, or stop for late-night noodles |
| Dorm activities | Computer, phone, music, snacks, quiet sitting, and time with a cat |
| Recharge guide | A two-sided card with a recap, a character interpretation, and practical suggestions |
| Recharge receipt | Animated printing, stamps, a QR code, and image export |
| Character gallery | Six characters unlocked through different choices |
| Local saves | Continue the same evening in the same browser |

Energy values and character outcomes come from game rules. They are prompts for reflection, not a validated personality test, psychological assessment, or diagnosis.

## Play

Open **[the online game](https://wsluyao.github.io/social-battery-game/)**. No account or installation is required.

- **Desktop:** Move with the arrow keys, WASD, or scene clicks. Follow the on-screen interaction prompts.
- **Mobile:** Landscape orientation is recommended; touch controls are available.
- **First visit:** Wait for the full-session resource preparation before selecting a character.
- **Return visit:** Continue from the title screen using the same browser and address.

![Campus gathering](docs/screenshots/party.jpg)

## Psychology in the design

The energy meter makes the evening’s choices visible: players can revisit how they joined activities, said goodbye, and chose rest or companionship. Six characters connect these choices to implementation intentions, social baseline theory, shared activities and interpersonal impressions, autonomous solitude and emotion regulation, mood management, and psychological detachment.

The recharge guide connects a game event to a concept, a small action to try, and a research reference with its scope. These are contextual design applications; the energy values are game rules, and the roles are not validated personality categories. Applying work-recovery ideas to social messages is an analogy rather than a directly tested result.

## A receipt of the evening

The recharge guide includes a pixel-printer sequence with soft printing audio. It produces a horizontal receipt showing the character, its colors and quote, departure and minimum energy, and stamps from events in the current playthrough. Preview, PNG export, and native image sharing use the same receipt canvas. Its QR code links to the official game.

Sharing adapts to the device: system image sharing, QQ web links, in-app guidance, image saving, or copied links and captions. Sending is confirmed by the player; browser saves are not embedded in shared links. Personal, non-commercial sharing of your own game-generated receipts is permitted under [COPYRIGHT.md](COPYRIGHT.md), without permission to extract assets, redistribute the game, or redeploy it.

## Run locally

This is a static release with no npm dependencies. With Python 3 installed:

```bash
git clone https://github.com/wsLuYao/social-battery-game.git
cd social-battery-game
python -m http.server 8000
```

Open [http://localhost:8000](http://localhost:8000). Serve the files over HTTP so the resource loader can read the bundled assets.

## How it works

- HTML, CSS, and vanilla JavaScript combine Canvas scenes with DOM interfaces.
- Images, audio, and runtime files are distributed with the repository; no external CDN is needed.
- Progress, settings, and gallery unlocks use browser LocalStorage. There is no account system or cloud synchronization.
- Sharing and image export are initiated by the player. The receipt's QR code links to the deployed game.

Clearing site data deletes local progress. Saves do not move automatically between devices or site addresses.

## Repository

```text
index.html / game.html   Game entry points
assets/runtime/         Bundled images, audio, and SVG assets
src/js/                 Startup, resource loader, and interaction guard
src/runtime/            Release runtime, styles, and resource manifest
docs/                   Cover, screenshots, and deployment notes
tools/validate.mjs      Static release validation
.github/workflows/      Validation on pushes and pull requests
.nojekyll               GitHub Pages static publishing marker
```

This repository is based on the November 16, 2026 options and About-page update bundle. The JavaScript runtime is a combined release file; the original project's offline-package build tools are not included.

## Validate and deploy

With Node.js installed:

```bash
node tools/validate.mjs
```

Validation checks asset presence and sizes, group dependencies, entry-point references, JavaScript syntax, and the receipt QR destination. GitHub Actions runs the same check on pushes and pull requests.

GitHub Pages publishes the root of the `main` branch. See the [deployment notes](docs/deployment.md) for configuration and migration details.

## Author

王政锠 (Zhengchang Wang) and 何品洁 (Pinjie He), School of Psychology, Central China Normal University. Maintained by [wsLuYao](https://github.com/wsLuYao). Report problems through [Issues](https://github.com/wsLuYao/social-battery-game/issues), including your browser, device, and reproduction steps.

Original project content: all rights reserved; no open-source or other open-use license is granted. See [COPYRIGHT.md](COPYRIGHT.md) for use restrictions and the limited personal receipt-sharing permission. Third-party assets retain their own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
