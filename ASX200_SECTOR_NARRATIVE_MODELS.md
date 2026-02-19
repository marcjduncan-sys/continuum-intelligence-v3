# ASX 200 Sector Narrative Models: Complete Taxonomy

**Date:** 19 February 2026
**Status:** Authoritative specification. Companion to SECTION02_REDESIGN.md.
**Purpose:** Define the sector/sub-sector factor models for every GICS classification represented in the ASX 200, enabling any stock to be onboarded without bespoke analysis.

---

## Architecture Summary

Every stock in the ASX 200 is assigned to a **Narrative Model** based on its GICS sub-industry. Each Narrative Model defines:

1. **Primary Sector Factor(s)** – the external variable(s) that drive the sector narrative
2. **Data Source** – where to fetch the factor daily (Yahoo Finance ticker or API)
3. **Default Weights** – starting w_macro / w_sector / w_idio split (calibrated by regression later)
4. **Threshold Table** – maps factor values to the -100 to +100 Sector Signal
5. **Breakeven Applicability** – whether the Operating Leverage panel applies
6. **Sector Narrative Template** – the display panel structure

A stock inherits its Narrative Model from its sub-sector classification. The developer onboards a new stock by: (1) looking up GICS sub-industry, (2) assigning the corresponding model, (3) adding any company-specific overrides (e.g. breakeven price). No bespoke design required.

---

## GICS Sector 10: ENERGY

### Model: ENERGY_OIL_GAS

**Applies to:** Oil & Gas Exploration/Production, Integrated Oil & Gas, Oil & Gas Refining
**ASX 200 examples:** WDS, STO, KAR, BPT, CVN

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Brent Crude | BZ=F | Yahoo Finance |
| WTI Crude | CL=F | Yahoo Finance |
| JKM LNG (Asia spot) | Proxy via natural gas futures or manual | Platts/manual |
| AUD/USD | AUDUSD=X | Yahoo Finance |

**Default Weights:** w_macro = 0.15, w_sector = 0.55, w_idio = 0.30
**Breakeven:** Yes. Each stock requires breakeven_usd_boe in config.

**Threshold Table (Brent, USD/bbl):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < 45 | -80 |
| Bearish | 45 – 60 | -30 |
| Neutral | 60 – 75 | 0 |
| Bullish | 75 – 90 | +40 |
| Strong Bullish | > 90 | +70 |

**Narrative Template:**
```
SECTOR NARRATIVE: ENERGY – OIL & GAS
Brent: $XX.XX (Δ5d, Δ1mo) [ZONE]
WTI: $XX.XX
AUD/USD: X.XXXX (Δ1mo)
Breakeven: $XX/boe | Margin: XX% | Sensitivity: +$1/bbl ≈ +$XXM FCF
Commodity Zone: [gauge visual]
```

### Model: ENERGY_COAL

**Applies to:** Coal & Consumable Fuels
**ASX 200 examples:** WHC, NHC, YAL

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Newcastle Thermal Coal | MTF=F or proxy | Yahoo Finance / manual |
| Premium Hard Coking Coal | Manual | Platts/manual |
| AUD/USD | AUDUSD=X | Yahoo Finance |

**Default Weights:** w_macro = 0.15, w_sector = 0.55, w_idio = 0.30
**Breakeven:** Yes. Distinguish thermal vs met coal producers.

**Threshold Table (Newcastle Thermal, USD/t):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < 80 | -80 |
| Bearish | 80 – 120 | -30 |
| Neutral | 120 – 160 | 0 |
| Bullish | 160 – 220 | +40 |
| Strong Bullish | > 220 | +70 |

### Model: ENERGY_URANIUM

**Applies to:** Uranium mining and nuclear fuel
**ASX 200 examples:** PDN, BOE, LOT (if included)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Uranium spot (U3O8) | UX=F or proxy | Numerco / manual |
| Long-term contract price | Manual | UxC / TradeTech |

**Default Weights:** w_macro = 0.10, w_sector = 0.55, w_idio = 0.35
**Breakeven:** Yes, but many are development-stage. Flag confidence level.

**Threshold Table (U3O8 spot, USD/lb):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < 40 | -80 |
| Bearish | 40 – 60 | -30 |
| Neutral | 60 – 80 | 0 |
| Bullish | 80 – 100 | +40 |
| Strong Bullish | > 100 | +70 |

---

## GICS Sector 15: MATERIALS

### Model: MATERIALS_IRON_ORE

**Applies to:** Iron ore miners
**ASX 200 examples:** FMG, RIO (primary), BHP (partial), MIN, CIA

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Iron Ore 62% Fe CFR China | TIO=F | Yahoo Finance |
| China steel PMI | Manual proxy | NBS/Caixin |
| AUD/USD | AUDUSD=X | Yahoo Finance |

**Default Weights:** w_macro = 0.10, w_sector = 0.60, w_idio = 0.30
**Breakeven:** Yes. C1 cash cost USD/wmt.

**Threshold Table (62% Fe, USD/dmt):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < 70 | -80 |
| Bearish | 70 – 90 | -30 |
| Neutral | 90 – 110 | 0 |
| Bullish | 110 – 130 | +40 |
| Strong Bullish | > 130 | +70 |

### Model: MATERIALS_GOLD

