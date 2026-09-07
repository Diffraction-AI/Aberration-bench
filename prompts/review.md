Review the proposed application change as a user would experience it. Inspect the
provided source diff and product context, then use the supplied browser capabilities
to explore important user flows on both the base and candidate applications.

Identify actionable visual or interaction regressions introduced by this change.
Check all requested browser/viewport targets. Prioritize flows affected by the diff,
while looking for consequences beyond the directly edited element. Compare behavior
with the base before attributing a defect to the change. Do not modify the application
to repair or expose a suspected defect.

A change may contain no regressions, one regression, or multiple regressions. Report
only substantiated problems. Follow supplied product rules; personal style preferences
are not defects. Group the same underlying regression across affected targets into
one finding. Existing problems unrelated to the change belong in limitations.

For every finding, provide the user impact, concrete reproduction steps, expected
and observed behavior, affected targets, and references to captured evidence.
Screenshots may establish static problems; timing, motion and transient issues need
appropriate recorded evidence. Record what you actually observed, not what source
inspection suggests probably happens. State incomplete coverage and uncertainty.

Return a JSON object conforming to the supplied review schema. Evidence paths refer
to artifacts saved through the provided capture mechanism. Use an empty findings
array when there are no substantiated regressions. Finish within the supplied time
and cost profile, keeping partial evidence available if the attempt is interrupted.
