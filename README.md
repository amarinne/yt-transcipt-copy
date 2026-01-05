# YouTube Transcript Copy

Its like glasp but with no limit


## Features

- One-click transcript copy with custom prompt

## Installation

### Option A: Enhancer for YouTube

1. Install [Enhancer for YouTube](https://www.mrfdev.com/enhancer-for-youtube) extension
2. Open Enhancer for YouTube settings
3. Navigate to **Custom Script** section
4. Copy the entire contents of [yt-transcript-enhancer-minimal.js](https://github.com/amarinne/yt-transcipt-copy/blob/main/yt-transcript-enhancer-minimal.js)
5. Paste into the Custom Script editor
6. Save and reload YouTube

### Option B: User Script

1. Install [Tampermonkey](https://www.tampermonkey.net/) extension (I have not tested on Greasemonkey or Violentmonkey)
2. Click the Tampermonkey icon → **Create a new script**
3. Copy the entire contents of [yt-transcript-tampermonkey.user.js](https://github.com/amarinne/yt-transcipt-copy/blob/main/yt-transcript-tampermonkey.user.js)
4. Paste into the editor (replace all existing content)
5. Save (Ctrl+S or Cmd+S)
6. Reload YouTube

## Usage

1. Navigate to any YouTube video with captions/transcript
2. Click the **Copy Transcript** button in the top bar
3. Script automatically:
   - Expands video description
   - Opens transcript panel
   - Scrolls to load all segments
   - Copies transcript with your custom prompt
4. Paste into AI chatbot of your choice


## Configuration

Edit the `CONFIG` object in the script:

```javascript
const CONFIG = {
  PROMPT_TEXT: `Your custom prompt here`,
  INCLUDE_TIMESTAMPS: false,  // Set true to include timestamps
  BTN_TEXT: "📋 Copy Transcript"
};
```

## License

MIT
