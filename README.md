# YouTube Transcript Copy

Its like glasp but with no limit


## Features

- One-click transcript copy with custom prompt
- Works with Enhancer for YouTube extension

## Installation

1. Install [Enhancer for YouTube](https://www.mrfdev.com/enhancer-for-youtube) extension
2. Open Enhancer for YouTube settings
3. Navigate to **Custom Script** section
4. Copy the entire contents of `yt-transcript-enhancer-minimal.js`
5. Paste into the Custom Script editor
6. Save and reload YouTube

## Usage

1. Navigate to any YouTube video with captions/transcript
2. Click the **📋 Copy Transcript** button in the top bar
3. Script automatically:
   - Expands video description
   - Opens transcript panel
   - Scrolls to load all segments
   - Copies transcript with your custom prompt

## Configuration

Edit the `CONFIG` object in the script:

```javascript
const CONFIG = {
  PROMPT_TEXT: `Your custom prompt here`,
  INCLUDE_TIMESTAMPS: false,  // Set true to include timestamps
  BTN_TEXT: "📋 Copy Transcript"
};
```

## Files

- `yt-transcript-enhancer-minimal.js` - Minimal production version (263 lines)
- `yt-transcript-enhancer-custom.js` - Full version with debug mode (608 lines)

## Browser Compatibility

- ✅ Chrome/Brave + Enhancer for YouTube
- ✅ Firefox + Enhancer for YouTube
- ✅ Edge + Enhancer for YouTube

## License

MIT
