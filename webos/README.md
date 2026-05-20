# CineStream — LG webOS Package

## Prerequisites
Install the webOS CLI (ares tools):
```
npm install -g @webosose/ares-cli
```

## Icon files required (place in this folder)
| File | Size | Notes |
|---|---|---|
| icon-80.png | 80×80 px | App icon (home screen) |
| icon-130.png | 130×130 px | Large icon (app info) |
| splash.png | 1920×1080 px | Splash / background image |

Design specs: dark background (#0b0d17), orange CineStream logo centred.

## Build the .ipk package
```
cd webos
ares-package . -o ../dist
```
This produces `dist/app.cinestream.tv_1.0.0_all.ipk`.

## Test on a developer TV
1. Enable Developer Mode on your LG TV (Settings → General → About → Developer Mode)
2. Note the TV's IP address
3. Connect:
```
ares-setup-device --add myTV --info "{'host':'<TV_IP>','port':9922,'username':'prisoner'}"
ares-novacom --device myTV --getkey
```
4. Install:
```
ares-install --device myTV ../dist/app.cinestream.tv_1.0.0_all.ipk
```
5. Launch:
```
ares-launch --device myTV app.cinestream.tv
```

## Submit to LG Content Store
1. Create account at: https://seller.lgappstv.com
2. Upload the .ipk file
3. Fill in store listing (screenshots at 1920×1080)
4. Submit for review (~2–4 weeks)

## TV Mode
The app detects webOS automatically via user-agent and activates TV mode.
You can also force TV mode for testing in any browser by adding `?tv=1` to the URL:
https://cinestream-app-lake.vercel.app/?tv=1
