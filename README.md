# miniegg-plus-device
MiniEgg is Comcomm's own NFT that can be hatched into other NFTs. MiniEgg+ is a project that interacts with the Blockchain to allow this Miniegg NFT to grow through games. MiniEgg+ is currently a [RP2040 (Raspberry Pi Pico)](https://www.raspberrypi.com/products/raspberry-pi-pico/), but you can upgrade the spec if you'd like.

## Prerequisite
- Node version: v14.17.6+
- NPM version: v6.14.15+
- MiniEgg+ version: v1.1.0
- Kaluma version: [v1.0.0-beta.13](https://github.com/kaluma-project/kaluma/releases/tag/1.0.0-beta.13)

## Installation

1. Clone this repository and then go into the folder.
```bash
git clone git@github.com:ainft-team/miniegg-plus-device.git
cd miniegg-plus-device
```
2. Install dependencies.
```bash
yarn
```

## Usage
### Build
- Development mode
```
npm run build:dev
```
- Production mode
```
npm run build
```

The default build target file is 'src/index.js'. If you want to build other file,
```
FILE_PATH=<file_path> npm run build
```

### Upload scripts
```
sh scripts/upload.sh {local|dev|prod} [<filePath>]
```

### Reset / set Wi-Fi
1. Connect a MiniEgg+ device to your computer
2. Run the wifi resetting script. Note that if you set testSSID and testPWD in `src/settings/reset-wifi.js` to the actual wi-fi you want to use, it will connect to it after the uploads. If you set them to dummy values, it will not be able to connect to a wi-fi and take you to the wi-fi setting screen.
```
sh scripts/upload.sh prod src/settings/reset-wifi.js
```
3. Run the device setting script
```
sh scripts/upload.sh prod
```
