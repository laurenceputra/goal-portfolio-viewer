# Fundsupermart Extension Discovery (Option 2)

## Confirmed Decisions

- Primary outcome: support quarterly rebalancing and reduce over-concentration.
- Out of scope for initial version: transaction-level analytics and performance attribution (possible future work, potentially via third-party data).
- Drift model: by specific assets (individual stocks/funds).
- Drift alerting:
  - relative thresholds
  - tiered severities
  - severity bands are user-defined globally and applied per holding
- Rebalancing outputs: show both percentage drift and estimated amount to buy/sell.
- Funding-source tagging:
  - granularity: per holding/instrument
  - tag model: user-defined free-text tags
  - cardinality: exactly one tag per instrument
  - assignment: manual only
- Portfolio scope: one account.
- Delivery form: same userscript (platform-agnostic adapter path / Option 2).
- UX:
  - entry point uses existing chart trigger button behavior
  - default FSM screen should be drift dashboard first
  - tag editing via modal bulk-edit with side-panel editor
  - show trigger button only on `https://secure.fundsupermart.com/fsmone/holdings/investments`
  - hide trigger button on unsupported FSM pages
- Sync and privacy:
  - tags should sync
  - actual holding amounts should **not** sync
  - guiding principle: do not share users’ actual financial data


## Scope Boundaries (What this spec does NOT cover)

To keep FSM Option 2 v1 focused and implementable, the following are explicitly out of scope for this spec:

1. **Transaction-level analytics and performance attribution**
   - No lot-level analytics, attribution models, or third-party enrichment pipelines in this version.

2. **Order execution / broker integration**
   - The script provides advisory drift and trade amount suggestions only.
   - It will not place orders, route trades, or automate execution.

3. **Multi-account aggregation**
   - No combining multiple FSM accounts in this spec; single-account view only.

4. **Non-SGD analytics modes**
   - No dual-currency reporting modes in v1.
   - Amount-based logic is standardized to SGD (`*Lcy`) fields.

5. **Syncing financial or personal raw data**
   - No syncing of holdings amounts, units, P/L, transaction history, or personal identifiers.
   - Sync remains configuration-only.

6. **Backend contract redesign**
   - No mandatory server API changes are required for v1 compatibility.
   - Optional backend hardening is tracked separately and is non-blocking.

7. **Expanded FSM route coverage**
   - No trigger support outside the confirmed holdings investments route in this version.

8. **Alternative identity-key frameworks**
   - No symbol/ISIN/name-matching strategy rollout in v1 unless a proven collision issue requires a dedicated follow-up spec.

## FSM Integration Inputs (Confirmed)

### UI route to enable button

- Enable overlay trigger only on:
  - `https://secure.fundsupermart.com/fsmone/holdings/investments`

### API to intercept

- Intercept holdings API response:
  - `https://secure.fundsupermart.com/fsmone/rest/holding/client/protected/find-holdings-with-pnl`

### API response model

- Top-level shape:

```json
{
  "data": [
    {
      "refno": "xxxx",
      "holdings": [{}, {}, {}]
    }
  ]
}
```

- Each item in `holdings` is one instrument/position row.
- Include all `productType` values **except** `DPMS_HEADER` (filtered out for now).


### Field usage from holdings objects

The FSM holdings payload contains many fields; for Option 2 we only use a strict subset. Amount-based analytics are standardized to SGD using `*Lcy` fields where available.

**Used in v1 UI/calculations**

- `productType`:
  - include row when value is not `DPMS_HEADER`
- `code`:
  - primary instrument key for targets/tags/sync mapping
- `name`:
  - display label in tables/modals
- `currentValueLcy`:
  - SGD holding value used in actual weight, drift, and buy/sell recommendation calculations
- `currentUnits`:
  - optional display column for units (not used in drift math)
- `profitValueLcy`, `profitPercentLcy`:
  - optional display-only P/L context in SGD if we keep P/L columns in FSM table