**Applies to:** Gold miners and explorers
**ASX 200 examples:** NST, EVN, NEM, HRZ, RMS, GOR, CMM, DEG

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Gold USD | GC=F | Yahoo Finance |
| Gold AUD | Derived: GC=F / AUDUSD=X | Calculated |
| AUD/USD | AUDUSD=X | Yahoo Finance |
| US real yields (10yr TIPS) | ^TNX minus breakeven | Derived |

**Default Weights:** w_macro = 0.10, w_sector = 0.60, w_idio = 0.30
**Breakeven:** Yes. AISC in AUD/oz. Flag pre-production as LOW confidence.

**Threshold Table (Gold AUD, AUD/oz):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < 2,500 | -80 |
| Bearish | 2,500 – 3,000 | -30 |
| Neutral | 3,000 – 3,500 | 0 |
| Bullish | 3,500 – 4,500 | +40 |
| Strong Bullish | > 4,500 | +70 |

**Note:** Gold thresholds should be reviewed annually as the nominal price level shifts. These are calibrated to the 2025/26 environment.

### Model: MATERIALS_COPPER

**Applies to:** Copper miners
**ASX 200 examples:** OZL (acquired), SFR (if included), 29M, BHP (partial), RIO (partial)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Copper LME | HG=F | Yahoo Finance |
| AUD/USD | AUDUSD=X | Yahoo Finance |
| China manufacturing PMI | Manual | NBS |

**Default Weights:** w_macro = 0.10, w_sector = 0.55, w_idio = 0.35
**Breakeven:** Yes. C1 cost USD/lb.

**Threshold Table (Copper, USD/lb):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < 3.00 | -80 |
| Bearish | 3.00 – 3.75 | -30 |
| Neutral | 3.75 – 4.25 | 0 |
| Bullish | 4.25 – 5.00 | +40 |
| Strong Bullish | > 5.00 | +70 |

### Model: MATERIALS_LITHIUM

**Applies to:** Lithium miners
**ASX 200 examples:** PLS, IGO, LTR, AKE (Arcadium, if still listed), MIN (partial)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Lithium carbonate (China spot) | Manual | Fastmarkets / Asian Metal |
| Spodumene concentrate | Manual | Fastmarkets |
| AUD/USD | AUDUSD=X | Yahoo Finance |
| EV sales growth | Monthly proxy | Bloomberg NEF / manual |

**Default Weights:** w_macro = 0.10, w_sector = 0.60, w_idio = 0.30
**Breakeven:** Yes. Unit cost per tonne (spodumene or carbonate equivalent).

**Threshold Table (Spodumene 6%, USD/t):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < 600 | -80 |
| Bearish | 600 – 900 | -30 |
| Neutral | 900 – 1,200 | 0 |
| Bullish | 1,200 – 1,800 | +40 |
| Strong Bullish | > 1,800 | +70 |

### Model: MATERIALS_ALUMINA_ALUMINIUM

**Applies to:** Alumina refiners, aluminium smelters
**ASX 200 examples:** AWC, S32 (partial)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Aluminium LME | ALI=F or proxy | Yahoo Finance |
| Alumina spot | Manual | Platts |
| AUD/USD | AUDUSD=X | Yahoo Finance |

**Default Weights:** w_macro = 0.10, w_sector = 0.55, w_idio = 0.35
**Breakeven:** Yes.

### Model: MATERIALS_RARE_EARTHS

**Applies to:** Rare earths miners
**ASX 200 examples:** LYC

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| NdPr oxide price | Manual | Shanghai Metals Market / Asian Metal |
| China export policy | Event-driven | Manual |

**Default Weights:** w_macro = 0.10, w_sector = 0.50, w_idio = 0.40
**Breakeven:** Yes, but pricing is opaque.

### Model: MATERIALS_DIVERSIFIED_MINING

**Applies to:** Multi-commodity diversified miners
**ASX 200 examples:** BHP, RIO, S32

**Primary Factors:** Uses a weighted composite of the stock's revenue-weighted commodity exposures.

```
For BHP: 0.50 x Iron Ore Signal + 0.25 x Copper Signal + 0.15 x Coal Signal + 0.10 x Other
For RIO: 0.60 x Iron Ore Signal + 0.20 x Aluminium Signal + 0.15 x Copper Signal + 0.05 x Other
For S32: 0.35 x Alumina Signal + 0.25 x Aluminium Signal + 0.20 x Copper Signal + 0.20 x Manganese
```

**Default Weights:** w_macro = 0.15, w_sector = 0.45, w_idio = 0.40
**Breakeven:** Per-commodity, or blended. Config requires revenue_commodity_split.

### Model: MATERIALS_CHEMICALS_PACKAGING

**Applies to:** Chemicals, explosives, packaging, building materials
**ASX 200 examples:** ORA, AMC, IPL, JHX, BLD, ABC, CSR

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AU building approvals | ABS monthly | ABS / manual |
| US housing starts (JHX) | Monthly | FRED / manual |
| Natural gas (feedstock for IPL) | NG=F | Yahoo Finance |
| AUD/USD | AUDUSD=X | Yahoo Finance |

**Default Weights:** w_macro = 0.20, w_sector = 0.25, w_idio = 0.55
**Breakeven:** No. Not applicable for manufacturers/packagers.

