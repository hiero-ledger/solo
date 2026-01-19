# metrics-plotter

Web-based tool to plot CPU, memory and transactions-per-second from JSON performance snapshots.

Prerequisites
- Node.js 22+ and npm

Setup

```
npm install
npm run build
npm start
```

Usage
- Open the app in your browser (default: http://localhost:8123).
- Use the "Choose JSON file" button to load your own file.
- Use the "Show grouped data" toggle to switch between grouped and ungrouped pod metrics.
- To load a data file automatically, copy the file to the `data/` folder and pass the filename without the `.json` extension as a URL parameter, e.g. `http://localhost:8123?file=your-data-file`.
- To hide the UI controls and show only the charts, add `&hide-controls=true` to the URL.
- To combine the pod data of network, mirror, block and relay nodes into a single chart item pass the parameter `&grouped=true` to the URL.
- To take a screenshot of the charts use the `screenshot` script. It uses `puppeteer` to load the app in a headless browser and save a screenshot as `screenshot.png`:

```
SCREENSHOT_WIDTH=1920 npm run screenshot -- http://127.0.0.1:8123\?hide-controls=true\&grouped=false\&data=timeline [output file name]
```