- `costLcy`, `weightedAverageSgd`:
  - optional display-only cost context in SGD

**Used as optional fallback/metadata (not primary key)**

- `msInstrumentId`:
  - secondary diagnostic identifier only
- `exchange`:
  - optional display context

**Ignored in v1 logic (not required for drift + tagging)**

- account/client identity fields: `nric`, `clientNricName`, `refno`
- transaction/cost decomposition fields not required for drift math: `cost`, `costSgd`, `weightedAverage`, `totalInvestmentAmountLcy`
- FX decomposition fields: `conversionRate`, `latestPreferCurrencyRate`, `currencyGain`, `currencyGainPercentage`
- duplicate reporting fields where not needed for current model: `currentPrice`, `currentPriceLcy`, `currentValue`, `profitValue`, `profitPercent`, `capitalGain`, `capitalGainPercentage`
- operational/platform fields: `accountType`, `agentType`, `customizedMapsEnabled`, `subCode`, `assetAllocation`, `geoAllocation`, `assetAllocationCode`, `geoAllocationCode`, `paymentMethod`, `currencyCode`, `preferCurrencyCode`, `withReportingCurrencyValue`, `distributePlatform`

**Sync/privacy rule applied to these fields**

- No amount-bearing fields from holdings payload are synced.
- No personal identifiers (`nric`, `clientNricName`, `refno`) are synced.
- Only user configuration keyed by `code` is synced (targets, fixed flags, tags, drift settings).

### Identity key decision

- Use `code` as primary instrument identifier for configuration mapping (targets + tags).
- Keep `name` as display label.
- If needed for diagnostics/fallback only, retain `msInstrumentId` as secondary metadata but do not depend on it for v1 identity.

## Proposed Rules and Formulas

### 1) Drift Formula (relative)

For each holding `i` (using `currentValueLcy` as the holding value source):

- `actualWeight_i = holdingValueLcy_i / totalPortfolioValueLcy`
- `relativeDrift_i = (actualWeight_i - targetWeight_i) / targetWeight_i`
- `driftPct_i = relativeDrift_i * 100`

Interpretation:
- Positive drift = overweight vs target
- Negative drift = underweight vs target

`targetWeight_i = 0` edge case:
- If `actualWeight_i = 0`, drift is `0%`
- If `actualWeight_i > 0`, treat as **new/untargeted position** and mark as `+∞` drift for severity handling (non-finite sentinel in model; UI label like "Untargeted")

### 2) Severity Bands

- Applied **per holding**.
- Configured as **global user-defined bands** (e.g., warning >= 10%, critical >= 20% in absolute drift terms).
- Severity logic uses absolute relative drift: `abs(driftPct_i)`.

### 3) Targets Setup

- Targets are **manual**.
- Drift UI is gated until targets exist.
- Initial setup helper can prefill each holding target using current portfolio weight rounded to nearest whole percentage.

### 4) Holding Identity and Migration

- Primary identity key: `code`.
- Display name key: `name`.
- If an asset disappears, migration is manual via mapping/edit flow.

### 5) Buy/Sell Recommendation Basis (v1 proposal)

- Use latest portfolio market value snapshot only.
- Ignore transaction fees/slippage and execution constraints in v1.
- Recommendation amount per holding:
  - `targetValueLcy_i = targetWeight_i * totalPortfolioValueLcy`
  - `tradeAmountLcy_i = targetValueLcy_i - holdingValueLcy_i`
  - positive = buy, negative = sell

### 6) Sync Privacy Proposal

To uphold "do not share users’ actual financial data", sync payload should include only configuration metadata and exclude all live financial values.

**Sync-allowed fields**:
- drift settings:
  - global severity thresholds
  - formula mode/version identifier
- targets:
  - per-instrument target percentage keyed by `code`
  - target lock/fixed-state flags
