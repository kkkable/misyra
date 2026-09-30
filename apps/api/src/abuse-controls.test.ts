import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  abuseControlClasses,
  abuseControlEnforcement,
  aiGenerationLimits,
  routeAbuseControls,
  unversionedRouteAbuseControls,
} from './abuse-controls.js';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(sourceDirectory, '../../..');
const maximumBodyBytes = 12 * 1024 * 1024;

type DeclaredRoute = { key: string; isPublic: boolean };

function declaredRoutes(): DeclaredRoute[] {
  const routes: DeclaredRoute[] = [];
  const files = readdirSync(sourceDirectory).filter(
    (name) => /-routes?\.ts$/.test(name) && !name.includes('.test.'),
  );
  for (const name of files) {
    const source = ts.createSourceFile(
      name,
      readFileSync(join(sourceDirectory, name), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const properties = new Map<string, ts.Expression>();
        for (const property of node.properties) {
          if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
            properties.set(property.name.text, property.initializer);
          }
        }
        const method = properties.get('method');
        const path = properties.get('path');
        if (method !== undefined && path !== undefined && ts.isStringLiteralLike(method)) {
          let normalized: string;
          if (ts.isStringLiteralLike(path)) {
            normalized = path.text;
          } else if (ts.isTemplateExpression(path)) {
            normalized =
              path.head.text +
              path.templateSpans
                .map(
                  (span) =>
                    (ts.isIdentifier(span.expression) ? `:${span.expression.text}` : ':param') +
                    span.literal.text,
                )
                .join('');
          } else {
            throw new Error(
              `Dynamic route path in ${name} cannot be classified: ${path.getText(source)}`,
            );
          }
          routes.push({
            key: `${method.text} ${normalized}`,
            isPublic: properties.get('public')?.kind === ts.SyntaxKind.TrueKeyword,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return routes;
}

describe('MTS-110 abuse-control policy', () => {
  const routes = declaredRoutes();

  it('classifies exactly the routes the API declares, with no stale entries', () => {
    expect(routes.length).toBeGreaterThan(30);
    const declared = [...new Set(routes.map((route) => route.key))].sort();
    expect(Object.keys(routeAbuseControls).sort()).toEqual(declared);
  });

  it('classifies the unversioned health probes explicitly', () => {
    expect(Object.keys(unversionedRouteAbuseControls).sort()).toEqual([
      'GET /health/live',
      'GET /health/ready',
    ]);
  });

  it('gives every class a bounded window, rate, body size, and key', () => {
    for (const [name, control] of Object.entries(abuseControlClasses)) {
      expect(Number.isInteger(control.windowSeconds), `${name} window`).toBe(true);
      expect(control.windowSeconds, `${name} window`).toBeGreaterThanOrEqual(1);
      expect(control.windowSeconds, `${name} window`).toBeLessThanOrEqual(3600);
      expect(Number.isInteger(control.maxRequests), `${name} rate`).toBe(true);
      expect(control.maxRequests, `${name} rate`).toBeGreaterThanOrEqual(1);
      expect(control.maxRequests, `${name} rate`).toBeLessThanOrEqual(10_000);
      expect(Number.isInteger(control.maxBodyBytes), `${name} body`).toBe(true);
      expect(control.maxBodyBytes, `${name} body`).toBeGreaterThanOrEqual(0);
      expect(control.maxBodyBytes, `${name} body`).toBeLessThanOrEqual(maximumBodyBytes);
      expect(['ip', 'account', 'device', 'channel']).toContain(control.keyedBy);
    }
    for (const className of [
      ...Object.values(routeAbuseControls),
      ...Object.values(unversionedRouteAbuseControls),
    ]) {
      expect(abuseControlClasses).toHaveProperty(className);
    }
  });

  it('keeps public routes in strict, unauthenticated-safe classes and protected routes out of them', () => {
    const publicKeys = new Set(routes.filter((route) => route.isPublic).map((route) => route.key));
    expect([...publicKeys].sort()).toEqual([
      'GET /calendars/google/callback',
      'POST /auth/:provider/exchange',
      'POST /auth/refresh',
      'POST /auth/sign-out',
      'POST /webhooks/google-calendar',
    ]);
    for (const route of routes) {
      const className = routeAbuseControls[route.key as keyof typeof routeAbuseControls];
      const control = abuseControlClasses[className];
      if (route.isPublic) {
        expect(className, route.key).toMatch(/^public-/);
        expect(control.keyedBy, route.key).not.toBe('account');
        expect(control.maxRequests / (control.windowSeconds / 60), route.key).toBeLessThanOrEqual(
          120,
        );
      } else {
        expect(className, route.key).not.toMatch(/^public-/);
      }
    }
  });

  it('limits sensitive account operations more tightly than ordinary writes', () => {
    const perMinute = (name: keyof typeof abuseControlClasses) =>
      abuseControlClasses[name].maxRequests / (abuseControlClasses[name].windowSeconds / 60);
    expect(perMinute('account-sensitive')).toBeLessThan(perMinute('authenticated-write'));
    expect(routeAbuseControls['DELETE /account']).toBe('account-sensitive');
    expect(routeAbuseControls['POST /auth/reauthenticate']).toBe('account-sensitive');
  });

  it('bounds media uploads to the body limit the route already declares', () => {
    const mediaRoutes = readFileSync(join(sourceDirectory, 'protected-media-routes.ts'), 'utf8');
    expect(mediaRoutes).toContain('bodyLimit: 12 * 1024 * 1024');
    expect(routeAbuseControls['PUT /media/uploads/:token']).toBe('media-upload');
    expect(abuseControlClasses['media-upload'].maxBodyBytes).toBe(maximumBodyBytes);
    expect(abuseControlClasses['media-upload-authorization'].maxBodyBytes).toBeLessThanOrEqual(
      16 * 1024,
    );
  });

  it('caps AI usage at the approved product limits', () => {
    const technical = readFileSync(
      join(repoRoot, 'docs/specifications/technical-specification.md'),
      'utf8',
    );
    expect(technical).toContain('maximum three AI generation/regeneration requests per mission');
    expect(aiGenerationLimits.maxRequestsPerMission).toBe(3);
    expect(aiGenerationLimits.maxPlannerImages).toBe(3);
    for (const key of [
      'POST /stories/:draftId/image-generations',
      'POST /stories/:occurrenceId/text-suggestions',
      'POST /ai-planner/drafts/:draftId/extract',
      'POST /stories/style-profile/rebuild',
    ] as const) {
      expect(routeAbuseControls[key], key).toBe('ai-request');
    }
  });

  it('states truthfully that enforcement is declared here and delivered by MTS-111', () => {
    expect(abuseControlEnforcement).toEqual({
      status: 'declared-not-enforced',
      enforcedBy: 'MTS-111',
    });
  });
});
