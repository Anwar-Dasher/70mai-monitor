# 70mai Overnight Monitor (classic build)

Live app: https://anwar-dasher.github.io/70mai-monitor/

Bench QA: one 4K USB webcam watches 30-40 70mai dashcams overnight, reads QR serials via the camera, detects screen faults with photo/video evidence, produces a morning report.

- `react/` — the React build the bench uses (https://anwar-dasher.github.io/70mai-monitor/react/). Its `index.html` carries the Lark alert sidecar (`?larkkey=`) and the Google Drive link sidecar (`?gdrive=`).
- `apps-script/` — the Google Apps Script that turns `night / serial` into a Drive folder link, with its setup page: https://anwar-dasher.github.io/70mai-monitor/apps-script/

