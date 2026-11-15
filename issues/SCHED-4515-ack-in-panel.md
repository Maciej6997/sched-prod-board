---
id: SCHED-4515
title: Ack moves from the row to an incident panel
status: done
plan: R2 (changed), R1
---

Product, after the step-1 recording (00:09: pointer on INC-1586's Ack, INC-2135 landed at the top, the click acked
INC-4606): "New incidents stay live at the top. Ack leaves the row: a row opens its incident panel, and Ack lives there."

- Clicking a row (or Enter/Space on it) opens the incident panel (`data-testid="incident-panel"`), which names the incident id.
- The panel's Ack (`data-testid="panel-ack"`) acks the panel's incident by id, then shows "<id> acked hh:mm:ss"; the row gets `acked`.
- Rows have no `ack` button. New incidents stay live at the top (no "new" bar). Rows are never removed.

Acceptance: the course's replay (nonce checks a, e, f, h, i, j) passes against the deployed board.