---

## GICS Sector 20: INDUSTRIALS

### Model: INDUSTRIALS_INFRASTRUCTURE

**Applies to:** Toll roads, airports, ports
**ASX 200 examples:** TCL, SYD, QAN (partial)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AU 10yr bond yield | Proxy ^GSPC or RBA | RBA / manual |
| Traffic volumes | Quarterly | Company disclosures |
| CPI (toll escalation) | ABS quarterly | ABS |

**Default Weights:** w_macro = 0.25, w_sector = 0.25, w_idio = 0.50
**Breakeven:** No. These are yield/duration instruments.

**Sector Signal:** Rate-sensitive model (see Financials Banks model pattern). Rising yields negative, falling yields positive. CPI escalation a structural positive for concession assets.

### Model: INDUSTRIALS_ENGINEERING_CONSTRUCTION

**Applies to:** Engineering, construction, contracting
**ASX 200 examples:** CIM, DOW, WOR, MND, NWH, LYL

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Mining capex cycle | Proxy: commodity prices composite | Derived |
| AU infrastructure pipeline | Government budget data | Manual / quarterly |
| Oil & gas capex (WOR) | Brent proxy | BZ=F |

**Default Weights:** w_macro = 0.20, w_sector = 0.25, w_idio = 0.55
**Breakeven:** No.

### Model: INDUSTRIALS_TRANSPORT_LOGISTICS

**Applies to:** Rail, logistics, shipping
**ASX 200 examples:** AZJ, BXB, QAN, SEK

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Fuel cost (oil) | BZ=F | Yahoo Finance |
| Global trade volumes | Baltic Dry Index BDI proxy | Manual |
| AUD/USD | AUDUSD=X | Yahoo Finance |
| Consumer confidence | Westpac-Melbourne Institute | Manual monthly |

**Default Weights:** w_macro = 0.20, w_sector = 0.20, w_idio = 0.60
**Breakeven:** No.

### Model: INDUSTRIALS_DEFENCE

**Applies to:** Defence technology, military contractors
**ASX 200 examples:** DRO, EOS, LYL (partial)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AU defence budget trajectory | Annual / event-driven | Government announcements |
| Geopolitical risk index | GPR or proxy | Manual |

**Default Weights:** w_macro = 0.10, w_sector = 0.15, w_idio = 0.75
**Breakeven:** No. Narrative is contract-driven.

### Model: INDUSTRIALS_GENERAL

**Applies to:** Catch-all for industrial conglomerates, services, equipment
**ASX 200 examples:** REH, SHL (partial), IPH, IEL

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| ASX 200 index | ^AXJO | Yahoo Finance |
| AU GDP growth | ABS quarterly | ABS |

**Default Weights:** w_macro = 0.20, w_sector = 0.10, w_idio = 0.70
**Breakeven:** No.

---

## GICS Sector 25: CONSUMER DISCRETIONARY

### Model: CONSUMER_DISC_RETAIL

**Applies to:** Discretionary retail (apparel, electronics, homewares, auto)
**ASX 200 examples:** HVN, JBH, LOV, SUL, PMV, KMD, WEB, FLT, ALL, TAH

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| RBA cash rate | Event-driven | RBA |
| Consumer confidence | Westpac-Melbourne Institute | Monthly |
| Retail sales growth | ABS monthly | ABS |
| Unemployment rate | ABS monthly | ABS |

**Default Weights:** w_macro = 0.25, w_sector = 0.20, w_idio = 0.55
**Breakeven:** No.

**Threshold Table (Consumer Confidence Index):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < 80 | -60 |
| Bearish | 80 – 90 | -25 |
| Neutral | 90 – 100 | 0 |
| Bullish | 100 – 110 | +25 |
| Strong Bullish | > 110 | +60 |

**Sector Signal:** Composite of rate trajectory (40% weight), consumer confidence (30%), retail sales momentum (30%).

### Model: CONSUMER_DISC_GAMING

**Applies to:** Gaming technology, casinos
**ASX 200 examples:** ALL, TAH, SLC, SGR

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Consumer discretionary spending | ABS | ABS |
| Regulatory environment | Event-driven | Manual |
| Global gaming market | Proxy via US peers | Manual |

**Default Weights:** w_macro = 0.20, w_sector = 0.15, w_idio = 0.65
**Breakeven:** No.

### Model: CONSUMER_DISC_TRAVEL

**Applies to:** Travel, tourism, online travel
**ASX 200 examples:** QAN, FLT, WEB, CTD, HLO

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Jet fuel price | Proxy via BZ=F | Yahoo Finance |
| AUD/USD (outbound travel) | AUDUSD=X | Yahoo Finance |
| Consumer confidence | Westpac-Melbourne Institute | Monthly |
| Immigration/tourism arrivals | ABS quarterly | ABS |

**Default Weights:** w_macro = 0.25, w_sector = 0.20, w_idio = 0.55
**Breakeven:** No. But fuel hedging and capacity utilisation are key idiosyncratic factors.

### Model: CONSUMER_DISC_RESTAURANTS_QSR

