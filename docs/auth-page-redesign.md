# Auth page redesign

## Current login reference

Login now follows the user-supplied Shelf Merch reference: a royal-blue left hero, white wordmark, centered white/yellow headline below the existing transparent corporate gift kit, backed by a wide horizontal lavender ellipse; a full-height white right panel contains the working login form and OR divider. Styles are scoped to `.auth-login-reference` in `apps/web/src/styles/auth-login-reference.css`; signup keeps its preceding design. Desktop checks at 1672x942 and 1280x580 have no document overflow. Mobile stacks the hero and form with scrolling so every control remains accessible. Password visibility controls, nine existing auth tests and the web build passed. Screenshots are in `previews/auth-reference-*.png`; verification is `previews/verify-auth-reference.mjs`.

## Previous shared design

Login and sign-up share the approved corporate gifting illustration, royal blue (#3155FF) and coral (#F4724D) diagonal background, no navbar, an 8px white form card, white/yellow headline, public-site fonts, persistent field labels and visible focus states. The artwork uses cream desk legs and charcoal chair supports and wheels for contrast, a lavender CSS oval behind the illustration, cobalt exterior, coral (#F4724D) box interior, yellow furniture accents and cream products. On phones the form appears before the artwork. Compact password-reset screens retain their existing layout. Authentication controllers and API behavior are unchanged.

## Artwork

Built-in image generation tool used for the artwork. Current final asset: `apps/web/public/images/landing/auth-people-gifting-v4.webp`, an original illustration of two coworkers sharing a welcome gift. A standalone top-left logo and separate HTML category pills support the compact desktop layout; there is no navbar. Prior versions are retained as sibling assets. Shared scoped styling is in `apps/web/src/styles/auth-brand.css`. See `auth-people-artwork-v4.md` for the final prompt and desktop-fit checks.

Approved illustration prompt:

Use case: precise-object-edit. Edit target: provided Shelf Merch login artwork. Keep the lavender background, cream desk, yellow chair and lamp, blue legs, broad composition, and clean polished illustrated style. Upgrade ONLY the gifting box and its presentation and add the label cluster described below. The box should be an impressive premium custom printed rigid corporate gift box, cobalt blue exterior, thick crisp walls, cream and lavender large geometric semicircle patterns with tiny warm yellow accents wrapping the front and sides, elegant centered white Shelf Merch wordmark. Inside the upright lid use cream and cobalt geometric brand print and a small tasteful 'Shelf Merch' mark. Replace loose filler with clearly defined tailored lavender compartments holding the folded cream shirt, insulated blue metal bottle, navy cloth notebook, and cream card reading exactly 'Welcome aboard'. Restrained, sophisticated print design, premium packaging craft, no random stickers or childish doodles. Keep all objects fully visible, same furniture and scene. In the upper LEFT empty space above the lamp/chair add three bold black rounded pill labels, inspired by the reference's brand badge arrangement: top row two pills with white sans serif text exactly 'Merch' and 'Gifting', next row centered wider pill exactly 'Recognition'. The text should be crisp and readable; these are category labels, not unrelated company logos. Ensure labels have breathing room, do not overlap the lamp or gift box. Refine the illustration toward flat crisp graphic shapes with minimal shading; keep cobalt, lavender, cream, yellow palette. No people, plants, leaves, cats, additional text, website UI, photorealism, heavy gradients, or watermark. Landscape 3:2 artwork preview.

Final transparent extraction prompt:

Use case: background-extraction. Edit target: the provided approved Shelf Merch login illustration. Remove only the outer lavender rectangular canvas background to genuine transparency. Preserve the darker lavender organic oval behind the furniture as part of the illustration. Keep the cream desk, yellow lamp and chair, printed cobalt gift box, compartments and all merchandise, black label pills with exact white words Merch, Gifting, Recognition, Shelf Merch wordmarks, and Welcome aboard card EXACTLY as in the input. Do not redesign, reposition, crop, or recolor any object. Retain the full furniture including every desk and chair leg, the oval and black text pills, with clean edges and margin on all sides. Transparent alpha outside the organic oval and foreground objects, no rectangular background, no checkerboard baked into the image.

## Validation

- Build passed and nine existing auth-store/login-error tests passed.
- Login and sign-up checked at 1920, 1440, 1024, 768, 390 and 320px, with no horizontal overflow; verified readable labels, 16px inputs, 8px card radius and decoded images.
- Password show/hide, forgot-password navigation and sign-up-to-login navigation passed. No credentials submitted.
- Screenshots and check script saved under `previews/auth-*` and `previews/verify-auth-redesign.mjs`.

Approved stacked login composition: the left artwork is grouped in `.auth-reference-visual`, followed by the centered eyebrow and headline. The right form styling and content are unchanged, including its OR divider. Desktop form coordinates match the earlier verification at 1672x942 and 1280x580; no document overflow at those sizes.
