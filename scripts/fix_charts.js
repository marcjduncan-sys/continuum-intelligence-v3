#!/usr/bin/env node
/**
 * fix_charts.js
 * 
 * Fetches 1-year historical price data from Yahoo Finance 
 * to rectify stocks with short priceHistory.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');
const TICKERS = ['ASB', 'BRG', 'QBE']; // Audit results showed these were short

async function httpGet(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve({ body: data, headers: res.headers, statusCode: res.statusCode }));
        });
        req.on('error', reject);
    });
}

async function getYahooCrumb() {
    try {
        const consentRes = await httpGet('https://fc.yahoo.com/', { headers: { 'Accept': 'text/html' } });
        const cookies = consentRes.headers['set-cookie'] || [];
        const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

        const crumbRes = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', {
            headers: { 'Cookie': cookieStr, 'Accept': 'text/plain' }
        });
        return { crumb: crumbRes.body, cookies: cookieStr };
    } catch (e) {
        console.error('Failed to get crumb:', e.message);
        return { crumb: null, cookies: null };
    }
}

async function fetchHistory(ticker) {
    console.log(`Fetching history for ${ticker}...`);
    const yahooTicker = ticker + '.AX'; // ASX suffix
    const { crumb, cookies } = await getYahooCrumb();
    const range = '1y';
    const interval = '1d';
    const crumbParam = crumb ? `&crumb=${crumb}` : '';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?range=${range}&interval=${interval}&includePrePost=false${crumbParam}`;

    try {
        const res = await httpGet(url, { headers: { 'Cookie': cookies || '' } });
        const json = JSON.parse(res.body);
        const result = json.chart.result[0];
        const prices = result.indicators.adjclose[0].adjclose;
        const validPrices = prices.filter(p => p !== null).map(p => Math.round(p * 100) / 100);
        return validPrices;
    } catch (e) {
        console.error(`Failed to fetch ${ticker}:`, e.message);
        return null;
    }
}

async function run() {
    for (const ticker of TICKERS) {
        const prices = await fetchHistory(ticker);
        if (prices && prices.length >= 52) {
            console.log(`  Received ${prices.length} price points for ${ticker}.`);
            const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                data.priceHistory = prices;
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
                console.log(`  Updated ${filePath}`);
            }
        } else {
            console.log(`  [FAIL] Could not get valid history for ${ticker}`);
        }
    }
}

run();