**Applies to:** Quick-service restaurants, food franchising
**ASX 200 examples:** GYG, RFG, DMP (if included)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Consumer confidence | Westpac-Melbourne Institute | Monthly |
| Food CPI | ABS quarterly | ABS |
| Wage growth | ABS quarterly | ABS |

**Default Weights:** w_macro = 0.15, w_sector = 0.10, w_idio = 0.75
**Breakeven:** No.

---

## GICS Sector 30: CONSUMER STAPLES

### Model: CONSUMER_STAPLES_GROCERY

**Applies to:** Supermarkets, grocery distribution
**ASX 200 examples:** WOW, COL, MTS

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Food CPI | ABS quarterly | ABS |
| Consumer confidence | Westpac-Melbourne Institute | Monthly |
| Population growth | ABS | ABS |

**Default Weights:** w_macro = 0.15, w_sector = 0.15, w_idio = 0.70
**Breakeven:** No. Defensive sector. Low external sensitivity.

### Model: CONSUMER_STAPLES_AGRI

**Applies to:** Agriculture, food production, wine, dairy
**ASX 200 examples:** GNC, ELD, TWE, ING, AAC

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Relevant commodity (wheat, cattle, wine grape) | Varies | Manual |
| AUD/USD (export competitiveness) | AUDUSD=X | Yahoo Finance |
| Rainfall / drought index | BOM | Manual |

**Default Weights:** w_macro = 0.15, w_sector = 0.30, w_idio = 0.55
**Breakeven:** Partial. Farm-gate cost vs commodity price for pure producers.

### Model: CONSUMER_STAPLES_BEVERAGE_TOBACCO

**Applies to:** Beverages, tobacco
**ASX 200 examples:** EDV (Endeavour)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Consumer spending | ABS | ABS |
| Excise/regulation | Event-driven | Manual |

**Default Weights:** w_macro = 0.15, w_sector = 0.10, w_idio = 0.75
**Breakeven:** No.

---

## GICS Sector 35: HEALTH CARE

### Model: HEALTHCARE_DEVICES_MEDTECH

**Applies to:** Medical devices, diagnostic equipment, health tech
**ASX 200 examples:** PME, COH, RMD, FPH, NAN, IME

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AUD/USD (USD-denominated revenue) | AUDUSD=X | Yahoo Finance |
| NASDAQ Composite (peer valuation) | ^IXIC | Yahoo Finance |
| US healthcare policy | Event-driven | Manual |

**Default Weights:** w_macro = 0.15, w_sector = 0.10, w_idio = 0.75
**Breakeven:** No. These are growth/execution stories.

### Model: HEALTHCARE_PHARMA_BIOTECH

**Applies to:** Pharmaceuticals, biotechnology
**ASX 200 examples:** CSL, MSB, NVX, IMU

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AUD/USD | AUDUSD=X | Yahoo Finance |
| NASDAQ Biotech Index | ^NBI | Yahoo Finance |
| FDA/TGA regulatory pipeline | Event-driven | Manual |

**Default Weights:** w_macro = 0.15, w_sector = 0.10, w_idio = 0.75
**Breakeven:** No. Binary risk events (trial results) dominate.

### Model: HEALTHCARE_SERVICES

**Applies to:** Hospital operators, pathology, aged care
**ASX 200 examples:** RHC, SHL, HLS, REG

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Medicare indexation rate | Event-driven | Government |
| Aged care funding | Event-driven | Government |
| Labour cost growth (nurses, GPs) | ABS quarterly | ABS |

**Default Weights:** w_macro = 0.20, w_sector = 0.20, w_idio = 0.60
**Breakeven:** No.

### Model: HEALTHCARE_PHARMACY

**Applies to:** Pharmacy retail, PBS dispensing
**ASX 200 examples:** SIG, API

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| PBS policy changes | Event-driven | Government |
| Script volumes | Monthly (Phrm Guild) | Manual |

**Default Weights:** w_macro = 0.15, w_sector = 0.15, w_idio = 0.70
**Breakeven:** No.

---

## GICS Sector 40: FINANCIALS

### Model: FINANCIALS_MAJOR_BANKS

**Applies to:** Big 4 banks, regional banks
**ASX 200 examples:** CBA, NAB, WBC, ANZ, BOQ, BEN, MQG (partial)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| RBA cash rate | Event-driven | RBA |
| AU 10yr bond yield | AU10Y or proxy | RBA / Yahoo Finance |
| Yield curve (10yr minus 2yr) | Derived | Calculated |
| System credit growth | APRA monthly | APRA |
| Unemployment rate | ABS monthly | ABS |

**Default Weights:** w_macro = 0.25, w_sector = 0.35, w_idio = 0.40
**Breakeven:** No. NIM sensitivity is the key metric (akin to breakeven).

**Threshold Table (RBA Rate Trajectory):**
| Scenario | Score Component |
|----------|----------------|
| Aggressive cutting (>75bp ahead) | +40 (initially positive for valuations) |
| Gradual cutting (25-75bp ahead) | +25 |
| On hold | 0 |
| Gradual hiking | -25 |
| Aggressive hiking | -40 (NIM positive but credit quality risk) |

**Yield curve scoring:**
| Spread (10yr - 2yr) | Score Component |
|---------------------|----------------|
| > +100bp | +30 (strong NIM tailwind) |
| +50 to +100bp | +15 |
| 0 to +50bp | 0 |
| -50 to 0bp (inverted) | -20 |
| < -50bp (deeply inverted) | -35 |

