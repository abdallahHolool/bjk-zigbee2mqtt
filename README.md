# Zigbee2MQTT - Linptech ES1ZZ Custom Converter

Custom external converter for Linptech ES1ZZ(TY) mmWave Presence Sensor with LD2410.

## What It Does

Modifies the default behavior of the LD2410 sensor where `target_distance` retains its last value even when presence is no longer detected.

**Modified Behavior:**
- ✅ `occupancy: true` → `target_distance` shows actual distance
- ✅ `occupancy: false` → `target_distance` automatically resets to **0**

This makes the distance reading more intuitive and cleaner for automations and dashboards.

## Installation

1. Download `linptech_es1zz.js`
2. Place the file in your Zigbee2MQTT `data/external_converters/` folder
   - Example: `/config/zigbee2mqtt/data/external_converters/linptech_es1zz.js`
3. Restart Zigbee2MQTT
4. The converter will be loaded automatically
5. (Optional) Re-interview the device for best results

## Requirements

- Zigbee2MQTT 1.30.0+
- Linptech ES1ZZ(TY) with manufacturer code: `_TZ3218_awarhusb` or `_TZ3218_t9ynfz4x`

## Verification

After restart, check the Zigbee2MQTT logs or MQTT topic `zigbee2mqtt/bridge/converters` to confirm the converter is loaded.

## License

MIT
