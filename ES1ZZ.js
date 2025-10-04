const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const tuya = require('zigbee-herdsman-converters/lib/tuya');
const utils = require('zigbee-herdsman-converters/lib/utils');

const e = exposes.presets;
const ea = exposes.access;

// State storage for each device
const deviceStates = {};

const tzLocal = {
    TS0225: {
        key: ['motion_detection_distance', 'motion_detection_sensitivity', 'static_detection_sensitivity', 'led_indicator'],
        convertSet: async (entity, key, value, meta) => {
            switch (key) {
                case 'motion_detection_distance':
                    utils.assertNumber(value, 'motion_detection_distance');
                    await entity.write('manuSpecificTuya2', {57355: {value, type: 0x21}});
                    break;
                case 'motion_detection_sensitivity':
                    utils.assertNumber(value, 'motion_detection_sensitivity');
                    await entity.write('manuSpecificTuya2', {57348: {value, type: 0x20}});
                    break;
                case 'static_detection_sensitivity':
                    utils.assertNumber(value, 'static_detection_sensitivity');
                    await entity.write('manuSpecificTuya2', {57349: {value, type: 0x20}});
                    break;
                case 'led_indicator':
                    await entity.write('manuSpecificTuya2', {57353: {value: value ? 0x01 : 0x00, type: 0x10}});
                    break;
            }
        },
    },
};

const fzLocal = {
    TS0225_illuminance: {
        cluster: 'msIlluminanceMeasurement',
        type: 'raw',
        convert: (model, msg, publish, options, meta) => {
            const buffer = msg.data;
            const measuredValue = Number(buffer[7]) * 256 + Number(buffer[6]);
            return {illuminance: measuredValue === 0 ? 0 : Math.round(10 ** ((measuredValue - 1) / 10000))};
        },
    },
    
    // Custom converter with logic: distance = 0 when no presence detected
    TS0225_custom: {
        cluster: 'manuSpecificTuya2',
        type: ['attributeReport'],
        convert: (model, msg, publish, options, meta) => {
            const deviceId = msg.device.ieeeAddr;
            
            // Initialize state if not exists
            if (!deviceStates[deviceId]) {
                deviceStates[deviceId] = {
                    occupancy: false,
                    rawDistance: 0
                };
            }
            
            const state = deviceStates[deviceId];
            const result = {};
            
            // Store raw distance if updated
            if (msg.data['57354'] !== undefined) {
                state.rawDistance = msg.data['57354'];
            }
            
            // MAIN LOGIC: Set target_distance based on occupancy state
            // If presence detected, use raw distance; otherwise set to 0
            if (state.occupancy) {
                result.target_distance = state.rawDistance;
            } else {
                result.target_distance = 0;
            }
            
            // Process other attributes
            if (msg.data['57355'] !== undefined) {
                result.motion_detection_distance = msg.data['57355'];
            }
            if (msg.data['57348'] !== undefined) {
                result.motion_detection_sensitivity = msg.data['57348'];
            }
            if (msg.data['57349'] !== undefined) {
                result.static_detection_sensitivity = msg.data['57349'];
            }
            if (msg.data['57345'] !== undefined) {
                result.presence_keep_time = msg.data['57345'];
            }
            if (msg.data['57353'] !== undefined) {
                result.led_indicator = msg.data['57353'] === 1;
            }
            
            return result;
        },
    },
    
    // Override occupancy to store state and publish distance = 0 when no presence
    ias_occupancy_custom: {
        cluster: 'ssIasZone',
        type: 'commandStatusChangeNotification',
        convert: (model, msg, publish, options, meta) => {
            const deviceId = msg.device.ieeeAddr;
            
            // Initialize state if not exists
            if (!deviceStates[deviceId]) {
                deviceStates[deviceId] = {
                    occupancy: false,
                    rawDistance: 0
                };
            }
            
            const zoneStatus = msg.data.zonestatus;
            const occupancy = (zoneStatus & 1) > 0;
            
            // Update occupancy state
            deviceStates[deviceId].occupancy = occupancy;
            
            const result = {occupancy: occupancy};
            
            // KEY LOGIC: When occupancy = false, set distance to 0
            if (!occupancy) {
                result.target_distance = 0;
            } else {
                // When occupancy = true, use last known raw distance
                result.target_distance = deviceStates[deviceId].rawDistance;
            }
            
            return result;
        },
    },
};

const definition = {
    fingerprint: tuya.fingerprint('TS0225', ['_TZ3218_awarhusb', '_TZ3218_t9ynfz4x']),
    model: 'ES1ZZ(TY)',
    vendor: 'Linptech',
    description: 'mmWave Presence sensor (Custom distance = 0 when no presence)',
    
    // Use custom converters
    fromZigbee: [
        fzLocal.ias_occupancy_custom,  // Custom occupancy with distance reset logic
        fzLocal.TS0225_custom,         // Custom attributes with distance logic
        fzLocal.TS0225_illuminance,
        tuya.fz.datapoints
    ],
    
    toZigbee: [tzLocal.TS0225, tuya.tz.datapoints],
    
    configure: tuya.configureMagicPacket,
    
    exposes: [
        e.occupancy().withDescription('Presence state'),
        e.illuminance().withUnit('lx'),
        e.numeric('target_distance', ea.STATE).withDescription('Distance to target (0 when no presence)').withUnit('cm'),
        e.numeric('motion_detection_distance', ea.STATE_SET)
            .withValueMin(0).withValueMax(600).withValueStep(75)
            .withDescription('Motion detection distance').withUnit('cm'),
        e.numeric('presence_keep_time', ea.STATE).withDescription('Presence keep time').withUnit('min'),
        e.numeric('motion_detection_sensitivity', ea.STATE_SET)
            .withValueMin(0).withValueMax(5).withValueStep(1)
            .withDescription('Motion detection sensitivity'),
        e.numeric('static_detection_sensitivity', ea.STATE_SET)
            .withValueMin(0).withValueMax(5).withValueStep(1)
            .withDescription('Static detection sensitivity'),
        e.numeric('fading_time', ea.STATE_SET)
            .withValueMin(0).withValueMax(10000).withValueStep(1)
            .withUnit('s').withDescription('Time after which the device will check again for presence'),
        e.binary('led_indicator', ea.STATE_SET, true, false).withDescription('LED Presence Indicator'),
    ],
    
    meta: {
        tuyaDatapoints: [[101, 'fading_time', tuya.valueConverter.raw]],
    },
};

module.exports = definition;