**Sector Signal = Rate Score (0.40) + Curve Score (0.30) + Credit Score (0.30)**

### Model: FINANCIALS_INSURERS

**Applies to:** General and life insurers
**ASX 200 examples:** QBE, IAG, SUN, MPL

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AU 10yr bond yield (investment returns) | As above | RBA |
| Catastrophe events | Event-driven | Manual |
| Premium cycle | Manual (hard/soft) | Broker reports |

**Default Weights:** w_macro = 0.20, w_sector = 0.25, w_idio = 0.55
**Breakeven:** No. Combined ratio is the key operating metric.

### Model: FINANCIALS_DIVERSIFIED_ASSET_MGMT

**Applies to:** Asset managers, fund platforms, diversified financials
**ASX 200 examples:** MQG, MFG, PPT, NWL, HUB, NTH, GQG, PNI, CGF, IFL

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| ASX 200 index level (AUM proxy) | ^AXJO | Yahoo Finance |
| Net fund flows | Monthly/quarterly | Company disclosures |
| RBA cash rate | Event-driven | RBA |

**Default Weights:** w_macro = 0.25, w_sector = 0.20, w_idio = 0.55
**Breakeven:** No.

### Model: FINANCIALS_PAYMENTS_FINTECH

**Applies to:** Payments, buy-now-pay-later, fintech
**ASX 200 examples:** (varies with index composition)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Consumer spending volumes | ABS / RBA card data | Monthly |
| NASDAQ (tech valuation) | ^IXIC | Yahoo Finance |
| Regulatory changes | Event-driven | Manual |

**Default Weights:** w_macro = 0.20, w_sector = 0.15, w_idio = 0.65
**Breakeven:** No.

---

## GICS Sector 45: INFORMATION TECHNOLOGY

### Model: IT_SOFTWARE_SAAS

**Applies to:** Enterprise software, SaaS, cloud
**ASX 200 examples:** XRO, WTC, TNE, ALU, PME (dual), OCL, MP1, NXT, FCL

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| NASDAQ Composite | ^IXIC | Yahoo Finance |
| AUD/USD (offshore revenue translation) | AUDUSD=X | Yahoo Finance |
| SaaS valuation multiples | Proxy: BVP Cloud Index or NASDAQ | Manual |
| US 10yr yield (growth stock discount rate) | ^TNX | Yahoo Finance |

**Default Weights:** w_macro = 0.20, w_sector = 0.20, w_idio = 0.60
**Breakeven:** No. Rule of 40 (revenue growth + FCF margin) is the key efficiency metric.

**Threshold Table (NASDAQ 20-day momentum, %):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | < -10% | -50 |
| Bearish | -10% to -3% | -20 |
| Neutral | -3% to +3% | 0 |
| Bullish | +3% to +10% | +20 |
| Strong Bullish | > +10% | +50 |

**Note:** Tech stocks also have high sensitivity to US 10yr yield moves. Rising yields compress growth multiples.

### Model: IT_HARDWARE_SEMICONDUCTOR

**Applies to:** Hardware, semiconductor, data centres
**ASX 200 examples:** NXT (data centres), BRN (chips)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| NASDAQ / SOX (Philadelphia Semi Index) | ^IXIC / ^SOX | Yahoo Finance |
| AUD/USD | AUDUSD=X | Yahoo Finance |

**Default Weights:** w_macro = 0.20, w_sector = 0.25, w_idio = 0.55
**Breakeven:** No.

---

## GICS Sector 50: COMMUNICATION SERVICES

### Model: COMMS_TELCO

**Applies to:** Telecommunications carriers
**ASX 200 examples:** TLS, TPG

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| RBA cash rate (yield alternative) | RBA | RBA |
| AU 10yr bond yield | As above | RBA |
| ARPU trends | Quarterly | Company disclosures |

**Default Weights:** w_macro = 0.20, w_sector = 0.15, w_idio = 0.65
**Breakeven:** No. These are yield/infrastructure plays.

### Model: COMMS_MEDIA_DIGITAL

**Applies to:** Media, advertising, digital platforms
**ASX 200 examples:** REA, CAR, SEK, NWS, NEC, SWM, OML

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Advertising spend cycle | Manual | Industry reports |
| Consumer confidence | Westpac-Melbourne Institute | Monthly |
| Employment (classifieds proxy) | ABS monthly | ABS |
| AUD/USD (for global platforms) | AUDUSD=X | Yahoo Finance |

**Default Weights:** w_macro = 0.20, w_sector = 0.15, w_idio = 0.65
**Breakeven:** No.

---

## GICS Sector 55: UTILITIES

### Model: UTILITIES_INTEGRATED_ENERGY

**Applies to:** Electricity generators, gas distributors, integrated utilities
**ASX 200 examples:** AGL, ORG, APA, AST, SKI

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| Wholesale electricity price (AU) | AEMO or proxy | AEMO / manual |
| AU natural gas price | East coast hub or proxy | Manual |
| RBA cash rate (yield comparison) | RBA | RBA |
| Renewable energy certificates (LGC/STC) | Manual | CER |

