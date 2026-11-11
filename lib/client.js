// dsh-logo-swap — browser half (client plugin bundle).
//
// Loaded by dsh-client-modules via window.__ModuleLoader__.load, exactly like
// dsh-dream-skin / @local/win-optimizer. Logo-only by design:
//   1. sidebar top-left brand mark  (single slot "sidebar.brand.mark")
//      — show official / hide / replace image, with a size scale (50-300%)
//   2. sidebar brand wordmark (single slot "sidebar.brand.name") — the
//      official artwork is ONE svg: "DeepSeek" letters + "Harness" badge.
//      Both halves are rebuilt independently: official / hidden / custom
//      text / custom image, each with its own size scale.
//   3. conversation hero brand mark (single slot "conversation.hero.brand.mark")
//      — INDEPENDENT image + scale
//   4. sidebar brand fish / version badge (CSS override, follows sidebar image)
//   5. browser tab favicon (follows sidebar image; browser chrome, unscaled)
//   6. hero headline text "探索未至之境" (MutationObserver text swap)
//   7. hero "预览版" preview badge (CSS hide toggle)
// No color/theme changes whatsoever.
//
// Slot semantics verified against the shell bundle + official plugins:
// - register() throws on same-priority duplicate; returns a dispose fn.
// - single slot renders the LOWEST-priority entry; official entries use
//   default priority 0 → we register priority -1 only while active.
// - slots.inject(key, cb) is DECLARATION-GATED: the callback runs only when
//   `key` is declared by some entry's children table. Therefore we inject
//   into the REAL declared slots — never an invented key.
// - The official @deepseek-ai/dsh-client-ui-brand-official registers the
//   shipped mark at priority 0; our priority -1 shadows it and its fallback
//   (incl. the [data-copy-version] version badge) returns on dispose.
//
// Persistence: localStorage (same boundary dsh-dream-skin uses for visual
// prefs). Single source of truth + in-page subscribers keep the panel,
// the slot components and the appliers in sync without reloads.
const STORAGE_KEY = "dsh-logo-swap.custom";
const FAVICON_ID = "dsh-logo-swap-favicon";
const STYLE_ID = "dsh-logo-swap-style";
const DEFAULT_HEADLINE = "探索未至之境";

