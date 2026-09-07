import type { BrowserSession } from '../../src/runtime/browser.ts';
import type { z } from 'zod';
import { Review } from '../../src/contracts.ts';
import { saveJson } from '../../src/runtime/files.ts';

type Finding = z.infer<typeof Review>['findings'][number];
export async function diagnose(session: BrowserSession) {
  const findings = new Map<string, Finding>();
  const observations: Record<string, unknown>[] = [];
  const coveredTargets: string[] = [];
  function finding(
    id: string,
    title: string,
    target: string,
    expected: string,
    actual: string,
    steps: string[],
    evidence: Finding['evidence'],
  ) {
    const existing = findings.get(id);
    if (existing) {
      existing.targets.push(target);
      existing.evidence.push(...evidence);
      return;
    }
    findings.set(id, {
      id,
      title,
      description: title + '. Verified against the base application.',
      reproduction: steps,
      expected,
      actual,
      targets: [target],
      evidence,
    });
  }
  for (const target of session.task.targets) {
    const states: Record<string, Record<string, unknown>> = {};
    for (const revision of ['base', 'candidate'] as const) {
      const action = (args: Record<string, unknown>) =>
        session.execute({ revision, target: target.id, ...args });
      await action({ action: 'navigate', path: '/' });
      const checkout = await action({ action: 'inspect', selector: '#checkout' });
      const checkoutImage = await action({ action: 'screenshot' });
      if (checkout.visible) await action({ action: 'click', selector: '#checkout' });
      await action({ action: 'fill', selector: '#quantity', value: '2' });
      const total = await action({ action: 'inspect', selector: '#total' });
      const totalImage = await action({ action: 'screenshot' });
      await action({ action: 'click', selector: '#help' });
      await action({ action: 'press', key: 'Escape' });
      const dialog = await action({ action: 'inspect', selector: '#delivery' });
      const dialogImage = await action({ action: 'screenshot' });
      if (dialog.visible) await action({ action: 'click', selector: '#close' });
      states[revision] = {
        checkout: checkout.visible,
        total: total.text,
        dialog: dialog.visible,
        checkoutImage: checkoutImage.artifact,
        totalImage: totalImage.artifact,
        dialogImage: dialogImage.artifact,
      };
      observations.push({ revision, target: target.id, ...states[revision] });
    }
    const { base, candidate } = states;
    if (base.checkout !== true || base.total !== '$24.00' || base.dialog !== false)
      throw new Error(`Oracle base failed on ${target.id}`);
    const images = (name: string) => [base[name], candidate[name]] as Finding['evidence'];
    if (candidate.checkout !== true)
      finding(
        'mobile-action-unavailable',
        'Checkout action disappears on the narrow viewport',
        target.id,
        'Customers can continue to checkout.',
        'The checkout button is hidden.',
        ['Open the ordering page at the affected viewport.', 'Inspect Continue to checkout.'],
        images('checkoutImage'),
      );
    if (candidate.total !== '$24.00')
      finding(
        'order-total-stale',
        'Changing quantity leaves the order total stale',
        target.id,
        'Two notebooks cost $24.00.',
        `The total remains ${candidate.total}.`,
        ['Set Quantity to 2.', 'Read the order total.'],
        images('totalImage'),
      );
    if (candidate.dialog !== false)
      finding(
        'escape-dismissal-broken',
        'Escape no longer dismisses delivery information',
        target.id,
        'Escape dismisses the dialog.',
        'The dialog remains open.',
        ['Open Delivery information.', 'Press Escape.'],
        images('dialogImage'),
      );
    coveredTargets.push(target.id);
  }
  return {
    review: Review.parse({ findings: [...findings.values()], limitations: [] }),
    observations,
    coveredTargets,
  };
}