**Default Weights:** w_macro = 0.20, w_sector = 0.30, w_idio = 0.50
**Breakeven:** Partial. Generation cost vs wholesale price for gentailers.

### Model: UTILITIES_RENEWABLES

**Applies to:** Pure renewable energy developers/operators
**ASX 200 examples:** (varies – some under Industrials/Utilities)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| PPA pricing | Manual | Industry |
| LGC price | Manual | CER |
| AU 10yr yield (project finance cost) | As above | RBA |

**Default Weights:** w_macro = 0.15, w_sector = 0.30, w_idio = 0.55
**Breakeven:** Partial. LCOE vs PPA rate.

---

## GICS Sector 60: REAL ESTATE

### Model: REIT_INDUSTRIAL

**Applies to:** Industrial/logistics REITs
**ASX 200 examples:** GMG, CIP, CLW

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AU 10yr bond yield (cap rate driver) | As above | RBA |
| Industrial vacancy rates | JLL / CBRE quarterly | Manual |
| E-commerce growth (logistics demand) | ABS retail / proxy | Manual |

**Default Weights:** w_macro = 0.20, w_sector = 0.30, w_idio = 0.50
**Breakeven:** No. NTA discount/premium and cap rate spread are key metrics.

**Threshold Table (AU 10yr yield change, 3-month, bps):**
| Zone | Range | Position Score |
|------|-------|----------------|
| Strong Bearish | > +50bp | -60 |
| Bearish | +20 to +50bp | -25 |
| Neutral | -20 to +20bp | 0 |
| Bullish | -50 to -20bp | +25 |
| Strong Bullish | < -50bp | +60 |

**Note:** REIT sensitivity to yields is *inverse*. Rising yields = bearish. The score is inverted relative to banks.

### Model: REIT_RETAIL

**Applies to:** Retail property REITs
**ASX 200 examples:** SCG, VCX, GPT (partial), SGP (partial)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AU 10yr bond yield | As above | RBA |
| Retail sales growth | ABS monthly | ABS |
| Retail vacancy rates | JLL / CBRE quarterly | Manual |

**Default Weights:** w_macro = 0.25, w_sector = 0.25, w_idio = 0.50
**Breakeven:** No.

### Model: REIT_OFFICE

**Applies to:** Office REITs
**ASX 200 examples:** DXS, CHC, GPT (partial)

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| AU 10yr bond yield | As above | RBA |
| CBD office vacancy | JLL / CBRE quarterly | Manual |
| White collar employment | ABS | ABS |
| Work-from-home structural shift | Qualitative | Manual |

**Default Weights:** w_macro = 0.25, w_sector = 0.25, w_idio = 0.50
**Breakeven:** No.

### Model: REIT_DIVERSIFIED

**Applies to:** Diversified REITs with mixed portfolios
**ASX 200 examples:** GPT, MGR, SGP, BWP, NSR, ARF, HMC

**Uses:** Blended REIT model. Weights determined by portfolio asset mix (e.g. 60% industrial, 40% retail would use 0.60 x REIT_INDUSTRIAL signal + 0.40 x REIT_RETAIL signal).

**Default Weights:** w_macro = 0.25, w_sector = 0.25, w_idio = 0.50

---

## FALLBACK MODEL: COMPANY_DOMINANT

**Applies to:** Any stock where no strong sector factor exists, or where the GICS classification maps to a sub-sector with minimal external driver concentration.

**This is the default.** If a stock's sub-industry does not map to any model above, or the sector factor has low explanatory power (R-squared < 0.15), assign this model.

**Primary Factors:**
| Factor | Ticker | Source |
|--------|--------|--------|
| ASX 200 index | ^AXJO | Yahoo Finance |

**Default Weights:** w_macro = 0.20, w_sector = 0.05, w_idio = 0.75
**Breakeven:** No.
**Sector Narrative Panel:** Minimal. Show only the macro context bar and a one-line sector note.

---

## Onboarding Process: Adding a New Stock

When adding any new ASX 200 stock to the platform:

