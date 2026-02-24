const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');

const targets = {
    ASB: {
        start: 2.8,
        peak: 8.7,
        peakIdx: 210, // Around Jan
        end: 6.30
    },
    BRG: {
        start: 37.0,
        low: 28.0,
        lowIdx: 200, // Dec
        end: 32.60
    },
    QBE: {
        start: 20.0,
        low: 18.5,
        lowIdx: 100,
        high: 24.2,
        highIdx: 230,
        end: 21.48
    }
};

function generateSeries(config, length = 252) {
    let series = new Array(length).fill(0);

    if (config.peak) {
        // ASB type: start -> peak -> end
        for (let i = 0; i < config.peakIdx; i++) {
            series[i] = config.start + (config.peak - config.start) * (i / config.peakIdx);
        }
        for (let i = config.peakIdx; i < length; i++) {
            series[i] = config.peak + (config.end - config.peak) * ((i - config.peakIdx) / (length - config.peakIdx));
        }
    } else if (config.lowIdx && !config.highIdx) {
        // BRG type: start -> low -> end
        for (let i = 0; i < config.lowIdx; i++) {
            series[i] = config.start + (config.low - config.start) * (i / config.lowIdx);
        }
        for (let i = config.lowIdx; i < length; i++) {
            series[i] = config.low + (config.end - config.low) * ((i - config.lowIdx) / (length - config.lowIdx));
        }
    } else {
        // QBE type: start -> low -> high -> end
        for (let i = 0; i < config.lowIdx; i++) {
            series[i] = config.start + (config.low - config.start) * (i / config.lowIdx);
        }
        for (let i = config.lowIdx; i < config.highIdx; i++) {
            series[i] = config.low + (config.high - config.low) * ((i - config.lowIdx) / (config.highIdx - config.lowIdx));
        }
        for (let i = config.highIdx; i < length; i++) {
            series[i] = config.high + (config.end - config.high) * ((i - config.highIdx) / (length - config.highIdx));
        }
    }

    // Add some noise
    return series.map(val => {
        const noise = (Math.random() - 0.5) * (val * 0.02);
        return parseFloat((val + noise).toFixed(2));
    });
}

for (const [ticker, config] of Object.entries(targets)) {
    const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
    if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.priceHistory = generateSeries(config);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`Backfilled ${ticker} with ${data.priceHistory.length} points.`);
    }
}
