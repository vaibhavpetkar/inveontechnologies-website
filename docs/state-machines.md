# State Machines — Phase 0 (MVP scope)

Only the entities in scope for the initial release (see `decisions.md` #1) are defined here. Payment, employee-lifecycle, and course/certificate state machines will be added in their own phases.

## Opportunity

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Published: publish
    Published --> Archived: archive
    Draft --> Archived: archive
    Published --> Published: edit (non-breaking fields only)
```

## Application

```mermaid
stateDiagram-v2
    [*] --> Submitted
    Submitted --> UnderReview: admin/manager opens
    UnderReview --> AssessmentInvited: send assessment
    AssessmentInvited --> AssessmentCompleted: candidate submits
    AssessmentCompleted --> Shortlisted: pass/manual pick
    AssessmentCompleted --> Rejected: fail/manual reject
    UnderReview --> Rejected: reject directly
    Shortlisted --> Selected: admin approval
    Shortlisted --> Rejected: reject
    Submitted --> Withdrawn: candidate withdraws
    UnderReview --> Withdrawn: candidate withdraws
```

## Assessment attempt

```mermaid
stateDiagram-v2
    [*] --> NotStarted
    NotStarted --> InProgress: candidate starts (server sets expiry)
    InProgress --> Submitted: candidate submits before expiry
    InProgress --> Expired: server-side expiry reached
    Submitted --> Scored: server-side scoring completes
    Expired --> Scored: partial/zero score per rules
```

## Rules that apply across all three

1. Transitions are enforced **server-side only** — the API rejects any transition not in this table, regardless of what the client sends.
2. Every transition writes an audit log entry (`actor`, `from`, `to`, `timestamp`, `reason` where applicable).
3. Terminal states (`Archived`, `Rejected`, `Selected`, `Withdrawn`, `Scored`) are not re-openable through normal API calls — only through an explicit, audited admin override, if that's ever needed.