```
STEP 1: Look up the stock's GICS sub-industry classification
         Source: ASX company directory CSV (asx.com.au) or Bloomberg

STEP 2: Map GICS sub-industry to Narrative Model using this table:
         Energy E&P                    → ENERGY_OIL_GAS
         Coal & Consumable Fuels       → ENERGY_COAL
         Gold                          → MATERIALS_GOLD
         Diversified Metals & Mining   → MATERIALS_DIVERSIFIED_MINING
         Iron & Steel (iron ore focus) → MATERIALS_IRON_ORE
         Copper                        → MATERIALS_COPPER
         Lithium                       → MATERIALS_LITHIUM
         Aluminium                     → MATERIALS_ALUMINA_ALUMINIUM
         Rare Earths                   → MATERIALS_RARE_EARTHS
         Chemicals / Packaging         → MATERIALS_CHEMICALS_PACKAGING
         Banks                         → FINANCIALS_MAJOR_BANKS
         Insurance                     → FINANCIALS_INSURERS
         Asset Management              → FINANCIALS_DIVERSIFIED_ASSET_MGMT
         Software & Services           → IT_SOFTWARE_SAAS
         Telecom Services              → COMMS_TELCO
         Media                         → COMMS_MEDIA_DIGITAL
         Equity REITs (Industrial)     → REIT_INDUSTRIAL
         Equity REITs (Retail)         → REIT_RETAIL
         Equity REITs (Office)         → REIT_OFFICE
         Equity REITs (Diversified)    → REIT_DIVERSIFIED
         Healthcare Equipment          → HEALTHCARE_DEVICES_MEDTECH
         Pharma & Biotech              → HEALTHCARE_PHARMA_BIOTECH
         Healthcare Services           → HEALTHCARE_SERVICES
         Retailing (Discretionary)     → CONSUMER_DISC_RETAIL
         Food Retail                   → CONSUMER_STAPLES_GROCERY
         Utilities                     → UTILITIES_INTEGRATED_ENERGY
         (Anything else)               → COMPANY_DOMINANT

STEP 3: Create stock config JSON with:
         {
           "ticker": "XXX",
           "gics_sub_industry": "...",
           "narrative_model": "MODEL_ID",
           "narrative_weights": {
             "macro": <from model default>,
             "sector": <from model default>,
             "idio": <from model default>
           },
           "commodity_overlay": {
             // Only if model has breakeven = Yes
             "primary_commodity": "...",
             "breakeven": <number>,
             "breakeven_unit": "...",
             "breakeven_source": "...",
             "breakeven_confidence": "HIGH" | "MEDIUM" | "LOW",
             "thresholds": <from model threshold table>
           },
           "revenue_commodity_split": {
             // Only for MATERIALS_DIVERSIFIED_MINING
             "iron_ore": 0.50,
             "copper": 0.25,
             // etc.
           }
         }

STEP 4: If the stock is unusual or doesn't fit its sub-industry model:
         - Override narrative_weights manually
         - Add notes explaining the override
         - Flag for regression calibration at next monthly review

STEP 5: Regression calibration (monthly, or on first add if >60 days history):
         Run: R_stock = alpha + beta_mkt * R_ASX200 + beta_sector * R_factor + epsilon
         Update narrative_weights with actual R-squared decomposition.
```

---

## Data Pipeline: Daily Commodity/Macro Fetches

All sector models draw from a common data file updated daily:

**File:** `data/macro-factors.json`

```json
{
  "date": "2026-02-19",
  "market": {
    "asx200": { "close": 8450, "change_1d": 0.003, "change_5d": 0.012, "change_20d": 0.023 },
    "vix": { "close": 18.5 },
    "asx200_rsi_14": 55
  },
  "rates": {
    "rba_cash": 4.10,
    "rba_trajectory": "cutting",
    "au_2yr": 3.85,
    "au_10yr": 4.35,
    "yield_curve_2s10s": 0.50,
    "us_10yr": 4.28
  },
  "fx": {
    "aud_usd": { "close": 0.6340, "change_5d": -0.005, "change_20d": -0.012 },
    "aud_cny": { "close": 4.62 }
  },
  "commodities": {
    "brent": { "close": 72.40, "change_5d": -0.021, "change_20d": -0.083, "unit": "USD/bbl", "ticker": "BZ=F" },
    "wti": { "close": 68.10, "change_5d": -0.019, "change_20d": -0.075, "unit": "USD/bbl", "ticker": "CL=F" },
    "iron_ore_62": { "close": 108.50, "change_5d": -0.015, "change_20d": -0.042, "unit": "USD/dmt", "ticker": "TIO=F" },
    "gold_usd": { "close": 2920, "change_5d": 0.031, "change_20d": 0.087, "unit": "USD/oz", "ticker": "GC=F" },
    "gold_aud": { "close": 4610, "change_5d": 0.043, "change_20d": 0.101, "unit": "AUD/oz", "derived": true },
    "copper": { "close": 4.35, "change_5d": 0.008, "change_20d": -0.012, "unit": "USD/lb", "ticker": "HG=F" },
    "aluminium": { "close": 2580, "change_5d": 0.005, "change_20d": 0.022, "unit": "USD/t", "ticker": "ALI=F" },
    "nat_gas": { "close": 3.85, "change_5d": 0.015, "change_20d": -0.035, "unit": "USD/mmBtu", "ticker": "NG=F" },
    "thermal_coal": { "close": 140, "change_5d": -0.010, "change_20d": -0.025, "unit": "USD/t", "source": "manual" },
    "coking_coal": { "close": 210, "change_5d": -0.005, "change_20d": -0.018, "unit": "USD/t", "source": "manual" },
    "uranium": { "close": 78, "change_5d": 0.012, "change_20d": 0.045, "unit": "USD/lb", "source": "manual" },
    "lithium_spod": { "close": 850, "change_5d": 0.020, "change_20d": 0.035, "unit": "USD/t", "source": "manual" },
    "lithium_carb": { "close": 11500, "change_5d": 0.015, "change_20d": 0.030, "unit": "USD/t", "source": "manual" }
  },
  "macro": {
    "china_mfg_pmi": { "value": 50.8, "date": "2026-01-31", "source": "NBS" },
    "au_unemployment": { "value": 4.1, "date": "2026-01-31", "source": "ABS" },
    "consumer_confidence": { "value": 92.3, "date": "2026-02-15", "source": "Westpac-MI" },
    "au_building_approvals_yoy": { "value": 0.035, "date": "2026-01-31", "source": "ABS" },
    "system_credit_growth_yoy": { "value": 0.052, "date": "2026-01-31", "source": "APRA" }
  }
}
```

