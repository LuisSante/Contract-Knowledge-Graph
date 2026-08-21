# KG Metrics — worked example (Total & Intensity bars)

A fully worked example of the burden/benefit bars, computed by hand. For the
formulas and variable definitions see [`kg-metrics.md`](./kg-metrics.md).

## Given

**Severity weights (the user's sliders):** Obligation = **0.7** · Right = **0.3** ·
Prohibition = **1.0**

**The focused party P's statements** (PPR already computed). Each statement's
weight is $w = \text{PPR} \times \text{severity}$:

| id | kind | tone | PPR | severity | $w = \text{PPR}\times\text{sev}$ |
|----|------|------|-----|----------|------|
| A | obligation | **burden** | 0.20 | 0.7 | 0.20 × 0.7 = **0.14** |
| B | prohibition | **burden** | 0.10 | 1.0 | 0.10 × 1.0 = **0.10** |
| C | obligation | **burden** | 0.10 | 0.7 | 0.10 × 0.7 = **0.07** |
| D | right | **benefit** | 0.15 | 0.3 | 0.15 × 0.3 = **0.045** |
| E | right | **benefit** | 0.05 | 0.3 | 0.05 × 0.3 = **0.015** |

Burden = {A, B, C} → **3 statements**. Benefit = {D, E} → **2 statements**.

---

## TOTAL bar (sum)

Sum the weights on each side:

$$\text{Burden} = 0.14 + 0.10 + 0.07 = \mathbf{0.31}$$
$$\text{Benefit} = 0.045 + 0.015 = \mathbf{0.06}$$
$$\text{Total} = 0.31 + 0.06 = \mathbf{0.37}$$

Split into %:

$$\text{burden\%} = \frac{0.31}{0.37} = 0.838 \approx \mathbf{84\%}
\qquad
\text{benefit\%} = \frac{0.06}{0.37} \approx \mathbf{16\%}$$

> **Total: 84% / 16%**

---

## INTENSITY bar (each sum ÷ its count)

$$\text{Burden intensity} = \frac{0.31}{3} = \mathbf{0.1033}
\qquad
\text{Benefit intensity} = \frac{0.06}{2} = \mathbf{0.03}$$

Sum of intensities: $0.1033 + 0.03 = 0.1333$

Split into %:

$$\text{burden\%} = \frac{0.1033}{0.1333} = 0.775 \approx \mathbf{78\%}
\qquad
\text{benefit\%} = \frac{0.03}{0.1333} \approx \mathbf{22\%}$$

> **Intensity: 78% / 22%**

---

## Both bars

| Bar | Burden | Benefit |
|---|---|---|
| **Total** | 84% | 16% |
| **Intensity** | 78% | 22% |

**Reading:** P is burdened (84%). Removing the count, it stays burdened (78%) — the
**6-point gap** says a little comes from having more burdens (3 vs 2), but the bulk
is **weight**: each burden (obligations / prohibition) is worth more than each
benefit (rights at 0.3).
