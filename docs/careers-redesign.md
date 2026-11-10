# Careers redesign

## Latest hero revision

At the user's request, restored the full-width photographic hero and edited the original workplace photo with built-in imagegen. Current asset: `apps/web/public/images/careers/corporate-office-hero-v2.jpg`. Earlier assets remain unused. Existing page content and jobs are unchanged.

Edit prompt: Edit this careers hero photograph, retaining the four Indian colleagues' identities, natural friendly collaborative interaction and navy merchandise kit as the base. Make the setting a polished corporate creative office rather than a workshop. Change casual outfits to refined professional business casual: navy blazer with light blouse on left woman, crisp pale blue shirt for standing man, structured cream blazer for seated woman, charcoal business shirt for right man. No ties necessary. Clean up the table substantially: retain just one premium open navy kit, laptop and a few neat presentation swatches/notebook, remove piles of clothing, packing rolls and clutter. Replace workshop racks with elegant glass office partitions, softly blurred meeting room, navy wall, natural window light. Preserve candid expressions, realistic anatomy, photographic skin texture and warm human mood. Wide 3:2 photograph with group on right two thirds and quiet dark navy area at left for website headline. Natural editorial corporate photography, not illustration, not glossy advertisement, no plants, no text, logos, graphics, watermarks or UI. Keep navy and neutral palette with a restrained coral detail. Do not add people.

The `/careers` route uses `CareersPage.tsx` and `careers-page.css`. Job descriptions, requirements, metadata and application links are read from the existing `pages/careers.html` source. Update that source to change the advertised roles.

## Hero asset

### Current illustration

The photo hero was replaced at the user's request with a transparent corporate illustration beside the headline on a light blue background. Built-in imagegen generated `apps/web/public/images/careers/corporate-team-illustration.png`; the previous photo remains unused.

Prompt: Create a polished hand-drawn corporate editorial illustration, clean thin charcoal outlines, flat colour fills, off-white faces with black expressive hair, sophisticated friendly adult proportions, like modern SaaS editorial illustrations. Three colleagues from different disciplines collaborating: seated woman at a simple cream desk using laptop and reviewing a creative swatch sheet; standing man in royal blue overshirt gesturing toward a design board with simple abstract product drawings; another woman in coral #F4724D top holding a navy notebook. Small merchandise samples (bottle, folded tee) on desk. Royal blue #3155ff, coral #F4724D, lavender #c9b8ff, tiny yellow accents, cream and charcoal. Full figures and furniture visible with generous edge safety, compact balanced landscape scene, visually mature, natural gestures. Transparent background; no background shapes or panel, no text, no logos, no plants, no photo, no 3D, no glow, no gradients, no watermark.

### Previous photo (unused)

- Tool: built-in imagegen, generation mode.
- Saved asset: `apps/web/public/images/careers/workshop-hero.jpg` (1920 × 1280).
- Generated illustrative workplace scene; not a photograph of actual Shelf Merch staff.
- Existing packing image reused in the story section.

### Generation prompt

Create a photorealistic natural editorial photograph for a corporate merchandise company's careers website. Ultra wide landscape composition 3:2 or wider. A candid small group of four Indian adult creative and production colleagues in contemporary casual workwear, collaborating around a large worktable checking a navy corporate welcome kit, folded cream apparel, paper packaging samples and laptop. Genuine human interaction, relaxed professional atmosphere, realistic faces and hands, daylight from large workshop windows, tactile materials, sophisticated magazine photography, not glossy stock posing. People grouped mostly in right two thirds; left third softer dark navy workshop background suitable for white headline overlay. Palette natural neutrals, royal blue objects, subtle coral orange detail. No plants, trees, leaves, brand logos, lettering, watermark, decorative graphic arcs or UI. This is an illustrative workplace scene, not a portrait of actual company employees.

## Verification

- Web production build passed.
- `previews/verify-careers.mjs` checked widths 1440, 1024, 768, 390 and 320.
- Verified six unchanged role description bodies, six application mail links, team filter counts, expanded job details, loaded hero and no horizontal overflow.
- Screenshots: `previews/careers-1440.png` and `previews/careers-390.png`.