**Fetch schedule:**
- **Automated (daily, 7:00 AM AEST via GitHub Action):** All Yahoo Finance tickers (commodities, FX, indices, yields)
- **Semi-automated (weekly/monthly):** Manual data points (uranium, lithium, coal, macro indicators) updated when published
- **Event-driven:** RBA rate decisions, APRA data, ABS releases

**Missing data handling:** If a data point cannot be fetched, use prior day's value and flag `"stale": true`. If stale > 5 days, degrade the sector weight by 50% (increase idio weight correspondingly) and display amber warning on the sector panel.

---

## Weight Calibration: The Regression Process

### Initial Deployment

Use the default weights from each Narrative Model. These are informed estimates based on market knowledge and will be approximately correct for most stocks.

### Monthly Regression (automated, run on 1st of each month)

For each stock with >= 60 trading days of history:

```python
import statsmodels.api as sm
import pandas as pd

# Load daily returns
stock_returns = get_daily_returns(ticker, window=60)
asx200_returns = get_daily_returns('^AXJO', window=60)
sector_returns = get_daily_returns(sector_ticker, window=60)

# Run regression
X = pd.DataFrame({
    'market': asx200_returns,
    'sector': sector_returns
})
X = sm.add_constant(X)
model = sm.OLS(stock_returns, X).fit()

# Decompose R-squared
total_r2 = model.rsquared

# Partial R2 for market alone
model_mkt = sm.OLS(stock_returns, sm.add_constant(asx200_returns)).fit()
r2_mkt = model_mkt.rsquared

# Incremental R2 from sector
r2_sector = total_r2 - r2_mkt
r2_idio = 1 - total_r2

# Normalise to weights (floor at 0.05 for any component)
raw = {'macro': max(r2_mkt, 0.05), 'sector': max(r2_sector, 0.05), 'idio': max(r2_idio, 0.05)}
total = sum(raw.values())
weights = {k: round(v / total, 2) for k, v in raw.items()}

# Blend with priors (70% regression, 30% model default) to avoid overfitting
final_weights = {
    k: round(0.70 * weights[k] + 0.30 * default_weights[k], 2)
    for k in weights
}
```

### Override Rules

- If regression w_sector < 0.10 for a stock in a Tier 1 commodity model, flag for manual review (the model classification may be wrong)
- If regression w_idio > 0.90, the stock may need reclassification to COMPANY_DOMINANT
- Never let w_macro + w_sector > 0.85 (minimum 15% idiosyncratic – every company has some company-specific risk)
- Never let w_idio < 0.15 for the same reason

---

## Handling Multi-Segment Companies

Some ASX 200 companies operate across multiple GICS sub-industries. Examples:

- **WES (Wesfarmers):** Retail (Bunnings, Kmart, Officeworks) + Chemicals (WesCEF) + Industrial (Blackwoods)
- **BHP:** Iron ore + Copper + Coal + Potash
- **RIO:** Iron ore + Aluminium + Copper + Minerals
- **MQG:** Investment banking + Asset management + Commodities trading

**Rule:** Use the segment responsible for >50% of EBIT as the primary model. If no segment exceeds 50%, create a blended model using EBIT-weighted signals from relevant sub-models.

```json
{
  "ticker": "WES",
  "narrative_model": "BLENDED",
  "blend": [
    { "model": "CONSUMER_DISC_RETAIL", "weight": 0.65, "basis": "Bunnings + Kmart + Officeworks EBIT" },
    { "model": "MATERIALS_CHEMICALS_PACKAGING", "weight": 0.20, "basis": "WesCEF EBIT" },
    { "model": "INDUSTRIALS_GENERAL", "weight": 0.15, "basis": "Industrial & Safety" }
  ]
}
```

The Sector Signal for a blended stock is:
```
Sector_Signal = sum(blend_weight_i x Sector_Signal_i for each sub-model)
```

---

## Version Control and Thresholds Maintenance

### Annual Review

Commodity threshold tables must be reviewed annually. As structural price levels shift (e.g. gold moving from $1,800 to $2,900 over 2023-2025), the threshold bands must be recalibrated to remain meaningful.

**Trigger for review:** If a commodity has sustained a >30% move in any direction over 12 months, flag all threshold tables using that commodity for manual recalibration.

### Adding New Sub-Sector Models

If a new GICS sub-industry gains representation in the ASX 200 that is not covered above, create a new Narrative Model following this template:

```
1. Identify the 1-3 primary external factors
2. Find daily-frequency data sources (Yahoo Finance preferred)
3. Set default weights (estimate R-squared from first principles)
4. Build threshold table (5 zones from strong bearish to strong bullish)
5. Determine if breakeven analysis applies
6. Write the narrative panel template
7. Add to the onboarding mapping table
```

---

## Summary Statistics

| Count | Description |
|-------|------------|
| 11 | GICS sectors covered |
| 30+ | Narrative Models defined |
| 1 | Fallback model (COMPANY_DOMINANT) |
| ~15 | Daily automated data feeds required |
| ~10 | Manual/semi-automated data feeds |
| 200 | Stocks supportable without new model development |
