# Demo Bucket Configuration

*Generated on: 2026-01-18 14:24:06*

This document tracks the bucket and target configuration used in the demo.

---

## House Purchase Bucket

**Total Target Investment:** $200,000.00

**Total Actual Investment:** $169,854.13

**Total Returns:** $7,071.36 (+4.16%)

**Current value:** $176,925.49

**Time Horizon:** 1.0 year(s) (365 days)

### Goals Breakdown

| Goal | Target | Actual Investment | Returns | Return % | Current value |
|------|--------|-------------------|---------|----------|----------------|
| Core - Balanced | $140,000.00 | $122,215.72 | $6,702.31 | +5.80% | $128,918.03 |
| Megatrends | $20,000.00 | $16,034.20 | $219.66 | +1.39% | $16,253.86 |
| Tech | $20,000.00 | $15,027.72 | $-803.09 | -5.07% | $14,224.63 |
| China | $20,000.00 | $16,576.49 | $952.48 | +6.10% | $17,528.97 |

### Target Allocations

| Goal | Target % | Actual % | Target Amount | Actual Amount | Variance |
|------|----------|----------|---------------|---------------|----------|
| Core - Balanced | 70% | 71.95% | $140,000.00 | $122,215.72 | +1.95% |
| Megatrends | 10% | 9.44% | $20,000.00 | $16,034.20 | -0.56% |
| Tech | 10% | 8.85% | $20,000.00 | $15,027.72 | -1.15% |
| China | 10% | 9.76% | $20,000.00 | $16,576.49 | -0.24% |

### Time-Series Performance

| Goal | Start Date | End Date | Contribution Date | Data Points |
|------|------------|----------|-------------------|--------------|
| Core - Balanced | 2025-01-18 | 2026-01-17 | 2025-10-28 | 365 |
| Megatrends | 2025-01-18 | 2026-01-17 | 2025-10-26 | 365 |
| Tech | 2025-01-18 | 2026-01-17 | 2025-11-26 | 365 |
| China | 2025-01-18 | 2026-01-17 | 2025-11-05 | 365 |

---

## Retirement Bucket

**Total Target Investment:** $60,000.00

**Total Actual Investment:** $55,098.13

**Total Returns:** $7,742.07 (+14.05%)

**Current value:** $62,840.20

**Time Horizon:** 2.0 year(s) (730 days)

### Goals Breakdown

| Goal | Target | Actual Investment | Returns | Return % | Current value |
|------|--------|-------------------|---------|----------|----------------|
| Core - Aggressive | $33,000.00 | $33,454.81 | $7,072.67 | +26.81% | $40,527.48 |
| Megatrends | $9,000.00 | $9,599.74 | $2,460.42 | +34.46% | $12,060.16 |
| Tech | $9,000.00 | $6,632.48 | $-174.49 | -2.56% | $6,457.99 |
| China | $9,000.00 | $5,411.10 | $-1,616.53 | -23.00% | $3,794.57 |

### Target Allocations

| Goal | Target % | Actual % | Target Amount | Actual Amount | Variance |
|------|----------|----------|---------------|---------------|----------|
| Core - Aggressive | 55% | 60.72% | $33,000.00 | $33,454.81 | +5.72% |
| Megatrends | 15% | 17.42% | $9,000.00 | $9,599.74 | +2.42% |
| Tech | 15% | 12.04% | $9,000.00 | $6,632.48 | -2.96% |
| China | 15% | 9.82% | $9,000.00 | $5,411.10 | -5.18% |

### Time-Series Performance

| Goal | Start Date | End Date | Contribution Date | Data Points |
|------|------------|----------|-------------------|--------------|
| Core - Aggressive | 2024-01-19 | 2026-01-17 | 2025-12-01 | 730 |
| Megatrends | 2024-01-19 | 2026-01-17 | 2025-10-30 | 730 |
| Tech | 2024-01-19 | 2026-01-17 | 2025-11-29 | 730 |
| China | 2024-01-19 | 2026-01-17 | 2025-12-09 | 730 |

---

## Usage Notes

- All actual investments have realistic variance from targets (-8% to +10%) for demo realism
- Returns are randomized within specified ranges per goal type
- Time-series data includes bumpy/realistic market volatility patterns
- Each goal has a 25% contribution event in the final 90 days
- House Purchase bucket spans 1 year (365 days)
- Retirement bucket spans 2 years (730 days)
- Regenerate this file whenever running `generate-mock-data.py`
- Use this configuration as reference for future demo updates