- tagging:
  - user-defined tag catalog (names)
  - per-instrument tag assignment keyed by `code` (one tag)
- UX preferences:
  - selected dashboard defaults
  - modal/editor preferences as needed

**Sync-excluded fields**:
- actual amounts/market values
- unit quantities
- cost basis / average price
- realized/unrealized P&L values
- computed drift outputs (recomputable locally)
- transaction history
- personally identifying values (`nric`, `clientNricName`, `refno`)


## Sync Compatibility and Multi-Platform Strategy

### Is current sync server compatible?

Yes, with a userscript payload/schema update.

- Current backend stores opaque `encryptedData` plus metadata (`userId`, `deviceId`, `timestamp`, `version`) and does not inspect decrypted config fields.
- Because of that design, we can support Endowus + FSM in one sync account by changing client-side config structure only.

### How to sync Endowus and FSM in the same sync account

Use a **platform-namespaced config envelope** inside encrypted payload, e.g.:

```json
{
  "version": 2,
  "platforms": {
    "endowus": {
      "goalTargets": {},
      "goalFixed": {},
      "timestamp": 0
    },
    "fsm": {
      "targetsByCode": {},
      "fixedByCode": {},
      "tagsByCode": {},
      "tagCatalog": [],
      "driftSettings": {
        "warningPct": 10,
        "criticalPct": 20
      },
      "timestamp": 0
    }
  },
  "metadata": {
    "lastModified": 0
  }
}
```

- Keep one sync user/account.
- Store both platforms under separate keys so data does not overwrite each other.
- Continue excluding amount-bearing and PII fields from the FSM namespace.

### Required changes: userscript

1. **Sync schema bump and migration**
   - Bump sync config `version` from 1 to 2.
   - Add read migration from v1 (`goalTargets`/`goalFixed`) into `platforms.endowus`.
   - Preserve backward compatibility when reading older payloads.

2. **Platform-aware collect/apply**
   - Replace single `collectConfigData()` output with namespaced output based on active data stores.
   - Apply only relevant namespace on each platform page while preserving the other namespace in storage.

3. **FSM storage key namespace**
   - Add new local keys for FSM config (`fsm_target_*`, `fsm_fixed_*`, `fsm_tag_*`, `fsm_tag_catalog`, `fsm_drift_settings`).
   - Keep all financial values out of sync payload; only config metadata is synced.

4. **Conflict resolution updates**
   - Compare timestamps per platform namespace to reduce unnecessary conflicts when only one platform changed.

5. **UI copy updates**
   - Sync settings text should state that Endowus + FSM preferences are both synced in one account, with financial amounts never synced.

### Required changes: backend (Workers)

**Required for production cross-origin sync:** update CORS allowlist to include FSM origin.

- Existing upload/download contract remains generic encrypted blob storage; no schema-level parsing is required server-side.
- However, browser requests from `https://secure.fundsupermart.com` require explicit CORS allowlist support.
- Worker CORS handling must evaluate request `Origin` against an allowlist and echo only allowed origins (do not return comma-separated origins in `Access-Control-Allow-Origin`).

**Required backend updates for this spec**
1. Add FSM origin (`https://secure.fundsupermart.com`) alongside Endowus in `CORS_ORIGINS` configuration.
2. Update CORS header builder to support multi-origin allowlist parsing and per-request origin resolution.
3. Add tests for allowed FSM origin and disallowed origin behavior.

**Recommended hardening (optional)**
- Add server-side max payload guardrail review for v2 envelope growth.
- Track config version usage metrics (`version: 1` vs `version: 2`) in logs/telemetry if available.

## Remaining Questions (Spec Gaps)

1. **Data capture reliability validation**
   - Confirm API interception is consistently available for authenticated sessions across expected browsers and FSM page transitions.

## Option 2 Direction (Confirmed)

Proceed with a platform-agnostic model adapter so Endowus and FSM can map into a shared portfolio schema, while preserving privacy-first local processing.
