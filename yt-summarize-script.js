// ==UserScript==
// @name         YT Transcript 1-Click Copy (Prompt + Transcript) — Masthead Button
// @namespace    dxf
// @version      0.4.1
// @description  Adds a button next to the YouTube top-left logo to copy [prompt]\n\n[transcript] to clipboard (Tampermonkey/Greasemonkey; Brave compatible).
// @match        https://www.youtube.com/watch*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  // ====== CONFIG ======
  const PROMPT_TEXT = `[Summarize the following youtube script in paragraphs, each containting bullet points. give bullet points tldr at the beginning. also give the speakers sentiment throughout the script.]`;          // replace with your real prompt block
  const INCLUDE_TIMESTAMPS = false;
  const DEBUG_MODE = true;                  // set to false to disable console logging
  const DEEP_DEBUG = true;                  // enable detailed DOM inspection and timing

  const BTN_ID = "dxf-yt-copy-transcript-btn";

  const UI_WAIT_MS = 8000;                  // increased for slower interactions
  const SCROLL_MAX_LOOPS = 80;
  const SCROLL_IDLE_ROUNDS_TO_STOP = 5;
  const MAX_RETRY_ATTEMPTS = 4;             // retry attempts for opening transcript
  const INITIAL_DELAY = 2000;               // wait for Enhancer and page to settle

  // ====== UTILS ======
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const startTime = Date.now();

  function log(...args) {
    if (DEBUG_MODE) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[YT-Transcript +${elapsed}s]`, ...args);
    }
  }

  function debugDOM(label, selector) {
    if (!DEEP_DEBUG) return;
    const elements = document.querySelectorAll(selector);
    log(`🔍 ${label}:`, {
      selector,
      found: elements.length,
      elements: Array.from(elements).slice(0, 3).map(el => ({
        tag: el.tagName,
        id: el.id,
        classes: el.className,
        text: el.textContent?.trim().substring(0, 50)
      }))
    });
  }

  function detectEnvironment() {
    const env = {
      userAgent: navigator.userAgent,
      isBrave: navigator.brave !== undefined,
      hasEnhancer: !!document.querySelector('[class*="enhancer"],[id*="enhancer"]'),
      hasTampermonkey: typeof GM_info !== 'undefined',
      gmInfo: typeof GM_info !== 'undefined' ? {
        script: GM_info.script.name,
        version: GM_info.script.version,
        handler: GM_info.scriptHandler
      } : null,
      ytdApp: !!document.querySelector('ytd-app'),
      pageType: location.pathname
    };
    log('🌍 Environment:', env);
    return env;
  }

  function clean(s) {
    return (s || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim();
  }

  function isWatchPage() {
    return location.pathname === "/watch";
  }

  function setBtn(btn, text, disabled) {
    btn.textContent = text;
    btn.disabled = !!disabled;
    btn.style.opacity = disabled ? "0.7" : "1";
  }

  async function writeClipboard(text) {
    if (typeof GM_setClipboard === "function") {
      GM_setClipboard(text, "text");
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("Clipboard copy failed");
  }

  // ====== BUTTON INJECTION (MASTHEAD) ======
  function removeButton() {
    const old = document.getElementById(BTN_ID);
    if (old) old.remove();
  }

  function findMastheadStart() {
    // YouTube top bar: #masthead-container > #masthead > #start
    // #start contains the hamburger + logo area.
    return (
      document.querySelector("#masthead #start") ||
      document.querySelector("ytd-masthead #start") ||
      document.querySelector("#masthead-container #start") ||
      null
    );
  }

  function injectButtonIfNeeded() {
    if (!isWatchPage()) {
      removeButton();
      return;
    }
    if (document.getElementById(BTN_ID)) return;

    // Debug masthead structure
    if (DEEP_DEBUG) {
      debugDOM('Masthead search', '#masthead, ytd-masthead, #masthead-container');
      debugDOM('Start area', '#masthead #start, ytd-masthead #start');
    }

    const mount = findMastheadStart();
    if (!mount) {
      log("⚠️ Masthead mount point not found, will retry");
      return; // try again via SPA watcher
    }
    
    log("✓ Found masthead mount:", mount.tagName, mount.id);

    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "Copy transcript";
    btn.setAttribute("aria-label", "Copy transcript");
    btn.style.cssText = [
      "margin-left:10px",
      "height:28px",
      "padding:0 10px",
      "border-radius:999px",
      "border:1px solid rgba(0,0,0,0.12)",
      "background:rgba(255,255,255,0.9)",
      "color:rgba(0,0,0,0.85)",
      "font:600 12px/28px system-ui, -apple-system, Segoe UI, Roboto, Arial",
      "cursor:pointer",
      "white-space:nowrap"
    ].join(";");

    // Dark theme compatibility: invert if body indicates dark theme.
    // No dependency on theme APIs; cheap heuristic.
    const isDark = document.documentElement.getAttribute("dark") !== null || document.documentElement.hasAttribute("dark");
    if (isDark) {
      btn.style.background = "rgba(20,20,20,0.9)";
      btn.style.color = "#fff";
      btn.style.border = "1px solid rgba(255,255,255,0.18)";
    }

    btn.addEventListener("click", onClick, { passive: true });

    // Insert after logo/hamburger cluster.
    mount.appendChild(btn);
    
    // Verify injection
    setTimeout(() => {
      const injected = document.getElementById(BTN_ID);
      if (injected) {
        log("✓ Button verified in DOM");
        if (DEEP_DEBUG) {
          log("Button position:", {
            offsetTop: injected.offsetTop,
            offsetLeft: injected.offsetLeft,
            visible: injected.offsetParent !== null,
            parent: injected.parentElement?.tagName
          });
        }
      } else {
        log("❌ Button injection failed - not found in DOM");
      }
    }, 100);
  }

  // Track SPA navigations by URL changes.
  let lastUrl = location.href;
  function startSpaWatcher() {
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(injectButtonIfNeeded, 300);
      } else {
        injectButtonIfNeeded();
      }
    }, 500);
  }

  // ====== TRANSCRIPT EXTRACTION ======
  function findTranscriptContainer() {
    let el = document.querySelector("transcript-segment-view-model, .ytwTranscriptSegmentViewModelHost");
    if (el) return el;

    el = document.querySelector("ytd-transcript-renderer");
    if (el) return el;

    el = document.querySelector("ytd-engagement-panel-section-list-renderer ytd-transcript-renderer");
    if (el) return el;

    el = document.querySelector("ytd-engagement-panel-section-list-renderer");
    if (el && /transcript/i.test(el.textContent || "")) return el;

    el =
      document.querySelector("macro-markers-panel-item-view-model, .ytwMacroMarkersPanelItemViewModelHost") ||
      document.querySelector("[target-id*='transcript']") ||
      document.querySelector("[id*='transcript']") ||
      document.querySelector("[class*='transcript']");
    return el || null;
  }

  function findTranscriptScroller(root) {
    if (!root) return null;

    const candidates = [
      root.querySelector("#body"),
      root.querySelector("#segments-container"),
      root.querySelector("#contents"),
      root.querySelector(".ytSectionListRendererContents"),
      root.querySelector("yt-section-list-renderer"),
      root.querySelector("tp-yt-paper-dialog-scrollable"),
      root.querySelector("div[style*='overflow']"),
      root
    ].filter(Boolean);

    for (const c of candidates) {
      try {
        if (c.scrollHeight && c.clientHeight && c.scrollHeight > c.clientHeight + 20) return c;
      } catch (_) {}
    }
    return root;
  }

  function getTranscriptSegments() {
    const modernSegments = Array.from(document.querySelectorAll("transcript-segment-view-model, .ytwTranscriptSegmentViewModelHost"));
    if (modernSegments.length) return modernSegments;

    const legacySegments = Array.from(document.querySelectorAll("ytd-transcript-segment-renderer"));
    if (legacySegments.length) return legacySegments;

    return [];
  }

  function extractSegments() {
    const segs = getTranscriptSegments();
    if (!segs.length) return [];

    return segs
      .map((seg) => {
        const tsEl =
          seg.querySelector(".ytwTranscriptSegmentViewModelTimestampA11yLabel") ||
          seg.querySelector(".ytwTranscriptSegmentViewModelTimestamp") ||
          seg.querySelector(".segment-timestamp") ||
          seg.querySelector("[class*='timestamp']") ||
          null;

        const txEl =
          seg.querySelector("span[role='text']") ||
          seg.querySelector(".ytAttributedStringHost") ||
          seg.querySelector(".segment-text") ||
          seg.querySelector("[class*='segment-text']") ||
          null;

        const ts = tsEl ? clean(tsEl.textContent) : "";
        let tx = txEl ? clean(txEl.textContent) : clean(seg.textContent);

        if (!tx && seg.children.length) {
          tx = clean(Array.from(seg.children).map((child) => child.textContent).join(" "));
        }

        if (ts && tx.startsWith(ts)) tx = clean(tx.slice(ts.length));
        return { ts, tx };
      })
      .filter((x) => x.tx);
  }

  function buildTranscriptText(includeTimestamps) {
    const segments = extractSegments();
    if (segments.length) {
      return segments
        .map(({ ts, tx }) => (includeTimestamps && ts ? `${ts} ${tx}` : tx))
        .join(' ')
        .trim();
    }

    const container = findTranscriptContainer();
    if (!container) return "";
    const text = clean(container.innerText);
    return text || "";
  }

  async function waitForTranscriptReady(timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const container = findTranscriptContainer();
      if (container) {
        const segs = getTranscriptSegments();
        if (segs && segs.length > 0) return true;
      }
      await sleep(150);
    }
    return false;
  }

  async function scrollTranscriptToEnd() {
    const container = findTranscriptContainer();
    if (!container) return;

    const scroller = findTranscriptScroller(container);
    if (!scroller) return;

    let lastCount = 0;
    let stableRounds = 0;

    for (let i = 0; i < SCROLL_MAX_LOOPS; i++) {
      const segCount = getTranscriptSegments().length;

      if (segCount === lastCount) stableRounds++;
      else stableRounds = 0;

      if (stableRounds >= SCROLL_IDLE_ROUNDS_TO_STOP) break;

      lastCount = segCount;

      try {
        scroller.scrollTop = scroller.scrollHeight;
      } catch (_) {}

      await sleep(200);
    }
  }

  function findClickableByText(regex, scope = document) {
    const nodes = Array.from(
      scope.querySelectorAll("button, tp-yt-paper-item, ytd-menu-service-item-renderer, a, yt-formatted-string")
    );

    for (const n of nodes) {
      if (n.id === BTN_ID) continue;
      const t = (n.textContent || "").trim();
      if (!t) continue;
      if (!regex.test(t)) continue;

      if (n.tagName === "YT-FORMATTED-STRING") {
        const btn = n.closest("button, tp-yt-paper-item, ytd-menu-service-item-renderer, a");
        if (btn) return btn;
      }
      return n;
    }
    return null;
  }

  async function openTranscriptPanel() {
    log("=== openTranscriptPanel called ===");
    log("Current URL:", location.href);
    log("Is watch page:", isWatchPage());

    // Check if transcript is already visible
    const existingSegments = getTranscriptSegments().length;
    if (existingSegments > 0) {
      log("✓ Transcript already visible (", existingSegments, "segments)");
      return true;
    }
    
    const container = findTranscriptContainer();
    if (container) {
      log("✓ Transcript container found:", container.tagName);
      return true;
    }

    // Deep debug: inspect page structure
    if (DEEP_DEBUG) {
      debugDOM('Engagement panels', 'ytd-engagement-panel-section-list-renderer');
      debugDOM('Video metadata area', 'ytd-watch-metadata, #description');
      debugDOM('Action buttons', 'ytd-menu-renderer, ytd-button-renderer');
      
      // Look for any button/element with "transcript" in text
      const allWithTranscript = Array.from(document.querySelectorAll('*'))
        .filter(el => el.textContent?.toLowerCase().includes('transcript'))
        .slice(0, 10);
      log('📝 Elements containing "transcript":', allWithTranscript.map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().substring(0, 100),
        id: el.id,
        classes: el.className
      })));
    }

    // Try to find direct transcript button
    log("🔍 Method 1: Searching for direct transcript button...");
    const directClick = findClickableByText(/show transcript/i);
    if (directClick) {
      log("✓ Found direct transcript button:", {
        tag: directClick.tagName,
        text: directClick.textContent.trim(),
        id: directClick.id,
        aria: directClick.getAttribute('aria-label')
      });
      directClick.click();
      log("Clicked button, waiting 800ms for panel...");
      await sleep(800);
      
      // Verify it opened
      const segments = getTranscriptSegments().length;
      if (segments > 0) {
        log("✅ Transcript opened successfully, found", segments, "segments");
        return true;
      }
      const panelVisible = !!findTranscriptContainer();
      log(panelVisible ? "⏳ Panel opened, segments loading..." : "⚠️ Clicked but panel not visible yet");
      return panelVisible;
    }
    log("❌ Method 1 failed: No direct transcript button found");

    // Try "More actions" menu approach
    log("🔍 Method 2: Trying 'More actions' menu...");
    
    if (DEEP_DEBUG) {
      debugDOM('Menu renderers', 'ytd-menu-renderer');
      debugDOM('Icon buttons', 'yt-icon-button button');
    }
    
    const menuBtn =
      document.querySelector("ytd-watch-metadata ytd-menu-renderer #button[aria-haspopup='true']") ||
      document.querySelector("ytd-watch-metadata ytd-menu-renderer yt-icon-button button[aria-haspopup='true']") ||
      document.querySelector("ytd-watch-metadata ytd-menu-renderer yt-icon-button button") ||
      document.querySelector("ytd-menu-renderer #button[aria-haspopup='true']") ||
      document.querySelector("ytd-menu-renderer yt-icon-button button");

    if (menuBtn) {
      log("✓ Found menu button:", menuBtn.getAttribute('aria-label') || 'unlabeled');
      menuBtn.click();
      log("Menu clicked, waiting 500ms...");
      await sleep(500);

      // Check if menu opened
      const menu = document.querySelector('ytd-menu-popup-renderer, tp-yt-paper-listbox');
      log(menu ? "✓ Menu opened" : "⚠️ Menu not detected");

      const menuItem = findClickableByText(/transcript/i, document);
      if (menuItem) {
        log("✓ Found transcript in menu:", menuItem.textContent.trim());
        menuItem.click();
        await sleep(800);
        return true;
      }
      log("❌ Menu opened but no transcript item found");
      
      // Close menu
      document.body.click();
      await sleep(200);
    } else {
      log("❌ Method 2 failed: No menu button found");
    }

    // Try engagement panel approach
    log("🔍 Method 3: Searching engagement panels...");
    const engagement = findClickableByText(/transcript/i);
    if (engagement) {
      log("✓ Found engagement panel:", {
        tag: engagement.tagName,
        text: engagement.textContent.trim().substring(0, 80)
      });
      engagement.click();
      await sleep(800);
      return true;
    }

    log("❌ All 3 methods failed to open transcript");
    
    if (DEEP_DEBUG) {
      log("💡 Debug suggestions:");
      log("  1. Check if video has captions/transcript available");
      log("  2. Try manually opening transcript to see button location");
      log("  3. Check browser console for Enhancer for YouTube conflicts");
      log("  4. Try disabling Enhancer temporarily to test");
    }
    
    return false;
  }

  async function openTranscriptPanelWithRetry(maxAttempts = MAX_RETRY_ATTEMPTS) {
    log(`Attempting to open transcript (max ${maxAttempts} attempts)`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      log(`Attempt ${attempt}/${maxAttempts}`);
      
      const success = await openTranscriptPanel();
      if (success) {
        log("✓ Transcript panel opened successfully");
        return true;
      }
      
      if (attempt < maxAttempts) {
        log(`Waiting before retry...`);
        await sleep(1000);
      }
    }
    
    log("❌ Failed to open transcript after", maxAttempts, "attempts");
    return false;
  }

  async function getTranscriptText() {
    log("=== getTranscriptText called ===");
    
    // First check if transcript is already visible
    let t = buildTranscriptText(INCLUDE_TIMESTAMPS);
    if (t) {
      log("Transcript already extracted:", t.length, "characters");
      return t;
    }

    // Try to open transcript with retry logic
    const opened = await openTranscriptPanelWithRetry();
    if (!opened) {
      log("Failed to open transcript panel");
      return "";
    }

    // Wait for segments to load
    log("Waiting for transcript segments to load...");
    const ready = await waitForTranscriptReady(UI_WAIT_MS);
    if (!ready) {
      log("Timeout waiting for transcript, trying to extract anyway");
      t = buildTranscriptText(INCLUDE_TIMESTAMPS);
      return t || "";
    }

    log("Transcript loaded, scrolling to load all segments");
    await scrollTranscriptToEnd();

    t = buildTranscriptText(INCLUDE_TIMESTAMPS);
    log("Final transcript extracted:", t.length, "characters");
    return t || "";
  }

  // ====== CLICK HANDLER ======
  async function onClick(e) {
    log("=== Copy transcript button clicked ===");
    const btn = e.currentTarget;
    setBtn(btn, "Working…", true);

    try {
      const transcript = await getTranscriptText();
      
      if (!transcript || !transcript.trim()) {
        log("No transcript text available");
        setBtn(btn, "Transcript unavailable", true);
        await sleep(2000);
        setBtn(btn, "Copy transcript", false);
        return;
      }

      const finalText = `${PROMPT_TEXT}\n\n${transcript}`;
      await writeClipboard(finalText);
      log("✓ Copied to clipboard:", finalText.length, "characters");

      setBtn(btn, "Copied!", true);
      await sleep(1500);
      setBtn(btn, "Copy transcript", false);
    } catch (err) {
      log("❌ Error in onClick:", err);
      setBtn(btn, "Copy failed", true);
      await sleep(2000);
      setBtn(btn, "Copy transcript", false);
    }
  }

  // ====== INIT ======
  log("=".repeat(60));
  log("🚀 YT Transcript Copy Script v0.4.0 Starting...");
  log("=".repeat(60));
  log("Script initialized on:", location.href);
  log("Debug mode:", DEBUG_MODE ? "✓ enabled" : "disabled");
  log("Deep debug:", DEEP_DEBUG ? "✓ enabled" : "disabled");
  
  // Detect environment
  const env = detectEnvironment();
  
  if (env.hasEnhancer) {
    log("⚠️ Enhancer for YouTube detected - may cause conflicts");
  }
  
  if (!env.hasTampermonkey) {
    log("⚠️ Tampermonkey not detected - clipboard may not work");
  }
  
  // Wait for page to settle (important with Enhancer)
  log(`⏳ Waiting ${INITIAL_DELAY}ms for page to settle...`);
  setTimeout(() => {
    log("✓ Initial delay complete, starting button injection");
    injectButtonIfNeeded();
    startSpaWatcher();
    log("✓ SPA watcher started");
    log("=".repeat(60));
    log("✅ Script fully initialized and ready");
    log("💡 Click the 'Copy transcript' button in the top bar to test");
    log("=".repeat(60));
  }, INITIAL_DELAY);
})();