window.__ModuleLoader__.load({
  id: "dsh-logo-swap",
  factory: (require) => {
    const React = require("react");
    const { createElement: h, useState, useEffect, useRef, useCallback } = React;

    // ── state store ──────────────────────────────────────────────────────
    // Shape v5: { v:5,
    //   sidebar:{ image:{dataUrl,name,at}|null, hidden:boolean, scale:number },
    //   hero:{ image, hidden, scale },
    //   headline:string|null,
    //   previewBadgeHidden:boolean,
    //   wordmark:{ ds:{mode,text,image,scale}, hs:{mode,text,image,scale} } }
    // scale = percent 50..300 (100 = native slot height).
    // Migrations:
    //   v1 {dataUrl,...}          → sidebar+hero same image
    //   v2/v3 wordmark {mode,...} → whole-wordmark control mapped onto the
    //                               two halves (text/image → ds, hs hidden)
    //   v4                        → adds scale:100 everywhere
    function okMark(entry) {
      return Boolean(entry) && typeof entry.dataUrl === "string" && entry.dataUrl.startsWith("data:image/");
    }

    function clampScale(raw) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return 100;
      return Math.min(300, Math.max(50, Math.round(n)));
    }

    function normalizePart(raw) {
      const mode = raw?.mode === "hidden" || raw?.mode === "custom" || raw?.mode === "image" ? raw.mode : "official";
      const text = typeof raw?.text === "string" ? raw.text : "";
      const image = okMark(raw?.image) ? raw.image : null;
      // keep text/image even in official mode so toggling back restores them
      return { mode, text, image, scale: clampScale(raw?.scale) };
    }

    function normalizeWordmark(raw) {
      if (raw && raw.ds && raw.hs) {
        return { ds: normalizePart(raw.ds), hs: normalizePart(raw.hs) };
      }
      // v3 single wordmark {mode,text,image}
      if (raw && typeof raw === "object" && typeof raw.mode === "string") {
        const part = normalizePart(raw);
        if (part.mode === "hidden") {
          return { ds: { mode: "hidden", text: "", image: null, scale: 100 }, hs: { mode: "hidden", text: "", image: null, scale: 100 } };
        }
        if (part.mode === "custom" || part.mode === "image") {
          // old whole-wordmark replacement: keep it on the DeepSeek half,
          // hide the Harness half (old render was ONE element for both)
          return { ds: part, hs: { mode: "hidden", text: "", image: null, scale: 100 } };
        }
      }
      return { ds: normalizePart(null), hs: normalizePart(null) };
    }

    function normalizeSlot(raw) {
      // v5 {image, hidden, scale}; v2-v4 legacy {dataUrl,...} / {image,hidden}
      if (!raw) return { image: null, hidden: false, scale: 100 };
      const image = okMark(raw.image)
        ? raw.image
        : okMark(raw)
          ? { dataUrl: raw.dataUrl, name: raw.name ?? "", at: raw.at ?? 0 }
          : null;
      return { image, hidden: raw.hidden === true, scale: clampScale(raw.scale) };
    }

    function defaults() {
      return {
        v: 5,
        sidebar: { image: null, hidden: false, scale: 100 },
        hero: { image: null, hidden: false, scale: 100 },
        headline: null,
        previewBadgeHidden: false,
        wordmark: { ds: normalizePart(null), hs: normalizePart(null) },
      };
    }

    function loadStored() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.dataUrl === "string" && parsed.dataUrl.startsWith("data:image/")) {
          const legacy = { dataUrl: parsed.dataUrl, name: parsed.name ?? "", at: parsed.at ?? 0 };
          const base = defaults();
          base.sidebar = { image: legacy, hidden: false, scale: 100 };
          base.hero = { image: legacy, hidden: false, scale: 100 };
          return base;
        }
        if (parsed && (parsed.v === 2 || parsed.v === 3 || parsed.v === 4 || parsed.v === 5)) {
          if (parsed.headline != null && typeof parsed.headline !== "string") return null;
          const base = defaults();
          base.sidebar = normalizeSlot(parsed.sidebar);
          base.hero = normalizeSlot(parsed.hero);
          base.headline = parsed.headline || null;
          base.previewBadgeHidden = parsed.previewBadgeHidden === true;
          base.wordmark = normalizeWordmark(parsed.wordmark);
          return base;
        }
        return null;
      } catch {
        return null;
      }
    }

    const listeners = new Set();
    let current = loadStored();

    function setCurrent(next) {
      current = next;
      try {
        if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        else localStorage.removeItem(STORAGE_KEY);
      } catch {}
      for (const listener of listeners) {
        try {
          listener(current);
        } catch {}
      }
      applyIdentity(current);
      applyHeadline(current);
      if (current?.sidebar?.scale > 100) ensureFlexObserver();
      scheduleFlexRelease();
    }

    // Delayed so React has flushed the new height attribute before we scan.
    let flexTimer = 0;
    function scheduleFlexRelease() {
      if (flexTimer) return;
      flexTimer = window.setTimeout(() => {
        flexTimer = 0;
        releaseScaledContainers();
      }, 60);
    }

    // The brand row mounts/unmounts on navigation, collapse and re-renders —
    // after each such mount the unlock must be re-evaluated, otherwise the
    // scaled logo is clipped again until the next settings change. Watch the
    // whole document (works even before <body> exists at boot time).
    let flexObserver = null;
    function ensureFlexObserver() {
      if (flexObserver) return;
      flexObserver = new MutationObserver(scheduleFlexRelease);
      flexObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    // ── favicon / brand-fish / preview-badge CSS application ─────────────
    // Original favicon is two media-query svg links (dark/light) from
    // index.html; restore them verbatim on reset.
    const DEFAULT_FAVICONS = [
      { rel: "icon", type: "image/svg+xml", href: "./favicon-dark.svg", media: "(prefers-color-scheme: dark)" },
      { rel: "icon", type: "image/svg+xml", href: "./favicon.svg", media: "(prefers-color-scheme: light)" },
    ];

    function buildFaviconLink(spec) {
      const link = document.createElement("link");
      link.id = FAVICON_ID;
      link.rel = spec.rel;
      link.type = spec.type;
      link.href = spec.href;
      if (spec.media) link.media = spec.media;
      return link;
    }

    function ensureFavicon(dataUrl) {
      const existing = document.getElementById(FAVICON_ID);
      if (existing) existing.remove();
      document.querySelectorAll('link[rel="icon"]').forEach((node) => {
        if (node.id !== FAVICON_ID) node.remove();
      });
      if (dataUrl) {
        document.head.appendChild(
          buildFaviconLink({ rel: "icon", type: "image/png", href: dataUrl, media: null }),
        );
      } else {
        for (const spec of DEFAULT_FAVICONS) document.head.appendChild(buildFaviconLink(spec));
      }
    }

    function ensureStyle(entry) {
      let tag = document.getElementById(STYLE_ID);
      if (!tag) {
        tag = document.createElement("style");
        tag.id = STYLE_ID;
        document.head.appendChild(tag);
      }
      const dataUrl = entry?.sidebar?.image?.dataUrl ?? null;
      const hideBadge = entry?.previewBadgeHidden === true;
      let css = "";
      if (dataUrl) {
        css += `[data-copy-version] { position: relative; }
[data-copy-version] svg { visibility: hidden; }
[data-copy-version]::after {
  content: "";
  position: absolute; inset: 0;
  background: url("${dataUrl}") center / contain no-repeat;
}`;
      }
      if (hideBadge) {
        // hero "预览版" badge (css-module hash class contains "previewBadge")
        css += `[class*="previewBadge"] { display: none !important; }`;
      }
      tag.textContent = css;
    }

    function applyIdentity(entry) {
      ensureFavicon(entry?.sidebar?.image?.dataUrl ?? null);
      ensureStyle(entry);
    }

    // ── headline replacement (text-node swap; locale.register cannot
    //    override the shipped conversation NS — it throws on duplicates) ──
    let lastHeadlineCustom = null;
    let headlineObserver = null;
    let headlineTimer = 0;

    function replaceHeadlineText(custom) {
      if (!document.body) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const edits = [];
      let node;
      while ((node = walker.nextNode())) {
        const value = node.nodeValue;
        if (!value) continue;
        if (custom) {
          if (value.includes(DEFAULT_HEADLINE)) edits.push([node, value.split(DEFAULT_HEADLINE).join(custom)]);
        } else if (lastHeadlineCustom && value.includes(lastHeadlineCustom)) {
          edits.push([node, value.split(lastHeadlineCustom).join(DEFAULT_HEADLINE)]);
        }
      }
      for (const [target, value] of edits) {
        try {
          target.nodeValue = value;
        } catch {}
      }
    }

    function scheduleHeadline() {
      if (headlineTimer) return;
      if (!current?.headline) return; // no custom text → nothing to re-apply
      headlineTimer = window.setTimeout(() => {
        headlineTimer = 0;
        replaceHeadlineText(current?.headline || null);
      }, 60);
    }

    function ensureHeadlineObserver() {
      if (headlineObserver || !document.body) return;
      headlineObserver = new MutationObserver(scheduleHeadline);
      headlineObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    function applyHeadline(entry) {
      const custom = entry?.headline || null;
      if (custom) {
        ensureHeadlineObserver();
        replaceHeadlineText(custom);
        lastHeadlineCustom = custom;
      } else {
        if (lastHeadlineCustom) replaceHeadlineText(null);
        lastHeadlineCustom = null;
      }
    }

    // ── remote service (local file import via host half) ─────────────────
    let connectionRef = null;
    async function rpcReadFile(path) {
      const conn = connectionRef;
      if (!conn) throw new Error("connection 未就绪");
      const result = await conn.rpc.call("/api", "logoswap/read", { args: { path } }, null);
      if (!result || result.ok !== true) {
        const err = result?.error;
        throw new Error(err?.message ?? "RPC failure");
      }
      return result.value;
    }

    // ── shared hook ──────────────────────────────────────────────────────
    function useLogoState() {
      const [entry, setEntry] = useState(current);
      useEffect(() => {
        const listener = (next) => setEntry(next);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);
      return entry;
    }

    // ── slot components ──────────────────────────────────────────────────
    // Render at the slot's native height × user scale, with the image's OWN
    // aspect ratio (width auto).
    function MarkImage({ entry, size, maxWidth, scale, tag }) {
      if (!entry) return null;
      const base = typeof size === "number" ? size : Number(size) || 24;
      const k = clampScale(scale) / 100;
      const px = base * k;
      return h("img", {
        src: entry.dataUrl,
        height: px,
        alt: "",
        draggable: false,
        "aria-hidden": true,
        "data-dsh-logoswap": tag ?? "",
        "data-dsh-logoswap-base": String(base),
        style: {
          display: "block",
          height: px,
          width: "auto",
          maxWidth: (maxWidth ?? base * 7) * k,
          objectFit: "contain",
          opacity: 0.95,
        },
      });
    }

    function SidebarMark(props) {
      const entry = useLogoState();
      const slot = entry?.sidebar;
      if (!slot || slot.hidden) return null;
      return MarkImage({ entry: slot.image ?? null, size: props?.size ?? 24, maxWidth: 200, scale: slot.scale, tag: "sidebar" });
    }

    function HeroMark(props) {
      const entry = useLogoState();
      const slot = entry?.hero;
      if (!slot || slot.hidden) return null;
      return MarkImage({ entry: slot.image ?? null, size: props?.size ?? 34, maxWidth: 240, scale: slot.scale, tag: "hero" });
    }

    // ── scaled-mark container release ────────────────────────────────────
    // The sidebar locks its brand row to fixed heights (brandIdentity 24px,
    // brandMark centered, logoRow 60px/40px, .brand overflow:hidden), so an
    // enlarged logo would be clipped inside that fixed frame. When a scaled
    // mark (scale > 100) is active, emit an override stylesheet that unlocks
    // every ANCESTOR of the img up to the brand row. Selectors are generated
    // from the live DOM (no css-module hashes hardcoded).
    const FLEX_STYLE_ID = "dsh-logo-swap-flex";

    function releaseScaledContainers() {
      let tag = document.getElementById(FLEX_STYLE_ID);
      if (!tag) {
        tag = document.createElement("style");
        tag.id = FLEX_STYLE_ID;
        document.head.appendChild(tag);
      }
      // A slot needs unlocking when its rendered mark exceeds the slot's
      // native size (sidebar 24px / wordmark 24px). Hero has no fixed-height
      // ancestor chain, so it never needs this.
      const imgs = [...document.querySelectorAll("img[data-dsh-logoswap]")];
      const needsUnlock = imgs.some((img) => {
        const base = Number(img.getAttribute("data-dsh-logoswap-base")) || 24;
        const now = Number(img.getAttribute("height")) || base;
        return img.getAttribute("data-dsh-logoswap") === "sidebar" && now > base + 0.001;
      });
      // Text-mode wordmark also grows past 24px — detect via rendered span.
      if (!needsUnlock) {
        const spans = [...document.querySelectorAll('span[data-dsh-logoswap="wordmark"]')];
        if (spans.some((el) => el.getBoundingClientRect().height > 24.001)) {
          return unlockChain(spans[0], tag);
        }
        if (tag.textContent === "") return;
        tag.textContent = "";
        return;
      }
      unlockChain(imgs.find((img) => img.getAttribute("data-dsh-logoswap") === "sidebar"), tag);
    }

    function unlockChain(node, tag) {
      const rules = new Set();
      // climb from the img to the brand row: mark anchor → brandMark →
      // brandIdentity → brand → logoRow. Stop at the sidebar root
      // (css-module "…_root") so the whole sidebar layout stays intact.
      let cur = node?.parentElement;
      for (let depth = 0; depth < 8 && cur && cur !== document.body; depth++) {
        const cls = typeof cur.className === "string" ? cur.className : "";
        const first = cls.split(/\s+/)[0];
        if (!first) {
          cur = cur.parentElement;
          continue;
        }
        if (/_root$/.test(first)) {
          // collapsed sidebar intentionally clips the brand row (height 0/36px)
          // — do not unlock in that state.
          if (/\bcollapsed\b/.test(cls)) return;
          break;
        }
        rules.add(`.${CSS.escape(first)} { height: auto !important; min-height: 0 !important; overflow: visible !important; }`);
        cur = cur.parentElement;
      }
      const css = [...rules].join("\n");
      // Skip identical writes: textContent assignment always mutates the DOM,
      // which would feed our own observer in an endless loop.
      if (tag.textContent === css) return;
      tag.textContent = css;
    }

    // ── brand wordmark ("DeepSeek" + "Harness" badge) reconstruction ─────
    // Official artwork = ONE 156×24 svg (BrandWordmark includeMark:false,
    // viewBox "26 0 156 24"): 9 paths are the "DeepSeek" letters (x≈26-121.5),
    // then a rounded rect (x:129.348 y:5.5 w:52 h:14 rx:2) + 7 clipped paths
    // are the "Harness" badge. We rebuild each half as its own svg so they
    // can be hidden / replaced independently. Fills are copied per-path from
    // the official artwork (letters: currentColor; badge letters:
    // var(--dsw-alias-label-primary-inverted)) so dark/light themes keep
    // working.
    const WM_ART = {"ds":{"viewBox":"26 0 96 24","width":96,"paths":[{"d":"M68.416 18.2447H67.0501V16.1272H68.416C69.2619 16.1272 70.1166 15.9163 70.6671 15.3304C71.2181 14.7444 71.426 13.8455 71.426 12.9471C71.426 12.0487 71.2268 11.1498 70.6671 10.5643C70.1083 9.97831 69.2619 9.76744 68.416 9.76744C67.5701 9.76744 66.7154 9.97831 66.1639 10.5643C65.6129 11.1503 65.4049 12.0487 65.4049 12.9471V21.6435H63.009V7.6582H65.4049V8.54883H65.8442C65.8918 8.49393 65.9394 8.44728 65.9875 8.40064C66.5871 7.85353 67.5049 7.6582 68.4072 7.6582C69.8212 7.6582 71.2341 8.00998 72.1607 8.98662C73.0868 9.96325 73.4143 11.4632 73.4143 12.9558C73.4143 14.4485 73.0785 15.9406 72.1607 16.925C71.2424 17.9094 69.8212 18.2457 68.416 18.2457V18.2447Z","fill":"currentColor"},{"d":"M31.9551 8.03497H33.3204V10.1525H31.9551C31.1087 10.1525 30.2545 10.3633 29.7035 10.9493C29.1525 11.5353 28.945 12.4342 28.945 13.3326C28.945 14.231 29.1447 15.1294 29.7035 15.7154C30.2623 16.3014 31.1087 16.5122 31.9551 16.5122C32.8015 16.5122 33.6562 16.3014 34.2072 15.7154C34.7582 15.1294 34.9657 14.231 34.9657 13.3326V4.62842H37.3611V18.6219H34.9657V17.7313H34.5264C34.4783 17.7857 34.4307 17.8329 34.3826 17.8795C33.7835 18.4261 32.8652 18.6219 31.9629 18.6219C30.5494 18.6219 29.136 18.2707 28.2099 17.294C27.2838 16.3174 26.9563 14.817 26.9563 13.3248C26.9563 11.8327 27.2916 10.34 28.2099 9.35561C29.136 8.37898 30.5494 8.03497 31.9551 8.03497Z","fill":"currentColor"},{"d":"M49.3786 13.1431V13.9948H42.9984V12.2996H47.2305C47.1348 11.6825 46.9113 11.1043 46.5119 10.682C45.9371 10.0727 45.0503 9.85409 44.1723 9.85409C43.2943 9.85409 42.4076 10.0727 41.8328 10.682C41.258 11.2913 41.05 12.2213 41.05 13.1435C41.05 14.0658 41.2575 15.003 41.8328 15.6046C42.4076 16.2061 43.2939 16.433 44.1723 16.433C45.0508 16.433 45.9371 16.2143 46.5119 15.6046C46.5916 15.5186 46.6635 15.4248 46.7354 15.331H49.0992C48.8918 16.0657 48.5643 16.7299 48.0691 17.2454C47.111 18.2531 45.6339 18.6205 44.1723 18.6205C42.7108 18.6205 41.2337 18.2609 40.2755 17.2454C39.3174 16.2299 38.9661 14.6828 38.9661 13.1435C38.9661 11.6043 39.3096 10.0494 40.2755 9.04168C41.242 8.03396 42.7108 7.66663 44.1723 7.66663C45.6339 7.66663 47.111 8.02618 48.0691 9.04168C49.0351 10.0572 49.3786 11.6043 49.3786 13.1435V13.1431Z","fill":"currentColor"},{"d":"M61.4045 13.1431V13.9948H55.0243V12.2996H59.2564C59.1602 11.6825 58.9372 11.1043 58.5378 10.682C57.963 10.0727 57.0762 9.85409 56.1982 9.85409C55.3202 9.85409 54.4335 10.0727 53.8587 10.682C53.2839 11.2913 53.0759 12.2213 53.0759 13.1435C53.0759 14.0658 53.2834 15.003 53.8587 15.6046C54.4335 16.2061 55.3202 16.433 56.1982 16.433C57.0762 16.433 57.963 16.2143 58.5378 15.6046C58.6179 15.5186 58.6894 15.4248 58.7608 15.331H61.1251C60.9171 16.0657 60.5897 16.7299 60.0945 17.2454C59.1364 18.2531 57.6593 18.6205 56.1982 18.6205C54.7372 18.6205 53.2596 18.2609 52.3014 17.2454C51.3432 16.2299 50.9919 14.6828 50.9919 13.1435C50.9919 11.6043 51.3355 10.0494 52.3014 9.04168C53.2678 8.03396 54.7367 7.66663 56.1982 7.66663C57.6598 7.66663 59.1364 8.02618 60.0945 9.04168C61.061 10.0572 61.4045 11.6043 61.4045 13.1435V13.1431Z","fill":"currentColor"},{"d":"M80.242 18.6214C81.7035 18.6214 83.1801 18.4105 84.1383 17.809C85.0965 17.2075 85.4482 16.2931 85.4482 15.3869C85.4482 14.4807 85.1042 13.5585 84.1383 12.9647C83.1801 12.371 81.703 12.1518 80.242 12.1518C79.6186 12.1518 79.0438 12.0658 78.6366 11.8394C78.2294 11.6047 78.0778 11.2534 78.0778 10.9017C78.0778 10.5499 78.2216 10.1908 78.6366 9.9639C79.0438 9.72921 79.6749 9.65147 80.2973 9.65147C80.9198 9.65147 81.5509 9.73747 81.9591 9.9639C82.3663 10.1986 82.5179 10.5499 82.5179 10.9017H84.9531C84.9531 9.99499 84.6421 9.07327 83.7719 8.47951C82.9017 7.88576 81.5679 7.66663 80.2424 7.66663C78.9169 7.66663 77.5837 7.8775 76.713 8.47951C75.8427 9.08104 75.5308 9.99499 75.5308 10.9017C75.5308 11.8083 75.8423 12.73 76.713 13.3238C77.5832 13.9176 78.9165 14.1367 80.2424 14.1367C80.929 14.1367 81.688 14.2227 82.1428 14.4491C82.5985 14.676 82.7579 15.0351 82.7579 15.3869C82.7579 15.7387 82.5985 16.0977 82.1428 16.3246C81.688 16.5511 80.9931 16.6371 80.3066 16.6371C79.62 16.6371 78.9169 16.5511 78.4694 16.3246C78.0224 16.0982 77.8543 15.7387 77.8543 15.3869H75.0435C75.0435 16.2935 75.3865 17.2153 76.3534 17.809C77.3194 18.4028 78.7809 18.6214 80.2424 18.6214H80.242Z","fill":"currentColor"},{"d":"M97.4733 13.1431V13.9948H91.0932V12.2996H95.3252C95.23 11.6825 95.006 11.1043 94.6071 10.682C94.0313 10.0727 93.1456 9.85409 92.2666 9.85409C91.3876 9.85409 90.5018 10.0727 89.927 10.682C89.3522 11.2913 89.1452 12.2213 89.1452 13.1435C89.1452 14.0658 89.3522 15.003 89.927 15.6046C90.5018 16.2061 91.3886 16.433 92.2666 16.433C93.1446 16.433 94.0313 16.2143 94.6071 15.6046C94.6863 15.5186 94.7587 15.4248 94.8301 15.331H97.1935C96.9855 16.0657 96.6585 16.7299 96.1639 17.2454C95.2057 18.2531 93.7281 18.6205 92.2666 18.6205C90.805 18.6205 89.3284 18.2609 88.3703 17.2454C87.4121 16.2299 87.0613 14.6828 87.0613 13.1435C87.0613 11.6043 87.4043 10.0494 88.3703 9.04168C89.3367 8.03396 90.806 7.66663 92.2666 7.66663C93.7272 7.66663 95.2057 8.02618 96.1639 9.04168C97.1298 10.0572 97.4729 11.6043 97.4729 13.1435L97.4733 13.1431Z","fill":"currentColor"},{"d":"M109.499 13.1431V13.9948H103.119V12.2996H107.351C107.256 11.6825 107.032 11.1043 106.632 10.682C106.057 10.0727 105.172 9.85409 104.293 9.85409C103.414 9.85409 102.528 10.0727 101.953 10.682C101.378 11.2913 101.17 12.2213 101.17 13.1435C101.17 14.0658 101.378 15.003 101.953 15.6046C102.528 16.2061 103.415 16.433 104.293 16.433C105.171 16.433 106.057 16.2143 106.632 15.6046C106.712 15.5186 106.784 15.4248 106.856 15.331H109.22C109.012 16.0657 108.685 16.7299 108.19 17.2454C107.231 18.2531 105.754 18.6205 104.293 18.6205C102.831 18.6205 101.355 18.2609 100.396 17.2454C99.4382 16.2299 99.0864 14.6828 99.0864 13.1435C99.0864 11.6043 99.4295 10.0494 100.396 9.04168C101.362 8.03396 102.832 7.66663 104.293 7.66663C105.754 7.66663 107.231 8.02618 108.19 9.04168C109.156 10.0572 109.499 11.6043 109.499 13.1435V13.1431Z","fill":"currentColor"},{"d":"M113.5 4.62817H111.104V18.6217H113.5V4.62817Z","fill":"currentColor"},{"d":"M117.589 12.8154L121.517 18.6208H118.554L114.625 12.8154L118.554 8.15088H121.517L117.589 12.8154Z","fill":"currentColor"}]},"hs":{"viewBox":"129 0 53 24","width":53,"rect":{"x":129.348,"y":5.5,"w":52,"h":14,"rx":2},"clip":{"x":132.348,"y":5.5,"w":46,"h":14},"paths":[{"d":"M132.848 8.93205H134.08V16.137H132.848V8.93205ZM136.5 8.93205H137.732V16.137H136.5V8.93205ZM133.365 13.024V11.99H137.193V13.024H133.365Z","fill":"var(--dsw-alias-label-primary-inverted)"},{"d":"M140.397 14.432L140.672 13.453H143.202L143.532 14.432H140.397ZM140.287 16.137H139.055L141.277 8.93205H142.201L142.146 9.74605L140.947 13.915H140.969L140.287 16.137ZM145.039 16.137H143.741L143.07 13.948L143.081 13.937L141.871 9.74605L141.926 8.93205H142.817L145.039 16.137Z","fill":"var(--dsw-alias-label-primary-inverted)"},{"d":"M146.846 8.93205H149.068C149.852 8.93205 150.443 9.11538 150.839 9.48205C151.235 9.84138 151.433 10.3327 151.433 10.956C151.433 11.22 151.396 11.4657 151.323 11.693C151.249 11.9204 151.125 12.1257 150.949 12.309C150.773 12.4924 150.531 12.65 150.223 12.782C149.922 12.9067 149.541 13.0057 149.079 13.079V13.321H146.846V12.639L148.023 12.485C148.631 12.4044 149.09 12.298 149.398 12.166C149.706 12.034 149.915 11.8764 150.025 11.693C150.135 11.5024 150.19 11.2934 150.19 11.066C150.19 10.6994 150.083 10.417 149.871 10.219C149.658 10.021 149.324 9.92205 148.87 9.92205H146.846V8.93205ZM146.395 8.93205H147.627V16.137H146.395V8.93205ZM151.917 16.093V16.137H150.366L149.024 14.322C148.87 14.1094 148.73 13.9407 148.606 13.816C148.481 13.684 148.345 13.5887 148.199 13.53C148.052 13.464 147.872 13.42 147.66 13.398C147.447 13.3687 147.176 13.3504 146.846 13.343V13.145H149.079C149.233 13.211 149.368 13.2844 149.486 13.365C149.61 13.4457 149.735 13.5447 149.86 13.662C149.992 13.7794 150.138 13.937 150.3 14.135L151.917 16.093Z","fill":"var(--dsw-alias-label-primary-inverted)"},{"d":"M153.58 9.57005L153.591 8.93205H154.46L157.584 15.51V16.137H156.704L153.58 9.57005ZM158.024 16.137H156.968L156.88 8.93205H158.024V16.137ZM154.24 16.137H153.096V8.93205H154.152L154.24 16.137Z","fill":"var(--dsw-alias-label-primary-inverted)"},{"d":"M159.963 8.93205H161.206V16.137H159.963V8.93205ZM160.095 9.96605V8.93205H164.858V9.96605H160.095ZM160.095 16.137V15.103H164.902V16.137H160.095ZM160.095 13.013V11.99H164.374V13.013H160.095Z","fill":"var(--dsw-alias-label-primary-inverted)"},{"d":"M169.052 15.257C169.543 15.257 169.895 15.1654 170.108 14.982C170.328 14.7987 170.438 14.5457 170.438 14.223C170.438 14.047 170.405 13.8967 170.339 13.772C170.273 13.6474 170.152 13.5337 169.976 13.431C169.807 13.321 169.558 13.2147 169.228 13.112L168.491 12.881C167.846 12.6757 167.38 12.4044 167.094 12.067C166.808 11.7297 166.665 11.3007 166.665 10.78C166.665 10.428 166.76 10.1017 166.951 9.80105C167.142 9.50038 167.428 9.25838 167.809 9.07505C168.19 8.89172 168.663 8.80005 169.228 8.80005C169.631 8.80005 169.998 8.82938 170.328 8.88805C170.665 8.93938 171.039 9.01638 171.45 9.11905L171.274 10.175C170.834 10.0504 170.442 9.96238 170.097 9.91105C169.76 9.85238 169.463 9.82305 169.206 9.82305C168.737 9.82305 168.403 9.90738 168.205 10.076C168.007 10.2374 167.908 10.439 167.908 10.681C167.908 10.857 167.941 11.0147 168.007 11.154C168.073 11.286 168.19 11.407 168.359 11.517C168.535 11.627 168.784 11.7334 169.107 11.836L169.866 12.078C170.526 12.276 170.995 12.5327 171.274 12.848C171.553 13.156 171.692 13.585 171.692 14.135C171.692 14.5604 171.589 14.9344 171.384 15.257C171.179 15.5797 170.878 15.8327 170.482 16.016C170.093 16.1994 169.609 16.291 169.03 16.291C168.627 16.291 168.212 16.247 167.787 16.159C167.362 16.071 166.9 15.9427 166.401 15.774L166.665 14.718C167.156 14.894 167.6 15.0297 167.996 15.125C168.399 15.213 168.751 15.257 169.052 15.257Z","fill":"var(--dsw-alias-label-primary-inverted)"},{"d":"M175.809 15.257C176.3 15.257 176.652 15.1654 176.865 14.982C177.085 14.7987 177.195 14.5457 177.195 14.223C177.195 14.047 177.162 13.8967 177.096 13.772C177.03 13.6474 176.909 13.5337 176.733 13.431C176.564 13.321 176.315 13.2147 175.985 13.112L175.248 12.881C174.603 12.6757 174.137 12.4044 173.851 12.067C173.565 11.7297 173.422 11.3007 173.422 10.78C173.422 10.428 173.517 10.1017 173.708 9.80105C173.899 9.50038 174.185 9.25838 174.566 9.07505C174.947 8.89172 175.42 8.80005 175.985 8.80005C176.388 8.80005 176.755 8.82938 177.085 8.88805C177.422 8.93938 177.796 9.01638 178.207 9.11905L178.031 10.175C177.591 10.0504 177.199 9.96238 176.854 9.91105C176.517 9.85238 176.22 9.82305 175.963 9.82305C175.494 9.82305 175.16 9.90738 174.962 10.076C174.764 10.2374 174.665 10.439 174.665 10.681C174.665 10.857 174.698 11.0147 174.764 11.154C174.83 11.286 174.947 11.407 175.116 11.517C175.292 11.627 175.541 11.7334 175.864 11.836L176.623 12.078C177.283 12.276 177.752 12.5327 178.031 12.848C178.31 13.156 178.449 13.585 178.449 14.135C178.449 14.5604 178.346 14.9344 178.141 15.257C177.936 15.5797 177.635 15.8327 177.239 16.016C176.85 16.1994 176.366 16.291 175.787 16.291C175.384 16.291 174.969 16.247 174.544 16.159C174.119 16.071 173.657 15.9427 173.158 15.774L173.422 14.718C173.913 14.894 174.357 15.0297 174.753 15.125C175.156 15.213 175.508 15.257 175.809 15.257Z","fill":"var(--dsw-alias-label-primary-inverted)"}]}};

    function DsArtwork({ height }) {
      const H = height ?? 24;
      return h(
        "svg",
        {
          width: (H * 96) / 24,
          height: H,
          viewBox: "26 0 96 24",
          fill: "none",
          "aria-hidden": true,
          style: { display: "block", flex: "none" },
        },
        WM_ART.ds.paths.map((p, i) => h("path", { key: i, d: p.d, fill: p.fill })),
      );
    }

    function HsArtwork({ height }) {
      const H = height ?? 24;
      const clipId = "dsh-logoswap-hs-clip";
      return h(
        "svg",
        {
          width: (H * 53) / 24,
          height: H,
          viewBox: "129 0 53 24",
          fill: "none",
          "aria-hidden": true,
          style: { display: "block", flex: "none" },
        },
        h("defs", null, h("clipPath", { id: clipId }, h("rect", { x: 132.348, y: 5.5, width: 46, height: 14 }))),
        h("rect", { x: 129.348, y: 5.5, width: 52, height: 14, rx: 2, fill: "currentColor" }),
        h("g", { clipPath: `url(#${clipId})` }, WM_ART.hs.paths.map((p, i) => h("path", { key: i, d: p.d, fill: p.fill }))),
      );
    }

    function WordmarkSegment({ kind, part }) {
      if (!part || part.mode === "hidden") return null;
      const k = clampScale(part.scale) / 100;
      if (part.mode === "image")
        return part.image
          ? MarkImage({ entry: part.image, size: 24, maxWidth: 220, scale: part.scale, tag: "wordmark" })
          : null;
      if (part.mode === "custom") {
        const text = (part.text || "").trim();
        if (!text) return null;
        return h(
          "span",
          {
            "data-dsh-logoswap": "wordmark",
            style: {
              fontSize: 17 * k,
              fontWeight: 600,
              letterSpacing: "0.04em",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              color: "inherit",
            },
          },
          text,
        );
      }
      return kind === "ds" ? h(DsArtwork, { height: 24 }) : h(HsArtwork, { height: 24 });
    }

    function WordmarkCustom() {
      const entry = useLogoState();
      const wm = entry?.wordmark;
      if (!wm) return null;
      const ds = wm.ds ?? { mode: "official", text: "", image: null };
      const hs = wm.hs ?? { mode: "official", text: "", image: null };
      if (ds.mode === "official" && hs.mode === "official") return null;
      return h(
        "span",
        { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
        h(WordmarkSegment, { kind: "ds", part: ds }),
        h(WordmarkSegment, { kind: "hs", part: hs }),
      );
    }

    // ── settings section panel ───────────────────────────────────────────
    const borderStyle = {
      border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35))",
      background: "var(--dsw-alias-bg-layer-1, transparent)",
      color: "inherit",
    };

    const ghostButton = {
      padding: "4px 12px",
      borderRadius: 8,
      border: "1px solid transparent",
      background: "transparent",
      color: "inherit",
      cursor: "pointer",
      fontSize: 12,
    };

    const buttonStyle = {
      padding: "4px 12px",
      borderRadius: 8,
      ...borderStyle,
      cursor: "pointer",
      fontSize: 12,
      whiteSpace: "nowrap",
    };

    const textInputStyle = {
      flex: 1,
      minWidth: 0,
      padding: "4px 10px",
      borderRadius: 8,
      fontSize: 12,
      ...borderStyle,
    };

    function Segmented({ options, value, onChange, disabled }) {
      return h(
        "div",
        { style: { display: "inline-flex", alignSelf: "flex-start", borderRadius: 8, overflow: "hidden", ...borderStyle } },
        options.map((o, i) =>
          h(
            "button",
            {
              key: o.value,
              disabled: disabled || o.disabled,
              onClick: () => onChange(o.value),
              style: {
                padding: "4px 14px",
                fontSize: 12,
                border: "none",
                borderLeft: i > 0 ? "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.35))" : "none",
                cursor: disabled || o.disabled ? "default" : "pointer",
                background: value === o.value ? "var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.18))" : "transparent",
                color: "inherit",
                fontWeight: value === o.value ? 600 : 400,
                whiteSpace: "nowrap",
                opacity: disabled || o.disabled ? 0.45 : 1,
              },
            },
            o.label,
          ),
        ),
      );
    }

    function SizeRow({ value, onChange, disabled }) {
      return h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 10 } },
        h("span", { style: { fontSize: 12, opacity: 0.65, flex: "none" } }, "大小"),
        h("input", {
          type: "range",
          min: 50,
          max: 300,
          step: 5,
          value,
          disabled,
          onChange: (e) => onChange(Number(e.target.value)),
          style: { flex: 1, accentColor: "var(--dsw-alias-label-primary, currentColor)", minWidth: 120 },
        }),
        h("span", { style: { fontSize: 12, fontVariantNumeric: "tabular-nums", minWidth: 42, textAlign: "right", opacity: disabled ? 0.45 : 0.85 } }, `${value}%`),
      );
    }

    function Card({ title, badge, children }) {
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 12, ...borderStyle } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
          h("div", { style: { fontSize: 13, fontWeight: 600 } }, title),
          badge
            ? h("span", { style: { fontSize: 11, padding: "2px 9px", borderRadius: 999, ...borderStyle, opacity: 0.8, whiteSpace: "nowrap" } }, badge)
            : null,
        ),
        ...children,
      );
    }

    // Top-level category card (侧栏自定义 / 对话页自定义) — stronger frame.
    function GroupCard({ title, badge, children }) {
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px", borderRadius: 14, ...borderStyle, background: "var(--dsw-alias-bg-secondary, rgba(128,128,128,.06))" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
          h("div", { style: { fontSize: 14, fontWeight: 700 } }, title),
          badge
            ? h("span", { style: { fontSize: 11, padding: "2px 10px", borderRadius: 999, ...borderStyle, opacity: 0.8, whiteSpace: "nowrap" } }, badge)
            : null,
        ),
        ...children,
      );
    }

    // Nested item card inside a category — lighter frame.
    function SubCard({ title, badge, children }) {
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10, padding: "10px 12px", borderRadius: 10, ...borderStyle, background: "var(--dsw-alias-bg-primary, transparent)" } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
          h("div", { style: { fontSize: 12.5, fontWeight: 600, opacity: 0.9 } }, title),
          badge
            ? h("span", { style: { fontSize: 10.5, padding: "1px 8px", borderRadius: 999, ...borderStyle, opacity: 0.7, whiteSpace: "nowrap" } }, badge)
            : null,
        ),
        ...children,
      );
    }

    function MarkThumb({ entry }) {
      return entry
        ? h("img", { src: entry.dataUrl, alt: "", style: { width: 44, height: 44, objectFit: "contain", borderRadius: 8, padding: 3, flex: "none", ...borderStyle } })
        : h(
            "div",
            { style: { width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, opacity: 0.45, borderRadius: 8, flex: "none", ...borderStyle } },
            "默认",
          );
    }

    // Sidebar / hero logo card body: visibility, size, image source.
    function MarkSlotBody({ slot, busy, onShow, onHide, onScale, onFile, onPath, onReset, hint }) {
      const fileInputRef = useRef(null);
      const pathInputRef = useRef(null);
      const pickFile = useCallback(() => fileInputRef.current?.click(), []);
      const onFileChosen = useCallback(
        (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        },
        [onFile],
      );
      const importFromPath = useCallback(() => {
        const path = pathInputRef.current?.value?.trim();
        if (path) onPath(path);
      }, [onPath]);

      const locked = slot.hidden === true;
      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10 } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 12 } },
          h(MarkThumb, { entry: slot.image ?? null }),
          h(
            "div",
            { style: { display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 } },
            h(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 8 } },
              h(Segmented, {
                options: [
                  { value: "show", label: "显示" },
                  { value: "hide", label: "隐藏" },
                ],
                value: locked ? "hide" : "show",
                onChange: (v) => (v === "hide" ? onHide() : onShow()),
                disabled: busy,
              }),
              h("div", { style: { flex: 1 } }),
              h("button", { onClick: onReset, disabled: busy || (!slot.image && !slot.hidden && slot.scale === 100), style: ghostButton }, "恢复默认"),
            ),
            h(SizeRow, { value: slot.scale ?? 100, onChange: onScale, disabled: busy || locked || !slot.image }),
            h(
              "div",
              { style: { display: "flex", gap: 6 } },
              h("button", { onClick: pickFile, disabled: busy || locked, style: buttonStyle }, "选择图片…"),
              h("input", {
                ref: pathInputRef,
                placeholder: "本机图片绝对路径",
                disabled: busy || locked,
                style: textInputStyle,
                onKeyDown: (e) => {
                  if (e.key === "Enter") importFromPath();
                },
              }),
              h("button", { onClick: importFromPath, disabled: busy || locked, style: buttonStyle }, "导入"),
            ),
          ),
        ),
        hint ? h("div", { style: { fontSize: 11, opacity: 0.45 } }, hint) : null,
        h("input", {
          ref: fileInputRef,
          type: "file",
          accept: "image/png,image/svg+xml,image/webp,image/jpeg,image/gif,image/x-icon",
          style: { display: "none" },
          onChange: onFileChosen,
        }),
      );
    }

    // One wordmark half: mode segmented + text row + image row + size row.
    function PartEditor({ title, part, onPatch, onScale, busy, onFile }) {
      const fileInputRef = useRef(null);
      const pickFile = useCallback(() => fileInputRef.current?.click(), []);
      const onFileChosen = useCallback(
        (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        },
        [onFile],
      );
      const hasText = Boolean((part.text || "").trim());
      const showTextRow = part.mode === "custom";
      const showImageRow = part.mode === "image";
      const showSizeRow = part.mode === "custom" || part.mode === "image";

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", borderRadius: 10, ...borderStyle } },
        h(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
          h("div", { style: { fontSize: 12, fontWeight: 600, opacity: 0.85 } }, title),
          h(Segmented, {
            options: [
              { value: "official", label: "官方" },
              { value: "hidden", label: "隐藏" },
              { value: "custom", label: "文字", disabled: !hasText },
              { value: "image", label: "图片", disabled: !part.image },
            ],
            value: part.mode,
            onChange: (v) => onPatch({ mode: v }),
            disabled: busy,
          }),
        ),
        h(
          "div",
          { style: { display: "flex", gap: 6 } },
          h("input", {
            value: part.text,
            placeholder: "输入替换文字",
            onChange: (e) => onPatch({ text: e.target.value }),
            style: textInputStyle,
            onKeyDown: (e) => {
              if (e.key === "Enter" && (part.text || "").trim()) onPatch({ mode: "custom" });
            },
          }),
          h("button", { onClick: () => onPatch({ mode: "custom" }), disabled: busy || !hasText, style: buttonStyle }, "应用"),
        ),
        showImageRow
          ? h(
              "div",
              { style: { display: "flex", gap: 6, alignItems: "center" } },
              part.image ? h("img", { src: part.image.dataUrl, alt: "", style: { height: 22, maxWidth: 96, objectFit: "contain", borderRadius: 6, padding: 2, ...borderStyle } }) : null,
              h("button", { onClick: pickFile, disabled: busy, style: buttonStyle }, "选择图片…"),
              h("button", { onClick: () => onPatch({ image: null, mode: "official" }), disabled: busy || !part.image, style: ghostButton }, "清除图片"),
            )
          : null,
        showSizeRow ? h(SizeRow, { value: part.scale ?? 100, onChange: onScale, disabled: busy || (part.mode === "image" && !part.image) }) : null,
        h("input", {
          ref: fileInputRef,
          type: "file",
          accept: "image/png,image/svg+xml,image/webp,image/jpeg,image/gif,image/x-icon",
          style: { display: "none" },
          onChange: onFileChosen,
        }),
      );
    }

    function LogoSwapSection() {
      const entry = useLogoState();
      const [busy, setBusy] = useState(false);
      const [message, setMessage] = useState(null);
      const [headlineDraft, setHeadlineDraft] = useState("");

      const setField = useCallback((field, value, okText) => {
        const base = current ?? defaults();
        setCurrent({ ...base, [field]: value });
        if (okText) setMessage({ kind: "ok", text: okText });
      }, []);

      const setSlot = useCallback((field, patch, okText) => {
        const base = current ?? defaults();
        const prev = base[field] ?? { image: null, hidden: false, scale: 100 };
        setCurrent({ ...base, [field]: { ...prev, ...patch } });
        if (okText) setMessage({ kind: "ok", text: okText });
      }, []);

      const setPart = useCallback((which, patch, okText) => {
        const base = current ?? defaults();
        const wm = base.wordmark ?? { ds: normalizePart(null), hs: normalizePart(null) };
        const prev = wm[which] ?? { mode: "official", text: "", image: null, scale: 100 };
        const next = {
          mode: patch.mode ?? prev.mode,
          text: patch.text !== undefined ? patch.text : prev.text,
          image: patch.image !== undefined ? patch.image : prev.image,
          scale: patch.scale !== undefined ? patch.scale : prev.scale,
        };
        // switching to a mode with no backing content falls back to official
        if (next.mode === "custom" && !next.text.trim()) next.mode = "official";
        if (next.mode === "image" && !next.image) next.mode = "official";
        setCurrent({ ...base, wordmark: { ...wm, [which]: next } });
        if (okText) setMessage({ kind: "ok", text: okText });
      }, []);

      const makeFileHandler = useCallback(
        (apply) => async (file) => {
          if (file.size > 4 * 1024 * 1024) {
            setMessage({ kind: "error", text: "图片超过 4 MiB，请换一张小一点的" });
            return;
          }
          setBusy(true);
          try {
            const dataUrl = await readFileDataUrl(file);
            apply({ dataUrl, name: file.name, at: Date.now() });
            setMessage({ kind: "ok", text: "已应用" });
          } catch (err) {
            setMessage({ kind: "error", text: String(err?.message ?? err) });
          } finally {
            setBusy(false);
          }
        },
        [],
      );

      const makePathHandler = useCallback(
        (apply) => async (path) => {
          setBusy(true);
          setMessage(null);
          try {
            const { dataUrl } = await rpcReadFile(path);
            apply({ dataUrl, name: path, at: Date.now() });
            setMessage({ kind: "ok", text: "已应用" });
          } catch (err) {
            setMessage({ kind: "error", text: String(err?.message ?? err) });
          } finally {
            setBusy(false);
          }
        },
        [],
      );

      const makePartFileHandler = useCallback(
        (which) => async (file) => {
          if (file.size > 4 * 1024 * 1024) {
            setMessage({ kind: "error", text: "图片超过 4 MiB，请换一张小一点的" });
            return;
          }
          setBusy(true);
          try {
            const dataUrl = await readFileDataUrl(file);
            setPart(which, { mode: "image", image: { dataUrl, name: file.name, at: Date.now() } }, "已替换为图片");
          } catch (err) {
            setMessage({ kind: "error", text: String(err?.message ?? err) });
          } finally {
            setBusy(false);
          }
        },
        [setPart],
      );

      function readFileDataUrl(file) {
        return new Promise((resolve2, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve2(String(reader.result));
          reader.onerror = () => reject(new Error("读取文件失败"));
          reader.readAsDataURL(file);
        });
      }

      const applyHeadlineDraft = useCallback(() => {
        const text = headlineDraft.trim();
        if (!text) {
          setMessage({ kind: "error", text: "请先输入新的标语文字" });
          return;
        }
        if (text === DEFAULT_HEADLINE) {
          setMessage({ kind: "error", text: "这就是默认标语，换一句吧" });
          return;
        }
        setField("headline", text, "标语已替换");
      }, [headlineDraft, setField]);

      const resetHeadline = useCallback(() => {
        setField("headline", null, "已恢复默认标语");
        setHeadlineDraft("");
      }, [setField]);

      const wm = entry?.wordmark ?? { ds: normalizePart(null), hs: normalizePart(null) };
      const dsPart = wm.ds ?? { mode: "official", text: "", image: null, scale: 100 };
      const hsPart = wm.hs ?? { mode: "official", text: "", image: null, scale: 100 };
      const sideSlot = entry?.sidebar ?? { image: null, hidden: false, scale: 100 };
      const heroSlot = entry?.hero ?? { image: null, hidden: false, scale: 100 };

      const markBadge = (slot) => (slot.hidden ? "已隐藏" : slot.image ? "已自定义" : "官方");
      const wmBadge = dsPart.mode === "official" && hsPart.mode === "official" ? "官方" : "自定义中";
      const sideBadge =
        sideSlot.hidden && wmBadge === "官方"
          ? "已隐藏"
          : wmBadge !== "官方" || sideSlot.image || sideSlot.hidden
            ? "自定义中"
            : "官方";
      const heroBadge =
        heroSlot.image || heroSlot.hidden || entry?.headline || entry?.previewBadgeHidden ? "自定义中" : "官方";

      return h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 14, maxWidth: 640 } },
        h(GroupCard, {
          key: "side",
          title: "侧栏自定义",
          badge: sideBadge,
        }, [
          h(SubCard, {
            key: "mark",
            title: "Logo（左上角/侧栏）",
            badge: markBadge(sideSlot),
          }, [
            h(MarkSlotBody, {
              key: "body",
              slot: sideSlot,
              busy,
              hint: "同时用作标签页图标与品牌行小鱼（不随大小缩放）",
              onShow: () => setSlot("sidebar", { hidden: false }, "已显示"),
              onHide: () => setSlot("sidebar", { hidden: true }, "已隐藏"),
              onScale: (v) => setSlot("sidebar", { scale: v }),
              onFile: makeFileHandler((payload) => setSlot("sidebar", { image: payload, hidden: false })),
              onPath: makePathHandler((payload) => setSlot("sidebar", { image: payload, hidden: false })),
              onReset: () => setSlot("sidebar", { image: null, hidden: false, scale: 100 }, "已恢复默认"),
            }),
          ]),
          h(SubCard, {
            key: "wordmark",
            title: "字标（DeepSeek + Harness）",
            badge: wmBadge,
          }, [
            h(PartEditor, {
              key: "ds",
              title: "DeepSeek",
              part: dsPart,
              onPatch: (patch, okText) => setPart("ds", patch, okText),
              onScale: (v) => setPart("ds", { scale: v }),
              busy,
              onFile: makePartFileHandler("ds"),
            }),
            h(PartEditor, {
              key: "hs",
              title: "Harness",
              part: hsPart,
              onPatch: (patch, okText) => setPart("hs", patch, okText),
              onScale: (v) => setPart("hs", { scale: v }),
              busy,
              onFile: makePartFileHandler("hs"),
            }),
          ]),
        ]),
        h(GroupCard, {
          key: "hero",
          title: "对话页自定义",
          badge: heroBadge,
        }, [
          h(SubCard, {
            key: "mark",
            title: "Logo（新对话首页）",
            badge: markBadge(heroSlot),
          }, [
            h(MarkSlotBody, {
              key: "body",
              slot: heroSlot,
              busy,
              hint: null,
              onShow: () => setSlot("hero", { hidden: false }, "已显示"),
              onHide: () => setSlot("hero", { hidden: true }, "已隐藏"),
              onScale: (v) => setSlot("hero", { scale: v }),
              onFile: makeFileHandler((payload) => setSlot("hero", { image: payload, hidden: false })),
              onPath: makePathHandler((payload) => setSlot("hero", { image: payload, hidden: false })),
              onReset: () => setSlot("hero", { image: null, hidden: false, scale: 100 }, "已恢复默认"),
            }),
          ]),
          h(SubCard, {
            key: "heroText",
            title: "欢迎语标语",
            badge: entry?.headline ? "已自定义" : "默认",
          }, [
            h(
              "div",
              { key: "row", style: { display: "flex", gap: 6 } },
              h("input", {
                value: headlineDraft,
                placeholder: DEFAULT_HEADLINE,
                onChange: (e) => setHeadlineDraft(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") applyHeadlineDraft();
                },
                style: textInputStyle,
              }),
              h("button", { onClick: applyHeadlineDraft, disabled: busy, style: buttonStyle }, "应用"),
              h("button", { onClick: resetHeadline, disabled: busy || !entry?.headline, style: ghostButton }, "恢复默认"),
            ),
          ]),
          h(SubCard, {
            key: "badge",
            title: "预览版徽章",
            badge: entry?.previewBadgeHidden ? "已隐藏" : "显示中",
          }, [
            h(Segmented, {
              key: "seg",
              options: [
                { value: "show", label: "显示" },
                { value: "hide", label: "隐藏" },
              ],
              value: entry?.previewBadgeHidden ? "hide" : "show",
              onChange: (v) => setField("previewBadgeHidden", v === "hide", v === "hide" ? "已隐藏" : "已显示"),
              disabled: busy,
            }),
          ]),
        ]),
        message
          ? h(
              "div",
              {
                key: "msg",
                style: {
                  fontSize: 12,
                  color:
                    message.kind === "error"
                      ? "var(--dsw-alias-state-error-primary, #e5484d)"
                      : "var(--dsw-alias-state-success-primary, #30a46c)",
                },
              },
              message.text,
            )
          : null,
        h(
          "p",
          { key: "foot", style: { margin: 0, fontSize: 11, opacity: 0.45 } },
          "设置保存在本浏览器 localStorage；停用插件即全部恢复默认。",
        ),
      );
    }

    // ── registration lifecycle ───────────────────────────────────────────
    // Each declared slot gets its own inject fiber (declaration-gated):
    // inside, we register at priority -1 only while that field is active.
    // The fiber's returned cleanup runs on plugin disable — official restore
    // path (the shipped priority-0 mark / fish fallback resumes).
    return {
      inject: ["slots", "connection"],
      apply(ctx) {
        connectionRef = ctx.get("connection");

        // Settings panel (always present; harmless without customizations).
        ctx.slots.inject("settings.section", () =>
          ctx.slots.register(
            { name: "settings.section", id: "logo-swap", order: 15, label: () => "Logo 自定义" },
            LogoSwapSection,
          ),
        );

        // Per-slot mark fibers — inject the REAL declared slot keys.
        const markFiber = (slotName, pickField) => () => {
          let dispose = null;
          const sync = (store) => {
            const slot = store?.[pickField];
            const active = Boolean(slot && (slot.image || slot.hidden));
            if (active && !dispose) {
              try {
                dispose = ctx.slots.register({ name: slotName, priority: -1 }, pickField === "hero" ? HeroMark : SidebarMark);
              } catch {
                dispose = null;
              }
            } else if (!active && dispose) {
              try {
                dispose();
              } catch {}
              dispose = null;
            }
          };
          listeners.add(sync);
          sync(current);
          return () => {
            listeners.delete(sync);
            if (dispose) {
              try {
                dispose();
              } catch {}
              dispose = null;
            }
          };
        };
        ctx.slots.inject("sidebar.brand.mark", markFiber("sidebar.brand.mark", "sidebar"));
        ctx.slots.inject("conversation.hero.brand.mark", markFiber("conversation.hero.brand.mark", "hero"));

        // Wordmark fiber — shadow "sidebar.brand.name" only while at least
        // one half is non-official; official artwork resumes on dispose.
        ctx.slots.inject("sidebar.brand.name", () => {
          let dispose = null;
          const sync = (store) => {
            const wm = store?.wordmark;
            const active = Boolean(wm && ((wm.ds && wm.ds.mode !== "official") || (wm.hs && wm.hs.mode !== "official")));
            if (active && !dispose) {
              try {
                dispose = ctx.slots.register({ name: "sidebar.brand.name", priority: -1 }, WordmarkCustom);
              } catch {
                dispose = null;
              }
            } else if (!active && dispose) {
              try {
                dispose();
              } catch {}
              dispose = null;
            }
          };
          listeners.add(sync);
          sync(current);
          return () => {
            listeners.delete(sync);
            if (dispose) {
              try {
                dispose();
              } catch {}
              dispose = null;
            }
          };
        });

        // Identity (favicon + brand-fish CSS + preview badge) + headline
        // observer lifecycle.
        ctx.effect(() => {
          applyIdentity(current);
          applyHeadline(current);
          if (current?.sidebar?.scale && current.sidebar.scale > 100) ensureFlexObserver();
          scheduleFlexRelease();
          return () => {
            if (flexTimer) {
              window.clearTimeout(flexTimer);
              flexTimer = 0;
            }
            if (flexObserver) {
              flexObserver.disconnect();
              flexObserver = null;
            }
            const flexTag = document.getElementById(FLEX_STYLE_ID);
            if (flexTag) flexTag.remove();
            if (headlineTimer) {
              window.clearTimeout(headlineTimer);
              headlineTimer = 0;
            }
            if (headlineObserver) {
              headlineObserver.disconnect();
              headlineObserver = null;
            }
            if (lastHeadlineCustom) replaceHeadlineText(null);
            lastHeadlineCustom = null;
            ensureFavicon(null);
            ensureStyle(null);
          };
        }, "logo-swap: identity & headline");
      },
    };
  },
});
